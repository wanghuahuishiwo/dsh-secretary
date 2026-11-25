import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createNKeyPair, nkeyPublicKeyFromSeed, CREDENTIAL_REFS } from '../lib/index.js'

// 参考向量由官方 nkeys.js 1.1.0 `createUser()` 生成（2026-11-25 离线交叉验证，200 轮随机种子全部一致）。
const VECTORS = [
  { seed: 'SUACMAFGTCPICCOX3JMYBAVJ3PQDJBOO5SUP2MSRH27RWB4CNWBVDXJKG4', publicKey: 'UDW4FGA76EWQJMWCEVFNIZ3LBBNOLGUP6ZW3E7EBQCHYBRTV26XXZ3KZ' },
  { seed: 'SUAONLOV53WLUKDKPUS35L45NKLNJZWUKGGDFLA3LWUY7QO7NCOHX4TG2U', publicKey: 'UANMLSBZABL6HGBV4WWTFIWHCX6NOHYGZNUFTYXPGQNM7VKR443OWS3C' },
]

test('public key derivation matches the official nkeys.js vectors', () => {
  for (const { seed, publicKey } of VECTORS) assert.equal(nkeyPublicKeyFromSeed(seed), publicKey)
})

test('createNKeyPair returns a fresh user seed with its matching public key', () => {
  const a = createNKeyPair()
  const b = createNKeyPair()
  assert.match(a.seed, /^SUA[A-Z2-7]{55}$/, 'seed is a base32 user seed (58 chars)')
  assert.match(a.publicKey, /^U[A-Z2-7]{55}$/)
  assert.notEqual(a.seed, b.seed)
  assert.equal(nkeyPublicKeyFromSeed(a.seed), a.publicKey)
})

test('a malformed seed is rejected instead of yielding a wrong key', () => {
  assert.throws(() => nkeyPublicKeyFromSeed('SUACMAFGTCPICCOX3JMYBAVJ3PQDJBOO5SUP2MSRH27RWB4CNWBVDXJKG3'), /checksum|seed/i)
  assert.throws(() => nkeyPublicKeyFromSeed('not-a-seed'), /NKey/)
})

test('credential references are the fixed NATS_NKEY_SEED_* names', () => {
  assert.deepEqual(CREDENTIAL_REFS, { center: 'NATS_NKEY_SEED_CENTER', node: 'NATS_NKEY_SEED_NODE' })
})
