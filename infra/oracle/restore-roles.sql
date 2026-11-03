-- Isolated recovery host ONLY, not provisioning, startup or a migration.
-- Run with ON_ERROR_STOP and the explicit recovery session setting below.
BEGIN;
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
  IF current_database() <> 'postgres'
     OR current_setting('stichbill.restore_roles_approved',true) IS DISTINCT FROM 'isolated-staging-restore'
     OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper AND rolcanlogin)
     OR EXISTS(SELECT 1 FROM pg_database WHERE datname='stichbill_staging')
     OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('stichbill_staging_owner','stichbill_staging_migrator','stichbill_staging_runtime'))
  THEN RAISE EXCEPTION 'Empty isolated recovery target and explicit administrator approval required'; END IF;
END $$;
CREATE ROLE stichbill_staging_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE stichbill_staging_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE ROLE stichbill_staging_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD NULL;
-- No memberships, database creation or grants. The archive restores database/object ACLs.
COMMIT;
