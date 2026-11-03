import { z } from 'zod';
const schema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging']).default('development'),
  API_HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
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
  if (result.data.APP_ENV === 'staging') {
    if (['ADMIN_DATABASE_URL','MIGRATION_DATABASE_URL','POSTGRES_PASSWORD','POSTGRES_USER','POSTGRES_DB','POSTGRES_PORT'].some(key => env[key] !== undefined))
      throw new Error('Staging runtime must not contain privileged database configuration');
    validateStagingDatabaseUrl(result.data.DATABASE_URL, 'runtime');
    canonicalOrigin(result.data.APP_ORIGIN ?? '');
    if (!result.data.SMTP_HOST || !/^[a-z0-9.-]+$/i.test(result.data.SMTP_HOST) ||
        ![465, 587].includes(result.data.SMTP_PORT ?? 0) || !result.data.SMTP_USER || !result.data.SMTP_PASSWORD ||
        !z.email().safeParse(result.data.SMTP_FROM).success) throw new Error('Staging requires complete SMTP configuration');
    if (result.data.ALLOW_MIGRATIONS !== 'false') throw new Error('Runtime migrations are disabled in staging');
  } else validateLocalDatabaseUrl(result.data.DATABASE_URL);
  return result.data;
}

export function canonicalOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('A canonical HTTPS application origin is required'); }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(url.hostname) || url.port)
    throw new Error('A canonical HTTPS DNS origin without path or port is required');
  return value;
}
export function validateStagingDatabaseUrl(value: string, purpose: 'runtime' | 'migrator' | 'bootstrap'): string {
  const fail = () => { throw new Error('Invalid dedicated staging database connection'); };
  let url: URL;
  try { url = new URL(value); } catch { return fail(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' ||
      (!url.port || !Number.isInteger(Number(url.port)) || Number(url.port) < 1024 || Number(url.port) > 65535) || url.pathname !== '/stichbill_staging' || url.search || url.hash || !url.password) return fail();
  let user: string, password: string;
  try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); } catch { return fail(); }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(user!) || password!.length < 24 || Array.from(password!).some(c => c.charCodeAt(0) <= 32)) return fail();
  if (purpose !== 'bootstrap' && !/^[a-f0-9]{48}$/.test(password!)) return fail();
  if (purpose === 'bootstrap' ? ['stichbill_staging_owner','stichbill_staging_runtime','stichbill_staging_migrator'].includes(user!) :
      user !== `stichbill_staging_${purpose}`) return fail();
  return value;
}
export function validateDatabaseConnection(value: string, environment: AppConfig['APP_ENV'] = 'development', purpose: 'runtime' | 'migrator' | 'bootstrap' = 'runtime'): string {
  if (!['development','test','staging'].includes(environment)) throw new Error('Unsupported database environment');
  return environment === 'staging' ? validateStagingDatabaseUrl(value, purpose) : validateLocalDatabaseUrl(value);
}
