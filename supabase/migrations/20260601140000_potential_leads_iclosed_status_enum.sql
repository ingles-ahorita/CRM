-- Replace CRM lifecycle enum (new/attempted/reached/booked/lost) with iClosed lead statuses.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'iclosed_lead_status') THEN
    CREATE TYPE public.iclosed_lead_status AS ENUM (
      'potential',
      'qualified',
      'disqualified',
      'strategy_call',
      'discovery_call'
    );
  END IF;
END
$$;

-- Bridge old CRM enum values → iClosed slugs before type change
ALTER TABLE public.potential_leads
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.potential_leads
  ALTER COLUMN status TYPE text
  USING (
    COALESCE(
      NULLIF(TRIM(iclosed_status), ''),
      CASE status::text
        WHEN 'new' THEN 'potential'
        WHEN 'attempted' THEN 'potential'
        WHEN 'reached' THEN 'qualified'
        WHEN 'booked' THEN 'strategy_call'
        WHEN 'lost' THEN 'disqualified'
        ELSE 'potential'
      END
    )
  );

ALTER TABLE public.potential_leads
  ALTER COLUMN status TYPE public.iclosed_lead_status
  USING (
    CASE
      WHEN status IN (
        'potential', 'qualified', 'disqualified', 'strategy_call', 'discovery_call'
      ) THEN status::public.iclosed_lead_status
      ELSE 'potential'::public.iclosed_lead_status
    END
  );

ALTER TABLE public.potential_leads
  ALTER COLUMN status SET DEFAULT 'potential'::public.iclosed_lead_status;

-- Keep iclosed_status text in sync with enum column
UPDATE public.potential_leads
SET iclosed_status = status::text
WHERE iclosed_status IS DISTINCT FROM status::text;

DROP TYPE IF EXISTS public.potential_lead_status;
