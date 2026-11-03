-- MANUAL RECOVERY ONLY: review/approve before execution on an isolated restored host.
-- Not a migration. Never run during startup or normal deployment.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
  IF current_database() <> 'stichbill_staging' OR current_setting('stichbill.recovery_approved',true) IS DISTINCT FROM 'isolated-staging-restore' OR NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper
  ) THEN RAISE EXCEPTION 'Isolated staging recovery administrator required'; END IF;
END $$;
UPDATE auth.identity_sessions SET revoked_at=statement_timestamp() WHERE revoked_at IS NULL;
UPDATE public.membership_sessions SET revoked_at=statement_timestamp() WHERE revoked_at IS NULL;
UPDATE auth.password_resets SET used_at=statement_timestamp() WHERE used_at IS NULL;
COMMIT;
