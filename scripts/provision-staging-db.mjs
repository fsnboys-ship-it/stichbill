import { sql } from 'kysely';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateStagingDatabaseUrl } from '../apps/api/dist/config.js';
import { createDatabase } from '../apps/api/dist/database/connection.js';
import { inspectSecurity, validateSecurity } from '../apps/api/dist/database/security.js';

// No cloud provisioning. Only an explicitly selected, pre-created local staging database.
export async function provisionStagingDatabase(env = process.env) {
  if (env.APP_ENV !== 'staging' || env.APPROVE_STAGING_PROVISION !== 'stichbill_staging') throw new Error('Explicit staging provisioning approval required');
  const urls = ['ADMIN_DATABASE_URL','MIGRATION_DATABASE_URL','DATABASE_URL'].map((key, i) =>
    new URL(validateStagingDatabaseUrl(env[key] ?? '', ['bootstrap','migrator','runtime'][i])));
  const [admin, migration, runtime] = urls;
  if (new Set(urls.map(url => decodeURIComponent(url.password))).size !== 3) throw new Error('Staging role credentials must be independent');
  if (urls.some(url => url.host !== admin.host)) throw new Error('All staging roles must target the same explicit loopback port');
  const owner = 'stichbill_staging_owner', migrator = 'stichbill_staging_migrator', app = 'stichbill_staging_runtime';
  const db = createDatabase(admin.href, 'staging', 'bootstrap');
  try {
    await db.transaction().execute(async trx => {
      await sql`select pg_advisory_xact_lock(731003,1), pg_advisory_xact_lock(731003,2)`.execute(trx);
      await sql`set local search_path=pg_catalog`.execute(trx);
      const actor = (await sql`select current_user=session_user and rolsuper and rolcanlogin as safe from pg_roles where rolname=current_user`.execute(trx)).rows[0];
      if (!actor?.safe) throw new Error('Separate controlled bootstrap superuser required');
      let snapshot = await inspectSecurity(trx);
      if (snapshot.admin !== owner) {
        validateSecurity(snapshot, 'bootstrap', decodeURIComponent(admin.username));
        const existing = await sql`select 1 from pg_roles where rolname=${owner}`.execute(trx);
        if (existing.rows.length) throw new Error('Existing owner role requires manual review');
        await sql.raw(`CREATE ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`).execute(trx);
        await sql.raw(`ALTER DATABASE stichbill_staging OWNER TO ${owner}`).execute(trx);
        snapshot = await inspectSecurity(trx);
      }
      const state = validateSecurity(snapshot, 'provision', owner);
      if (state !== 'fresh') return; // Never repair existing drift.
      for (const [name,url] of [[migrator,migration],[app,runtime]]) {
        const password = decodeURIComponent(url.password);
        if (!/^[a-f0-9]{48}$/.test(password)) throw new Error('Use independently generated 24-byte role passwords');
        await sql.raw(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`).execute(trx);
      }
      // Superuser SET ROLE is temporary: no persistent owner membership is granted.
      await sql.raw(`SET LOCAL ROLE ${owner}`).execute(trx);
      await sql.raw(`REVOKE ALL ON DATABASE stichbill_staging FROM PUBLIC`).execute(trx);
      await sql.raw(`GRANT CONNECT ON DATABASE stichbill_staging TO ${migrator},${app}`).execute(trx);
      await sql.raw(`GRANT CREATE ON DATABASE stichbill_staging TO ${migrator}`).execute(trx);
      await sql`reset role`.execute(trx);
      await sql`revoke create on schema public from public`.execute(trx);
      await sql.raw(`ALTER SCHEMA public OWNER TO ${migrator}`).execute(trx);
      await sql.raw(`SET LOCAL ROLE ${migrator}`).execute(trx);
      await sql.raw(`GRANT USAGE ON SCHEMA public TO ${app}`).execute(trx);
      await sql`reset role`.execute(trx);
      validateSecurity(await inspectSecurity(trx), 'provision', owner);
    });
  } finally { await db.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  provisionStagingDatabase().then(() => console.log('Staging privilege contract verified.')).catch(() => {
    console.error('Staging provisioning rejected; inspect role separation and approved target privately. No drift is repaired.'); process.exitCode = 1;
  });
}
