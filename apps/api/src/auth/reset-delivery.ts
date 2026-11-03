import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
// Local development mailbox only. Never served over HTTP or included in logs.
// A production transport requires a separately reviewed provider; production config is rejected.
export async function deliverLocalReset(email: string, token: string): Promise<void> {
  const directory = resolve('work/local-mailbox');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(resolve(directory, `${randomUUID()}.json`), JSON.stringify({
    to: email, resetUrl: `http://127.0.0.1:5173/#reset=${token}`, expiresInMinutes: 20,
  }), { flag: 'wx', mode: 0o600 });
}
