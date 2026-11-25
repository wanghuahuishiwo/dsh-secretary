/**
 * NATS NKey user credentials with `node:crypto` only.
 *
 * Encoding follows the official nkeys.js codec: base32 (RFC 4648 alphabet, no padding) over
 * `[prefix byte(s), payload, CRC-16/X-MODEM little-endian]`. A user public key is prefix 160 + 32
 * byte ed25519 public key; its seed is prefix [149, 0] + 32 byte ed25519 seed.
 */
import { createPrivateKey, createPublicKey, randomBytes } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const USER_PREFIX = 160
const USER_SEED_PREFIX = [149, 0]
/** PKCS#8 Ed25519 private key header (the 32-byte seed is the only body). */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

/** Role names that each own one NKey user on the Gateway. */
export type GatewayRole = 'center' | 'node'

/** Credential references under which DSH-managed credentials keep the two private seeds. */
export const CREDENTIAL_REFS: Readonly<Record<GatewayRole, string>> = {
  center: 'NATS_NKEY_SEED_CENTER',
  node: 'NATS_NKEY_SEED_NODE',
}

function crc16(bytes: Uint8Array): number {
  let crc = 0
  for (const byte of bytes) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(text: string): Uint8Array {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of text) {
    const digit = ALPHABET.indexOf(char)
    if (digit < 0) throw new Error(`gateway: invalid base32 in NKey`)
    value = (value << 5) | digit
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

function encode(prefix: readonly number[], payload: Uint8Array): string {
  const raw = Buffer.alloc(prefix.length + payload.length + 2)
  prefix.forEach((byte, index) => { raw[index] = byte })
  raw.set(payload, prefix.length)
  raw.writeUInt16LE(crc16(raw.subarray(0, raw.length - 2)), raw.length - 2)
  return base32Encode(raw)
}

function decode(text: string, prefix: readonly number[]): Buffer {
  let raw: Buffer
  try {
    raw = Buffer.from(base32Decode(text))
  } catch {
    throw new Error(`gateway: invalid NKey encoding`)
  }
  if (raw.length < prefix.length + 3) throw new Error('gateway: invalid NKey encoding')
  const body = raw.subarray(0, raw.length - 2)
  if (crc16(body) !== raw.readUInt16LE(raw.length - 2)) throw new Error('gateway: NKey checksum mismatch')
  if (!body.subarray(0, prefix.length).equals(Buffer.from(prefix))) throw new Error('gateway: NKey prefix mismatch')
  return Buffer.from(body.subarray(prefix.length))
}

/** Derive the user public key (`U…`) of a 32-byte ed25519 seed. */
function ed25519PublicKey(seed: Uint8Array): Uint8Array {
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' })
  const spki = createPublicKey(key).export({ format: 'der', type: 'spki' })
  return new Uint8Array(spki.subarray(spki.length - 32))
}

/** One generated user NKey: the private seed (goes to DSH-managed credentials) and its public key (goes to nats-server.conf). */
export interface NKeyPair {
  readonly seed: string
  readonly publicKey: string
}

/** Generate a fresh NKey user pair with the OS CSPRNG. */
export function createNKeyPair(seed: Uint8Array = new Uint8Array(randomBytes(32))): NKeyPair {
  if (seed.length !== 32) throw new Error('gateway: NKey seed must be 32 bytes')
  return { seed: encode(USER_SEED_PREFIX, seed), publicKey: encode([USER_PREFIX], ed25519PublicKey(seed)) }
}

/** Public key of an existing user seed (`SU…`); rejects malformed input. */
export function nkeyPublicKeyFromSeed(seedText: string): string {
  const seed = decode(seedText, USER_SEED_PREFIX)
  if (seed.length !== 32) throw new Error('gateway: NKey seed must be 32 bytes')
  return encode([USER_PREFIX], ed25519PublicKey(seed))
}

/** Accept a `U…` public key only. */
export function isNKeyPublicKey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return decode(value, [USER_PREFIX]).length === 32
  } catch {
    return false
  }
}
