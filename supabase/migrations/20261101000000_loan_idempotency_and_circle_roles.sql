-- Additive loan request idempotency and database enforcement for the circle Co-Admin cap.
-- Historical loan and membership rows are retained.
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS application_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS loans_application_key_unique
  ON public.loans (application_key)
  WHERE application_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_circle_coadmin_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.members_list IS NOT NULL AND jsonb_typeof(NEW.members_list) = 'array' AND
    (SELECT count(*) FROM jsonb_array_elements(NEW.members_list) AS item
     WHERE item->>'role' = 'co-admin' AND COALESCE(item->>'status', 'active') = 'active') > 2 THEN
    RAISE EXCEPTION 'A circle can have at most two Co-Admins.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS circles_coadmin_limit ON public.circles;
CREATE TRIGGER circles_coadmin_limit
  BEFORE INSERT OR UPDATE OF members_list ON public.circles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_circle_coadmin_limit();
