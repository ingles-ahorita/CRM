-- Track bookings that entered iClosed from the CRM manual setter flow.

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS booking_origin text;

CREATE INDEX IF NOT EXISTS calls_booking_origin_idx
  ON public.calls(booking_origin);
