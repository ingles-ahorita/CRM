-- potential_leads: single status column iclosed_status (text).
-- Safe if status was already dropped manually in Supabase dashboard.

DROP INDEX IF EXISTS public.potential_leads_status_idx;

ALTER TABLE public.potential_leads
  DROP COLUMN IF EXISTS status;

DROP TYPE IF EXISTS public.iclosed_lead_status;

CREATE INDEX IF NOT EXISTS potential_leads_iclosed_status_idx
  ON public.potential_leads(iclosed_status);