import { z } from 'zod';
const schema = z.object({
  APP_ENV: z.enum(['development', 'test']).default('development'),
  API_HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  DATABASE_URL: z.string().min(1),
  ALLOW_MIGRATIONS: z.enum(['true', 'false']).default('false'),
});
export type AppConfig = z.infer<typeof schema>;
export function validateLocalDatabaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('DATABASE_URL must be a valid local PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/stichbill_(dev|test(?:_security_[a-f0-9]{8})?)$/.test(url.pathname) ||
      !url.username || !url.password || url.search || url.hash) {
    throw new Error('Only dedicated local stichbill_dev/stichbill_test PostgreSQL databases are permitted');
  }
  if (decodeURIComponent(url.password) === 'replace-with-local-password') {
    throw new Error('Replace the example database password using npm run setup:env');
  }
  return value;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = schema.safeParse(env);
  if (!result.success) throw new Error(`Invalid environment fields: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  validateLocalDatabaseUrl(result.data.DATABASE_URL);
  return result.data;
}
