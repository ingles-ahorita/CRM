-- Patch: settings activity messages + insert_platform_event priority type (already applied in prod).
-- Run in Supabase SQL Editor if 20260519120000 was applied before this patch.

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
    SELECT 1 FROM public.platform_events WHERE dedupe_key = p_dedupe_key
  ) THEN
    RETURN;
  END IF;
  INSERT INTO public.platform_events (
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
