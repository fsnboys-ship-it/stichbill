import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,secret,digest} from '../../apps/api/dist/auth/password.js';
test('Argon2id salts are unique; verification rejects wrong and malformed credentials',async()=>{
  const plain='synthetic-password-123';
  const a=await hashPassword(plain),b=await hashPassword(plain);
  assert.notEqual(a,b);assert.ok(!a.includes(plain));
  assert.equal(await verifyPassword(plain,a),true);
  assert.equal(await verifyPassword('wrong-password',a),false);
  assert.equal(await verifyPassword(plain,'malformed'),false);
  const token=secret();assert.match(token,/^[a-f0-9]{64}$/);assert.notEqual(token,digest(token));
});
