import { sql } from 'kysely';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { validateLocalDatabaseUrl } from '../apps/api/dist/config.js';
import { createDatabase } from '../apps/api/dist/database/connection.js';
import { accessMigrationChecksum } from '../apps/api/dist/database/security-manifest.js';
import { inspectSecurity, validateSecurity } from '../apps/api/dist/database/security.js';

export async function provisionLocalDatabase(env=process.env) {
  const urls=['ADMIN_DATABASE_URL','MIGRATION_DATABASE_URL','DATABASE_URL'].map(key=>new URL(validateLocalDatabaseUrl(env[key] ?? '')));
  const [admin,migration,runtime]=urls;
  if(urls.some(url=>url.host!==admin.host || url.pathname!==admin.pathname)) throw new Error('All roles must target the same dedicated local database.');
  const database=admin.pathname.slice(1), migratorName=`${database}_migrator`,runtimeName=`${database}_runtime`;
  if(migration.username!==migratorName || runtime.username!==runtimeName || [migratorName,runtimeName].includes(admin.username)) throw new Error('Database roles must be distinct and use the documented names.');
  const db=createDatabase(admin.href);
  try {
    await db.transaction().execute(async trx=>{
      await sql`select pg_advisory_xact_lock(731003,1),pg_advisory_xact_lock(731003,2)`.execute(trx);
      await sql`set local search_path=pg_catalog`.execute(trx);
      const snapshot=await inspectSecurity(trx);
      // Only the exact immutable pre-correction history may enter the legacy upgrade path.
      let legacy=false;
      if(snapshot.defaults.length===0 && snapshot.relations.some(r=>r.schema==='public' && r.name==='migration_history' && r.kind==='r')) {
        const history=await sql`select version,checksum from public.migration_history`.execute(trx);
        legacy=history.rows.length===1 && history.rows[0].version==='20261031000100_access_foundation.sql' && history.rows[0].checksum===accessMigrationChecksum;
      }
      const state=validateSecurity(snapshot,'provision',decodeURIComponent(admin.username),legacy);
      if(state!=='fresh') return; // Never alter a pre-existing role/grant to hide a failed check.
      for(const [name,url] of [[migratorName,migration],[runtimeName,runtime]]) {
        const password=decodeURIComponent(url.password);
        if(!/^[a-f0-9]{48}$/.test(password)) throw new Error('Use generated application role passwords.');
        // Database/role identifiers are bounded by validateLocalDatabaseUrl; secrets never logged.
        await sql.raw(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`).execute(trx);
      }
      for(const statement of [
        `REVOKE ALL ON DATABASE ${database} FROM PUBLIC`,
        `GRANT CONNECT ON DATABASE ${database} TO ${migratorName},${runtimeName}`,
        `GRANT CREATE ON DATABASE ${database} TO ${migratorName}`,
        'REVOKE CREATE ON SCHEMA public FROM PUBLIC',
        `ALTER SCHEMA public OWNER TO ${migratorName}`,
        `GRANT USAGE ON SCHEMA public TO ${runtimeName}`,
      ]) await sql.raw(statement).execute(trx);
      validateSecurity(await inspectSecurity(trx),'provision',decodeURIComponent(admin.username));
    });
  } finally {await db.destroy();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  provisionLocalDatabase().then(()=>console.log('Dedicated local privilege configuration verified.')).catch(()=>{
    console.error('Local provisioning rejected. Review ownership, role attributes, ACLs and policies; no existing configuration was repaired. Credentials are not logged.'); process.exitCode=1;
  });
}
