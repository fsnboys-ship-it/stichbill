import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../database/connection.js';
import { withTenantContext } from '../database/tenant-context.js';
const name = z.string().trim().min(1).max(160);
const scope = z.object({ shopId: z.uuid(), branchId: z.uuid().nullable() }).strict();
export const locationInput = z.object({ kind: z.enum(['shop', 'branch']), id: z.uuid().nullable(), shopId: z.uuid().nullable(), code: z.string().trim().min(1).max(40), name, address: z.string().trim().min(1).max(500), contact: z.string().trim().max(80), active: z.boolean() }).strict();
export const staffInput = z.object({ id: z.uuid().nullable(), email: z.email().max(254).optional(), name, role: z.enum(['owner', 'cashier']), active: z.boolean(), scopes: z.array(scope).max(100) }).strict();
export function organisationRoutes(server: FastifyInstance, db: Kysely<Database>, session: (request: FastifyRequest) => string) {
  server.get('/api/v1/auth/organisation/:tenant', async (request, reply) => {
    try {
      return await withTenantContext(db, session(request), (request.params as {tenant: string}).tenant, async trx => {
        const { rows } = await sql<{data: unknown}>`select auth.organisation_read(${(request.params as {tenant: string}).tenant}::uuid) as data`.execute(trx);
        return rows[0]!.data;
      });
    } catch { return reply.code(403).send({ message: 'Access unavailable. Sign in again or contact your owner.' }); }
  });
  for (const operation of ['location', 'staff'] as const) server.post(`/api/v1/auth/organisation/:tenant/${operation}`, async (request, reply) => {
    const parsed = (operation === 'location' ? locationInput : staffInput).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Check the required details.' });
    const tenant = (request.params as {tenant: string}).tenant;
    try {
      return await withTenantContext(db, session(request), tenant, async trx => {
        if (operation === 'location') {
          const p = locationInput.parse(parsed.data);
          const { rows } = await sql<{id: string}>`select auth.save_location(${tenant}::uuid,${p.kind},${p.id}::uuid,${p.shopId}::uuid,${p.code},${p.name},${p.address},${p.contact},${p.active}) as id`.execute(trx);
          return rows[0];
        }
        const p = staffInput.parse(parsed.data);
        const { rows } = await sql<{id: string}>`select auth.save_staff(${tenant}::uuid,${p.id}::uuid,${p.email?.trim().toLowerCase() ?? ''},${p.name},${p.role},${p.active},${JSON.stringify(p.scopes)}::jsonb) as id`.execute(trx);
        return rows[0];
      });
    } catch (error) {
      const code = (error as {code?: string}).code;
      return reply.code(code === '42501' || !code ? 403 : 409).send({ message: 'Unable to save. Check access, unique codes and assignments. Keep at least one active owner. Staff must register before being added.' });
    }
  });
}
