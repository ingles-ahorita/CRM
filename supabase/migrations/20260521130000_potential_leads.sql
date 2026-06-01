-- Potential Leads — qualified iClosed contacts who haven't booked yet
-- See lib/api-handlers/iclosed-webhook.js and src/pages/components/management-2/potential-leads/

-- ── Status enum ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'potential_lead_status') THEN
    CREATE TYPE public.potential_lead_status AS ENUM (
      'new',
      'attempted',   -- setter tried to contact, no answer
      'reached',     -- setter spoke with them
      'booked',      -- they finally scheduled a call
      'lost'         -- not interested / disqualified
    );
  END IF;
END
$$;

-- ── potential_leads table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.potential_leads (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity / dedup (iClosed contact id; UNIQUE so re-fires upsert instead of dup)
  iclosed_contact_id      text UNIQUE,
  iclosed_status          text,         -- the raw status string from iClosed (qualified, potential, etc.)

  -- Contact info
  name                    text,
  email                   text,
  phone                   text,
  source                  text,         -- utm_source / iClosed source field if present
  metadata                jsonb,        -- whatever extra iClosed sends (utm_*, tags, score, etc.)

  -- CRM lifecycle
  status                  public.potential_lead_status NOT NULL DEFAULT 'new',
  notes                   text,
  last_contact_attempt_at timestamptz,

  -- Assignment
  assigned_setter_id      uuid REFERENCES public.setters(id) ON DELETE SET NULL,
  assignment_reason       text,         -- 'on_shift' | 'next_scheduled' | 'manual' | 'unassigned'
  assigned_at             timestamptz,
  scheduled_handoff_at    timestamptz,  -- when "next_scheduled" assignment's shift begins

  -- If converted to a real lead/call later
  converted_call_id       uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  converted_at            timestamptz,

  -- Raw audit
  raw_payload             jsonb,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS potential_leads_status_idx
  ON public.potential_leads(status);
CREATE INDEX IF NOT EXISTS potential_leads_assigned_setter_idx
  ON public.potential_leads(assigned_setter_id);
CREATE INDEX IF NOT EXISTS potential_leads_created_at_idx
  ON public.potential_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS potential_leads_email_idx
  ON public.potential_leads(lower(email));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.potential_leads_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS potential_leads_touch_updated_at_tr ON public.potential_leads;
CREATE TRIGGER potential_leads_touch_updated_at_tr
  BEFORE UPDATE ON public.potential_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.potential_leads_touch_updated_at();

-- ── iclosed_webhook_logs (raw audit, mirror of calendly_webhook_logs) ────────
CREATE TABLE IF NOT EXISTS public.iclosed_webhook_logs (
  id          bigserial PRIMARY KEY,
  event       text,
  status_in   text,          -- the contact-status value seen in the payload
  payload     jsonb,
  raw_body    jsonb,
  process     text,          -- 'received' | 'created' | 'updated' | 'skipped' | 'error'
  result      jsonb,         -- summary (potential_lead_id, assigned setter id, etc.)
  error       text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS iclosed_webhook_logs_received_idx
  ON public.iclosed_webhook_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS iclosed_webhook_logs_event_idx
  ON public.iclosed_webhook_logs(event);

-- RLS: mirror existing tables (anon used by app; tighten later if needed)
ALTER TABLE public.potential_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iclosed_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Permissive policies (same posture as existing CRM tables; the app uses anon
-- and the webhook handler uses anon/service via env vars).
DROP POLICY IF EXISTS potential_leads_all ON public.potential_leads;
CREATE POLICY potential_leads_all ON public.potential_leads
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS iclosed_webhook_logs_all ON public.iclosed_webhook_logs;
CREATE POLICY iclosed_webhook_logs_all ON public.iclosed_webhook_logs
  FOR ALL USING (true) WITH CHECK (true);
