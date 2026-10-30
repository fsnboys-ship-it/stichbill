# Reviewed SQL migrations (empty)

No SQL migrations or business tables exist in Task 002. Nothing runs on API startup, installation, build, CI or health checks. Future files must be named `YYYYMMDDHHMMSS_description.sql`, reviewed and immutable after use. The Kysely Migrator provides transaction/lock metadata only on explicitly approved execution; no migration runner has been executed in Task 002.

Future authorised local execution requires both ALLOW_MIGRATIONS=true and --approve-local-migrations passed to the compiled runner. This is a safety gate, not an approval substitute. Never edit the environment to bypass project approval. No down/drop/reset command is supplied. Production migration policy and checksums must be extended in the future migration implementation task.
