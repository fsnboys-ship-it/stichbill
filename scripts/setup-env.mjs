import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const password = randomBytes(24).toString('hex');
try {
  await writeFile(new URL('../.env', import.meta.url), example.replaceAll('replace-with-local-password', password), { flag: 'wx', mode: 0o600 });
  console.log('Created .env with a random local database password. No database changes made.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env already exists; preserved without changes.');
  else throw error;
}
