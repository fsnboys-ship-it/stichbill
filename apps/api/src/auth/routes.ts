import { organisationRoutes } from '../organisation/routes.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import type { Database } from '../database/connection.js';
import { withTenantContext } from '../database/tenant-context.js';
import { digest, hashPassword, secret, verifyPassword } from './password.js';
export type ResetDelivery = (email: string, token: string) => Promise<void>;
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(12).max(128);
const credentials = z.object({ email, password }).strict();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const generic = { message: 'Unable to complete this request. Check your details or try again later.' };
const cookie = (name: string, value: string, age: number) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function cookies(request: FastifyRequest): Record<string, string> {
  return Object.fromEntries((request.headers.cookie ?? '').split(';').map(v => v.trim().split('=')).filter(v => v.length === 2));
}
const session = (request: FastifyRequest) => {
  const value = cookies(request)['__Host-stich-session'];
  return tokenSchema.safeParse(value).success ? value! : '';
};
function safeEqual(a: string, b: string) {
  return a.length === 64 && b.length === 64 && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function registerAuthRoutes(server: FastifyInstance, db: Kysely<Database>, deliverReset: ResetDelivery) {
  void server.register(async scoped => { configureAuthRoutes(scoped, db, deliverReset); });
}
function configureAuthRoutes(server: FastifyInstance, db: Kysely<Database>, deliverReset: ResetDelivery) {
  server.setErrorHandler((_error, _request, reply) => {
    // Database details, request bodies, credentials and cookies must never reach error logs.
    void reply.code(503).send(generic);
  });
  // Dummy verification uses the same cost as a real account, without a per-request hash.
  const dummy = hashPassword(secret());
  const sessionRows = async (request: FastifyRequest) => (await sql<{identity_id: string; tenant_id: string | null; business_name: string | null}>`select * from auth.session_info(${digest(session(request))})`.execute(db)).rows;
  const limited = async (request: FastifyRequest, address: string, operation: string) => {
    // Do not trust forwarded IP headers. PostgreSQL buckets coordinate all API processes.
    const ip = (await sql<{allowed: boolean}>`select auth.throttle(${digest(operation + ':ip:' + request.ip)},40) as allowed`.execute(db)).rows[0]?.allowed;
    const account = (await sql<{allowed: boolean}>`select auth.throttle(${digest(operation + ':account:' + address)},5) as allowed`.execute(db)).rows[0]?.allowed;
    return ip && account;
  };
  server.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/v1/auth/')) return;
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer').header('X-Content-Type-Options', 'nosniff');
    if (request.method === 'GET') return;
    const origin = request.headers.origin;
    if (!origin || !['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3001', 'http://localhost:3001'].includes(origin) ||
        request.headers['sec-fetch-site'] === 'cross-site' ||
        !safeEqual(cookies(request)['__Host-stich-csrf'] ?? '', String(request.headers['x-csrf-token'] ?? ''))) {
      return reply.code(403).send(generic);
    }
  });
  organisationRoutes(server, db, session);
  const rotate = (reply: FastifyReply, value: string) => {
    const csrf = secret();
    reply.header('Set-Cookie', [cookie('__Host-stich-session', value, 28800), cookie('__Host-stich-csrf', csrf, 28800)]);
    return csrf;
  };
  server.get('/api/v1/auth/csrf', async (_request, reply) => {
    const csrf = secret();
    reply.header('Set-Cookie', cookie('__Host-stich-csrf', csrf, 28800));
    return { csrf };
  });
  server.post('/api/v1/auth/register', async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(generic);
    const { email: address, password: plain } = parsed.data;
    if (!await limited(request, address, 'register')) return reply.code(429).send(generic);
    const value = secret(), encoded = await hashPassword(plain);
    const ok = (await sql<{ok: boolean}>`select auth.register_owner(${address},${encoded},${digest(value)}) as ok`.execute(db)).rows[0]?.ok;
    // Same public response/cookie shape for duplicate registration; unknown session cannot access anything.
    const csrf = rotate(reply, value);
    void ok; // Existence intentionally has no effect on the public result.
    return { csrf, message: 'Continue to business setup, or sign in if you already have an account.' };
  });
  server.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = credentials.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(generic);
    const { email: address, password: plain } = parsed.data;
    if (!await limited(request, address, 'login')) return reply.code(429).send(generic);
    const stored = (await sql<{password_hash: string | null}>`select * from auth.credentials(${address})`.execute(db)).rows[0]?.password_hash;
    const valid = await verifyPassword(plain, stored ?? await dummy);
    if (!valid || !stored) return reply.code(401).send(generic);
    const value = secret();
    if (!(await sql<{ok: boolean}>`select auth.login(${address},${stored},${digest(value)}) as ok`.execute(db)).rows[0]?.ok) return reply.code(401).send(generic);
    return { csrf: rotate(reply, value) };
  });
  server.get('/api/v1/auth/session', async (request, reply) => {
    const rows = await sessionRows(request);
    if (!rows.length) return reply.code(401).send(generic);
    return { businesses: rows.filter(r => r.tenant_id).map(r => ({ id: r.tenant_id, name: r.business_name })) };
  });
  server.post('/api/v1/auth/onboard', async (request, reply) => {
    const parsed = z.object({ businessName: z.string().trim().min(1).max(160), ownerName: z.string().trim().min(1).max(160) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(generic);
    const result = (await sql<{id: string | null}>`select auth.onboard(${digest(session(request))},${parsed.data.businessName},${parsed.data.ownerName}) as id`.execute(db)).rows[0]?.id;
    if (!result) return reply.code(409).send(generic);
    return { businessId: result };
  });
  server.get('/api/v1/auth/business/:id', async (request, reply) => {
    try {
      const id = (request.params as {id: string}).id;
      return await withTenantContext(db, session(request), id, async trx => {
        const { rows } = await sql<{id: string; name: string}>`select id,name from public.tenants`.execute(trx);
        return { business: rows[0] };
      });
    } catch { return reply.code(403).send(generic); }
  });
  server.post('/api/v1/auth/logout', async (request, reply) => {
    await sql`select auth.logout(${digest(session(request))})`.execute(db);
    reply.header('Set-Cookie', [cookie('__Host-stich-session', '', 0), cookie('__Host-stich-csrf', '', 0)]);
    return { message: 'Signed out.' };
  });
  server.post('/api/v1/auth/recover', async (request, reply) => {
    const parsed = z.object({ email }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(generic);
    if (!await limited(request, parsed.data.email, 'recover')) return reply.code(429).send(generic);
    const value = secret();
    const ok = (await sql<{ok: boolean}>`select auth.request_reset(${parsed.data.email},${digest(value)}) as ok`.execute(db)).rows[0]?.ok;
    // Delivery errors and existence are never exposed, nor are tokens passed to a logger.
    if (ok) { try { await deliverReset(parsed.data.email, value); } catch { /* generic response */ } }
    return { message: 'If an account can be recovered, recovery instructions will be sent.' };
  });
  server.post('/api/v1/auth/reset', async (request, reply) => {
    const parsed = z.object({ token: tokenSchema, password }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(generic);
    if (!await limited(request, request.ip, 'reset')) return reply.code(429).send(generic);
    const encoded = await hashPassword(parsed.data.password);
    const ok = (await sql<{ok: boolean}>`select auth.reset_password(${digest(parsed.data.token)},${encoded}) as ok`.execute(db)).rows[0]?.ok;
    if (!ok) return reply.code(400).send(generic);
    reply.header('Set-Cookie', [cookie('__Host-stich-session', '', 0), cookie('__Host-stich-csrf', '', 0)]);
    return { message: 'Password changed. Sign in with your new password.' };
  });
}
