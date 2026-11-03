import { readConfig } from '../config.js';
import { createDatabase, probeDatabase } from './connection.js';
async function main() {
  const config = readConfig();
  const db = createDatabase(config.DATABASE_URL, config.APP_ENV);
  try { await probeDatabase(db); console.log('PostgreSQL readiness and privilege contract verified.'); }
  finally { await db.destroy(); }
}
main().catch(() => { console.error('Local database check failed. Check .env and the development service.'); process.exitCode = 1; });
