import { createHash } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from './connection.js';
export class AccessDeniedError extends Error {
  constructor() { super('Access denied'); }
}
// Accept only the opaque session secret and requested tenant, never identity/role claims.
// HTTP session issuance, cookies and CSRF are intentionally a separate reviewed increment.
export async function withTenantContext<T>(db: Kysely<Database>, sessionToken: string, tenantId: string,
  work: (transaction: Transaction<Database>) => Promise<T>): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(sessionToken) || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(tenantId)) throw new AccessDeniedError();
  const hash = createHash('sha256').update(sessionToken).digest('hex');
  return db.transaction().execute(async trx => {
    const { rows } = await sql<{ membership_id: string }>`select membership_id from auth.resolve_context(${hash}, ${tenantId}::uuid)`.execute(trx);
    if (rows.length !== 1) throw new AccessDeniedError();
    await sql`select set_config('app.tenant_id', ${tenantId.toLowerCase()}, true),
      set_config('app.membership_id', ${rows[0]!.membership_id}, true),
      set_config('app.session_hash', ${hash}, true)`.execute(trx);
    return work(trx);
  });
}
