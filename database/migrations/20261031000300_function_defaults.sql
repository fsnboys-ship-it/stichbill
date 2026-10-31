-- Forward repair: preserve the already-applied access migration and its checksum.
-- Without IN SCHEMA, this revokes the creating migrator's global PUBLIC EXECUTE default.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Existing functions keep only explicit owner/runtime execution, unchanged from increment 1.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth FROM PUBLIC;
