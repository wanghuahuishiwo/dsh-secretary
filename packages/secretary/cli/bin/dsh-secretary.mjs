#!/usr/bin/env node
// Thin agent CLI for the running DSH host: exchanges the session launch token
// for an API cookie on /connect, then calls the secretaryTime / secretaryTag
// agentInvoke Remotes over the official /api Connection envelope. No domain
// logic lives here; failures keep the Service contract's codes and messages.
import { randomUUID } from 'node:crypto'

const DOMAINS = { time: 'secretaryTime', tag: 'secretaryTag' }

function usage(message) {
  process.stderr.write(`${message ?? ''}\nusage: dsh-secretary <time|tag> <op> [--field value ...] [--json '<object>']\n`)
  process.exit(2)
}

function parseArgs(argv) {
  const input = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) usage(`unexpected argument ${JSON.stringify(token)}`)
    const equals = token.indexOf('=')
    const key = equals === -1 ? token.slice(2) : token.slice(2, equals)
    if (key === 'json') {
      const raw = equals === -1 ? argv[++index] : token.slice(equals + 1)
      if (raw === undefined) usage('--json needs a JSON object')
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        usage(`--json is not valid JSON: ${raw}`)
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) usage('--json needs a JSON object')
      Object.assign(input, parsed)
      continue
    }
    if (key.length === 0) usage('empty -- argument')
    const raw = equals === -1 ? argv[++index] : token.slice(equals + 1)
    if (raw === undefined) usage(`--${key} needs a value`)
    // Integer-looking flags become numbers for the strict Remote codec; pass a
    // quoted string through --json when a field genuinely holds numeric text.
    input[key] = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false
      : /^-?\d+$/.test(raw) ? Number(raw) : raw
  }
  return input
}

function fail(message, code) {
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`)
  process.exit(1)
}

async function connectCookie(origin, token) {
  let response
  try {
    response = await fetch(`${origin}/connect?token=${encodeURIComponent(token)}&interactions=none`, {
      redirect: 'manual',
      headers: { accept: 'application/json' },
    })
  } catch (error) {
    fail(`dsh-secretary: cannot reach the DSH host at ${origin}; is DSH running? (${error.cause?.message ?? error.message})`, 'secretary-cli/host-unreachable')
  }
  if (response.status !== 302) fail(`dsh-secretary: /connect refused with HTTP ${response.status}; re-run inside a DSH session`, 'secretary-cli/connect-refused')
  const cookies = response.headers.getSetCookie().map(line => line.split(';', 1)[0]).filter(Boolean)
  if (cookies.length === 0) fail('dsh-secretary: /connect returned no API credential', 'secretary-cli/no-credential')
  return cookies.join('; ')
}

async function invoke(origin, cookie, endpoint, input) {
  let response
  try {
    response = await fetch(`${origin}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', cookie },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload: { args: { input } } }),
    })
  } catch (error) {
    fail(`dsh-secretary: /api call failed (${error.cause?.message ?? error.message})`, 'secretary-cli/host-unreachable')
  }
  if (!response.ok) fail(`dsh-secretary: ${endpoint} failed with HTTP ${response.status}`, 'secretary-cli/http-failure')
  const envelope = await response.json()
  if (envelope?.type !== 'server-response' || envelope?.result === undefined) {
    fail(`dsh-secretary: ${endpoint} returned a malformed envelope`, 'secretary-cli/protocol')
  }
  const { result } = envelope
  if (result.ok !== true) {
    process.stderr.write(`${JSON.stringify({ error: result.error })}\n`)
    process.exit(1)
  }
  return result.value
}

const [domain, op, ...rest] = process.argv.slice(2)
const namespace = DOMAINS[domain]
if (namespace === undefined || op === undefined) {
  usage(`unknown domain ${JSON.stringify(domain ?? '')}; expected time or tag`)
}
const origin = process.env.DSH_SECRETARY_URL
const token = process.env.DSH_SECRETARY_TOKEN
if (origin === undefined || origin === '' || token === undefined || token === '') {
  usage('dsh-secretary must run inside a DSH session (missing DSH_SECRETARY_URL / DSH_SECRETARY_TOKEN); start DSH and call it from an agent shell')
}
const input = { op, ...parseArgs(rest) }
const cookie = await connectCookie(origin, token)
const value = await invoke(origin, cookie, `${namespace}/agentInvoke`, input)
process.stdout.write(`${JSON.stringify(value)}\n`)
