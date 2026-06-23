-- Lead Attribution — Meta CAPI identifiers captured at booking time (via Zapier).
-- Replaces fbclid_tracking as the source /api/n8n-webhook reads at lead_confirmed.
-- fbclid_tracking stays in place during the parallel-run transition; do not drop it.
--
-- Join keys (see lib/api-handlers/n8n-webhook.js):
--   primary:  calls.calendly_id = lead_attribution.calendly_event_uri
--             (numeric string for iClosed bookings; full URL for legacy Calendly)
--   fallback: lower(email), latest row by created_at

-- ── lead_attribution table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_attribution (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Join keys
  -- iClosed event call id as Zapier writes it to calls.calendly_id (same field,
  -- same format — no URL wrapping). UNIQUE is the upsert key; NULL allowed for
  -- future pre-booking events (Lead), and Postgres permits multiple NULLs.
  calendly_event_uri  text UNIQUE,
  email               text,         -- normalized to lower(trim()) by trigger
  phone               text,

  -- Meta CAPI match signals
  fbclid              text,         -- null for organic traffic (expected)
  ip_address          text,         -- client IP as captured by iClosed/Zapier, NOT our server
  user_agent          text,         -- optional; improves Meta match quality if iClosed provides it

  -- Provenance
  source              text NOT NULL DEFAULT 'zapier_iclosed',  -- 'zapier_iclosed' | 'landing_page' | 'backfill'
  raw_payload         jsonb,        -- optional full Zap/iClosed payload for debugging

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Fallback lookup: latest attribution row for an email
CREATE INDEX IF NOT EXISTS lead_attribution_email_created_idx
  ON public.lead_attribution (lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS lead_attribution_created_at_idx
  ON public.lead_attribution (created_at DESC);

-- ── normalize + guard trigger ─────────────────────────────────────────────────
-- Normalizes email, empties-to-NULL, and prevents a re-fired Zap (upsert with
-- merge-duplicates) from wiping fbclid/ip_address that an earlier fire captured.
CREATE OR REPLACE FUNCTION public.lead_attribution_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email       := NULLIF(lower(trim(NEW.email)), '');
  NEW.phone       := NULLIF(trim(NEW.phone), '');
  NEW.fbclid      := NULLIF(trim(NEW.fbclid), '');
  NEW.ip_address  := NULLIF(trim(NEW.ip_address), '');

  IF TG_OP = 'UPDATE' THEN
    NEW.fbclid     := COALESCE(NEW.fbclid, OLD.fbclid);
    NEW.ip_address := COALESCE(NEW.ip_address, OLD.ip_address);
    NEW.user_agent := COALESCE(NEW.user_agent, OLD.user_agent);
    NEW.email      := COALESCE(NEW.email, OLD.email);
    NEW.phone      := COALESCE(NEW.phone, OLD.phone);
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_attribution_before_write_tr ON public.lead_attribution;
CREATE TRIGGER lead_attribution_before_write_tr
  BEFORE INSERT OR UPDATE ON public.lead_attribution
  FOR EACH ROW
  EXECUTE FUNCTION public.lead_attribution_before_write();

-- ── RLS (same posture as existing CRM tables) ─────────────────────────────────
ALTER TABLE public.lead_attribution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_attribution_all ON public.lead_attribution;
CREATE POLICY lead_attribution_all ON public.lead_attribution
  FOR ALL USING (true) WITH CHECK (true);
