-- Auto-confirm CRM-booked calls.
--
-- When a `calls` row is INSERTed with booking_origin ~ 'true' (case-insensitive
-- — the same signal LT5 uses), we:
--   (1) set picked_up = true and confirmed = true on the incoming row, and
--   (2) notify the backend (via pg_net) so it can send the ManyChat confirm
--       side-effect that the manual /setter confirm toggle sends.
--
-- Both triggers are exception-safe: on ANY internal error they RETURN NEW, so
-- they can never block, slow, or fail a calls insert (e.g. Zapier's insert).
--
-- Additive only: no existing table/column/data/trigger is modified. Rollback =
-- drop the two triggers + two functions (see bottom).

-- ── (1) Flags — BEFORE INSERT ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calls_crm_autoconfirm_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lower(btrim(COALESCE(NEW.booking_origin, ''))) = 'true' THEN
    NEW.picked_up := true;
    NEW.confirmed := true;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the insert on an unexpected error.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calls_crm_autoconfirm_tr ON public.calls;
CREATE TRIGGER calls_crm_autoconfirm_tr
  BEFORE INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.calls_crm_autoconfirm_fn();

-- ── (2) ManyChat notify — AFTER INSERT via pg_net ───────────────────────────
-- Endpoint URL + shared secret are read from Supabase Vault, so no secret is
-- committed to the repo AND no superuser-only ALTER DATABASE is required
-- (the SQL-editor role can't SET database parameters). Store them once:
--   select vault.create_secret(
--     'https://crm.inglesahorita.com/api/crm-booking-confirm', 'crm_hook_url');
--   select vault.create_secret('<secret>', 'crm_hook_secret');
-- If the URL secret is absent/empty, this trigger simply does nothing (flags
-- are still set by trigger (1) above). SECURITY DEFINER lets the trigger read
-- Vault regardless of which role performs the INSERT (e.g. Zapier).
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.calls_crm_notify_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  IF lower(btrim(COALESCE(NEW.booking_origin, ''))) = 'true' THEN
    SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'crm_hook_url'    LIMIT 1;
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'crm_hook_secret' LIMIT 1;
    IF v_url IS NOT NULL AND v_url <> '' THEN
      PERFORM net.http_post(
        url     := v_url,
        body    := jsonb_build_object(
                     'type', 'INSERT',
                     'table', 'calls',
                     'record', to_jsonb(NEW)
                   ),
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'x-crm-hook-secret', COALESCE(v_secret, '')
                   ),
        timeout_milliseconds := 5000
      );
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the insert if the notify call fails to enqueue.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calls_crm_notify_tr ON public.calls;
CREATE TRIGGER calls_crm_notify_tr
  AFTER INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.calls_crm_notify_fn();

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS calls_crm_autoconfirm_tr ON public.calls;
-- DROP TRIGGER IF EXISTS calls_crm_notify_tr ON public.calls;
-- DROP FUNCTION IF EXISTS public.calls_crm_autoconfirm_fn();
-- DROP FUNCTION IF EXISTS public.calls_crm_notify_fn();
