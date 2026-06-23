-- Track whether a potential lead was booked by a setter via the CRM UI.
-- Written by lib/api-handlers/iclosed.js book-call handler (not the webhook).
-- NULL = external / self-serve booking. 'crm_booking' = booked by setter in CRM.

ALTER TABLE public.potential_leads
  ADD COLUMN IF NOT EXISTS booking_source text;

CREATE INDEX IF NOT EXISTS potential_leads_booking_source_idx
  ON public.potential_leads (booking_source)
  WHERE booking_source IS NOT NULL;
