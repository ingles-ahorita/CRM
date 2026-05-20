-- Activity feed for Management Dashboard (admin Activity tab)
-- Run once in Supabase SQL Editor. No demo data.
-- If you ran an older version of this file, drop table platform_events first or skip duplicate policies.
-- After run: confirm Realtime includes platform_events (migration tries ALTER PUBLICATION).

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  category text NOT NULL DEFAULT 'system',
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')),
  priority smallint NOT NULL DEFAULT 1 CHECK (priority >= 0 AND priority <= 3),
  summary text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id text,
  actor_display text,
  entity_type text,
  entity_id text,
  lead_id uuid,
  call_id uuid,
  lead_name text,
  lead_email text,
  source text NOT NULL DEFAULT 'crm',
  dedupe_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_events_dedupe_key_idx
  ON platform_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_events_occurred_at_idx
  ON platform_events (occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS platform_events_severity_occurred_idx
  ON platform_events (severity, occurred_at DESC)
  WHERE severity = 'error';

CREATE INDEX IF NOT EXISTS platform_events_lead_id_idx
  ON platform_events (lead_id, occurred_at DESC);

ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_events_select_authenticated" ON platform_events;
DROP POLICY IF EXISTS "platform_events_insert_authenticated" ON platform_events;
DROP POLICY IF EXISTS "platform_events_insert_service" ON platform_events;
DROP POLICY IF EXISTS "platform_events_select_anon" ON platform_events;

CREATE POLICY "platform_events_select_anon"
  ON platform_events FOR SELECT
  TO anon, authenticated
  USING (true);

-- Inserts come from SECURITY DEFINER triggers / service role only
CREATE POLICY "platform_events_service_all"
  ON platform_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Realtime (if publication exists; safe to run once)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE platform_events;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Insert helper (triggers) ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.insert_platform_event(
  p_event_type text,
  p_category text,
  p_severity text,
  p_priority integer,
  p_summary text,
  p_actor_type text DEFAULT 'system',
  p_actor_display text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_call_id uuid DEFAULT NULL,
  p_lead_name text DEFAULT NULL,
  p_lead_email text DEFAULT NULL,
  p_source text DEFAULT 'crm',
  p_dedupe_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_summary IS NULL OR btrim(p_summary) = '' THEN
    RETURN;
  END IF;
  IF p_dedupe_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM platform_events WHERE dedupe_key = p_dedupe_key
  ) THEN
    RETURN;
  END IF;
  INSERT INTO platform_events (
    event_type, category, severity, priority, summary,
    actor_type, actor_display, entity_type, entity_id,
    lead_id, call_id, lead_name, lead_email, source, dedupe_key, metadata
  ) VALUES (
    p_event_type, p_category, p_severity, p_priority::smallint, p_summary,
    p_actor_type, p_actor_display, p_entity_type, p_entity_id,
    p_lead_id, p_call_id, p_lead_name, p_lead_email, p_source, p_dedupe_key, p_metadata
  );
END;
$$;

-- ── calls ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_calls_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_email text;
  v_summary text;
  v_field text;
  v_old text;
  v_new text;
BEGIN
  v_name := COALESCE(NEW.name, '');
  v_email := COALESCE(NEW.email, '');

  IF TG_OP = 'INSERT' THEN
    PERFORM insert_platform_event(
      'call.created', 'booking', 'info', 2,
      'Call booked — ' || COALESCE(NULLIF(v_name, ''), NULLIF(v_email, ''), 'Lead'),
      'system', 'CRM', 'call', NEW.id::text,
      NEW.lead_id, NEW.id, NULLIF(v_name, ''), NULLIF(v_email, ''),
      'crm', 'call:created:' || NEW.id::text,
      jsonb_build_object('href', '/management?tab=leads')
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOREACH v_field IN ARRAY ARRAY['confirmed', 'showed_up', 'purchased', 'cancelled', 'setter_id', 'closer_id'] LOOP
      IF to_jsonb(OLD) -> v_field IS DISTINCT FROM to_jsonb(NEW) -> v_field THEN
        v_old := COALESCE((to_jsonb(OLD) ->> v_field), 'null');
        v_new := COALESCE((to_jsonb(NEW) ->> v_field), 'null');
        v_summary := 'Call ' || v_field || ': ' || v_old || ' → ' || v_new
          || ' — ' || COALESCE(NULLIF(v_name, ''), NULLIF(v_email, ''), 'Lead');
        PERFORM insert_platform_event(
          CASE WHEN v_field = 'confirmed' AND v_new IN ('true', 't') THEN 'call.confirmed' ELSE 'call.status_changed' END,
          'booking', 'info', 2,
          v_summary,
          'system', 'CRM', 'call', NEW.id::text,
          NEW.lead_id, NEW.id, NULLIF(v_name, ''), NULLIF(v_email, ''),
          'crm', 'call:' || NEW.id::text || ':' || v_field || ':' || v_new,
          jsonb_build_object(
            'href', '/management?tab=leads',
            'changes', jsonb_build_array(jsonb_build_object('field', v_field, 'old', v_old, 'new', v_new))
          )
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_calls_tr ON calls;
CREATE TRIGGER platform_events_calls_tr
  AFTER INSERT OR UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_calls_fn();

-- ── outcome_log ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_outcome_log_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_name text;
  v_email text;
BEGIN
  SELECT c.name, c.email, c.lead_id INTO v_name, v_email, v_lead_id
  FROM calls c WHERE c.id = NEW.call_id LIMIT 1;
  v_name := COALESCE(v_name, '');
  v_email := COALESCE(v_email, '');

  PERFORM insert_platform_event(
    'outcome.recorded', 'sale',
    CASE WHEN NEW.outcome = 'refund' THEN 'warning' ELSE 'info' END,
    3,
    'Outcome: ' || COALESCE(NEW.outcome, '?') || ' — ' || COALESCE(NULLIF(v_name, ''), NULLIF(v_email, ''), 'Lead'),
    'system', 'CRM', 'outcome', NEW.id::text,
    v_lead_id, NEW.call_id, NULLIF(v_name, ''), NULLIF(v_email, ''),
    'crm', 'outcome:' || NEW.id::text,
    jsonb_build_object('outcome', NEW.outcome, 'href', '/management?tab=leads')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_outcome_log_tr ON outcome_log;
CREATE TRIGGER platform_events_outcome_log_tr
  AFTER INSERT ON outcome_log
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_outcome_log_fn();

-- ── transfer_log ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_transfer_log_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_call_name text;
  v_call_email text;
  v_from_name text;
  v_to_name text;
BEGIN
  SELECT c.name, c.email, c.lead_id INTO v_call_name, v_call_email, v_lead_id
  FROM calls c WHERE c.id = NEW.call_id LIMIT 1;
  SELECT name INTO v_from_name FROM setters WHERE id = NEW.from_setter_id;
  SELECT name INTO v_to_name FROM setters WHERE id = NEW.to_setter_id;

  PERFORM insert_platform_event(
    'lead.transferred', 'team', 'info', 2,
    'Transfer ' || COALESCE(v_from_name, '?') || ' → ' || COALESCE(v_to_name, '?')
      || ' — ' || COALESCE(v_call_name, v_call_email, 'Lead'),
    'system', 'CRM', 'transfer', NEW.id::text,
    v_lead_id, NEW.call_id, v_call_name, v_call_email,
    'crm', 'transfer:' || NEW.id::text,
    jsonb_build_object('href', '/management?tab=leads')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_transfer_log_tr ON transfer_log;
CREATE TRIGGER platform_events_transfer_log_tr
  AFTER INSERT ON transfer_log
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_transfer_log_fn();

-- ── function_errors ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_function_errors_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM insert_platform_event(
    'integration.error', 'error', 'error', 3,
    COALESCE(NEW.function_name, 'Error') || ' — ' || left(COALESCE(NEW.error_message, 'Unknown'), 120),
    'system', COALESCE(NEW.source, 'CRM'), 'error', NEW.id::text,
    NULL, NULL, NULL, NULL,
    'crm', 'function_error:' || NEW.id::text,
    jsonb_build_object('function_name', NEW.function_name, 'source', NEW.source)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_function_errors_tr ON function_errors;
CREATE TRIGGER platform_events_function_errors_tr
  AFTER INSERT ON function_errors
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_function_errors_fn();

-- ── leads (Kajabi link) ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_leads_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id AND NEW.customer_id IS NOT NULL THEN
    PERFORM insert_platform_event(
      'lead.kajabi_linked', 'system', 'info', 2,
      'Kajabi customer linked — ' || COALESCE(NEW.name, NEW.email, 'Lead'),
      'system', 'CRM', 'lead', NEW.id::text,
      NEW.id, NULL, NEW.name, NEW.email,
      'crm', 'lead:kajabi:' || NEW.id::text || ':' || NEW.customer_id::text,
      jsonb_build_object('customer_id', NEW.customer_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_leads_tr ON leads;
CREATE TRIGGER platform_events_leads_tr
  AFTER UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_leads_fn();

-- ── offers ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_offers_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  v_label := COALESCE(NEW.name, NEW.kajabi_id::text, 'Offer');
  IF TG_OP = 'INSERT' THEN
    PERFORM insert_platform_event(
      'offer.created', 'system', 'info', 1,
      'Offer created — ' || v_label,
      'system', 'CRM', 'offer', NEW.id::text,
      NULL, NULL, NULL, NULL, 'crm', 'offer:created:' || NEW.id::text, '{}'::jsonb
    );
  ELSIF TG_OP = 'UPDATE' AND (OLD.active IS DISTINCT FROM NEW.active OR OLD.price IS DISTINCT FROM NEW.price) THEN
    PERFORM insert_platform_event(
      'offer.updated', 'system', 'info', 1,
      'Offer updated — ' || v_label,
      'system', 'CRM', 'offer', NEW.id::text,
      NULL, NULL, NULL, NULL, 'crm', 'offer:updated:' || NEW.id::text || ':' || floor(extract(epoch from now()))::text,
      jsonb_build_object('active', NEW.active, 'price', NEW.price)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_offers_tr ON offers;
CREATE TRIGGER platform_events_offers_tr
  AFTER INSERT OR UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_offers_fn();

-- ── app_settings ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_app_settings_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.value IS DISTINCT FROM NEW.value THEN
    PERFORM insert_platform_event(
      'settings.updated', 'system', 'info', 1,
      CASE NEW.key
        WHEN 'monthly_revenue_goal_usd' THEN
          'Admin updated the monthly revenue goal from $'
            || trim(to_char(OLD.value, 'FM999,999,999'))
            || ' to $'
            || trim(to_char(NEW.value, 'FM999,999,999'))
        ELSE
          'Admin updated setting ' || COALESCE(NEW.key, 'key')
            || ' from ' || OLD.value::text || ' to ' || NEW.value::text
      END,
      'system', 'Admin', 'setting', NEW.key,
      NULL, NULL, NULL, NULL, 'crm', 'setting:' || NEW.key || ':' || floor(extract(epoch from now()))::text,
      jsonb_build_object('key', NEW.key, 'old_value', OLD.value, 'new_value', NEW.value)
    );
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM insert_platform_event(
      'settings.updated', 'system', 'info', 1,
      CASE NEW.key
        WHEN 'monthly_revenue_goal_usd' THEN
          'Admin set the monthly revenue goal to $'
            || trim(to_char(NEW.value, 'FM999,999,999'))
        ELSE
          'Admin set setting ' || COALESCE(NEW.key, 'key') || ' to ' || NEW.value::text
      END,
      'system', 'Admin', 'setting', NEW.key,
      NULL, NULL, NULL, NULL, 'crm', 'setting:insert:' || NEW.key,
      jsonb_build_object('key', NEW.key, 'new_value', NEW.value)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_app_settings_tr ON app_settings;
CREATE TRIGGER platform_events_app_settings_tr
  AFTER INSERT OR UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_app_settings_fn();

-- ── login_events ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_login_events_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM insert_platform_event(
    CASE WHEN NEW.success IS TRUE THEN 'login.success' ELSE 'login.failed' END,
    'system',
    CASE WHEN NEW.success IS TRUE THEN 'info' ELSE 'warning' END,
    1,
    CASE WHEN NEW.success IS TRUE THEN 'Login' ELSE 'Failed login' END
      || ' — ' || COALESCE(NEW.email, 'unknown'),
    'user', NEW.email, 'login', NEW.id::text,
    NULL, NULL, NULL, NEW.email,
    'crm', 'login:' || NEW.id::text,
    jsonb_build_object('success', NEW.success)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_login_events_tr ON login_events;
CREATE TRIGGER platform_events_login_events_tr
  AFTER INSERT ON login_events
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_login_events_fn();

-- ── kajabi_purchases (new rows only) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_kajabi_purchases_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amt text;
BEGIN
  v_amt := CASE
    WHEN NEW.amount_in_cents IS NOT NULL THEN '$' || round(NEW.amount_in_cents::numeric / 100, 2)::text
    ELSE ''
  END;
  PERFORM insert_platform_event(
    'kajabi.purchase', 'sale', 'info', 3,
    'Kajabi purchase ' || v_amt || ' — customer ' || COALESCE(NEW.kajabi_customer_id::text, '?'),
    'system', 'Kajabi', 'purchase', NEW.kajabi_purchase_id,
    NULL, NULL, NULL, NULL,
    'kajabi', 'kajabi_purchase:' || NEW.kajabi_purchase_id,
    jsonb_build_object('offer_id', NEW.kajabi_offer_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_kajabi_purchases_tr ON kajabi_purchases;
CREATE TRIGGER platform_events_kajabi_purchases_tr
  AFTER INSERT ON kajabi_purchases
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_kajabi_purchases_fn();

-- ── kajabi_transactions (new charge/refund rows only) ───────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_kajabi_transactions_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amt text;
  v_action text;
BEGIN
  v_action := COALESCE(NEW.action, 'charge');
  v_amt := CASE
    WHEN NEW.amount_in_cents IS NOT NULL THEN '$' || round(abs(NEW.amount_in_cents)::numeric / 100, 2)::text
    ELSE ''
  END;
  PERFORM insert_platform_event(
    CASE WHEN v_action = 'refund' THEN 'kajabi.refund' ELSE 'kajabi.transaction' END,
    'sale',
    CASE WHEN v_action = 'refund' THEN 'warning' ELSE 'info' END,
    CASE WHEN v_action = 'refund' THEN 3 ELSE 2 END,
    'Kajabi ' || v_action || ' ' || v_amt || ' — tx ' || NEW.kajabi_transaction_id,
    'system', 'Kajabi', 'transaction', NEW.kajabi_transaction_id,
    NULL, NULL, NULL, NULL,
    'kajabi', 'kajabi_tx:' || NEW.kajabi_transaction_id,
    jsonb_build_object('purchase_id', NEW.kajabi_purchase_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_kajabi_transactions_tr ON kajabi_transactions;
CREATE TRIGGER platform_events_kajabi_transactions_tr
  AFTER INSERT ON kajabi_transactions
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_kajabi_transactions_fn();

-- ── shifts ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_events_setter_shifts_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name FROM setters WHERE id = NEW.setter_id;
  PERFORM insert_platform_event(
    'shift.started', 'team', 'info', 1,
    'Setter shift started — ' || COALESCE(v_name, 'Setter'),
    'system', COALESCE(v_name, 'Setter'), 'shift', NEW.id::text,
    NULL, NULL, NULL, NULL, 'crm', 'setter_shift:' || NEW.id::text,
    '{}'::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_setter_shifts_tr ON setter_shifts;
CREATE TRIGGER platform_events_setter_shifts_tr
  AFTER INSERT ON setter_shifts
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_setter_shifts_fn();

CREATE OR REPLACE FUNCTION public.platform_events_closer_shifts_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name FROM closers WHERE id = NEW.closer_id;
  PERFORM insert_platform_event(
    'shift.started', 'team', 'info', 1,
    'Closer shift started — ' || COALESCE(v_name, 'Closer'),
    'system', COALESCE(v_name, 'Closer'), 'shift', NEW.id::text,
    NULL, NULL, NULL, NULL, 'crm', 'closer_shift:' || NEW.id::text,
    '{}'::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_events_closer_shifts_tr ON closer_shifts;
CREATE TRIGGER platform_events_closer_shifts_tr
  AFTER INSERT ON closer_shifts
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_closer_shifts_fn();
