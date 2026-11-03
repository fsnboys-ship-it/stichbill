import { argon2, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
export const secret = () => randomBytes(32).toString('hex');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => argon2('argon2id', {
    message: password, nonce: salt, parallelism: 1, tagLength: 32, memory: 65536, passes: 3,
  }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `argon2id:65536:3:1:${salt.toString('hex')}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match = /^argon2id:65536:3:1:([a-f0-9]{32}):([a-f0-9]{64})$/.exec(encoded);
  if (!match) return false;
  return timingSafeEqual(await derive(password, Buffer.from(match[1]!, 'hex')), Buffer.from(match[2]!, 'hex'));
}
