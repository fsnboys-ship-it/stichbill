import { readConfig } from '../config.js';
import { createDatabase, probeDatabase } from './connection.js';
async function main() {
  const db = createDatabase(readConfig().DATABASE_URL);
  try { await probeDatabase(db); console.log('Local PostgreSQL connection OK (SELECT 1 only).'); }
  finally { await db.destroy(); }
}
main().catch(() => { console.error('Local database check failed. Check .env and the development service.'); process.exitCode = 1; });
