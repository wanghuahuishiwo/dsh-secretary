/**
 * The long-lived node identity (`nodeId`): a UUIDv4 written once by an explicit initialization into a dedicated file.
 * A normal start only reads and validates it; a missing or damaged file is an error, never a new identity.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { MessagingError } from './errors.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** `$DSH_HOME/dispatch/node/identity.json`: the file name carries the role, so roles on one host never share it. */
export function nodeIdPath(dshHome: string): string {
  return `${dshHome.replace(/\/+$/, '')}/dispatch/node/identity.json`
}

async function read(path: string): Promise<string> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MessagingError('messaging/identity-missing', `节点身份文件不存在：${path}。请先显式初始化 nodeId，不会自动生成`, { cause: error })
    }
    throw error
  }
  let nodeId: unknown
  try {
    nodeId = (JSON.parse(text) as { nodeId?: unknown }).nodeId
  } catch (error) {
    throw new MessagingError('messaging/identity-invalid', `节点身份文件损坏：${path}`, { cause: error })
  }
  if (typeof nodeId !== 'string' || !UUID.test(nodeId)) {
    throw new MessagingError('messaging/identity-invalid', `节点身份文件损坏（nodeId 不是 UUIDv4）：${path}`)
  }
  return nodeId
}

/** Read the nodeId of a normal start. */
export async function readNodeId(dshHome: string): Promise<string> {
  return read(nodeIdPath(dshHome))
}

/**
 * Explicit initialization: generate a UUIDv4 (`random` defaults to the OS CSPRNG) and write it without ever overwriting.
 * An existing file is left untouched and reported, whether valid or not.
 */
export async function initNodeId(dshHome: string, random: Uint8Array = new Uint8Array(randomBytes(16))): Promise<string> {
  const path = nodeIdPath(dshHome)
  await mkdir(dirname(path), { recursive: true })
  const nodeId = uuidV4(random)
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify({ nodeId }, null, 2)}\n`, { mode: 0o600 })
  try {
    await link(temporary, path) // atomic and fails when the identity already exists
  } catch (error) {
    await rm(temporary, { force: true })
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new MessagingError('messaging/identity-exists', `节点身份已存在，不覆盖：${path}`, { cause: error })
    throw error
  }
  await rm(temporary)
  return nodeId
}

/** RFC 4122 UUIDv4 of 16 random bytes: version and variant nibbles are fixed, the rest is the random source. */
function uuidV4(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('messaging: UUIDv4 needs 16 random bytes')
  const b = Buffer.from(bytes)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = b.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
