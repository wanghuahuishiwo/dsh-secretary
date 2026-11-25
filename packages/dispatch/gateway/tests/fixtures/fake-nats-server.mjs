#!/usr/bin/env node
/** A stand-in for nats-server: same CLI (`-c <conf>`), same monitoring endpoints, behaviour picked by FAKE_MODE. */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

const confIndex = process.argv.indexOf('-c')
const conf = readFileSync(process.argv[confIndex + 1], 'utf8')
const listen = /^listen: 127\.0\.0\.1:(\d+)$/m.exec(conf)[1]
const http = /^http: 127\.0\.0\.1:(\d+)$/m.exec(conf)[1]
const storeDir = /^ {2}store_dir: "(.*)"$/m.exec(conf)[1]
const mode = process.env.FAKE_MODE ?? 'ok'
// Dump the environment we received so tests can prove no seed reaches the child.
process.stdout.write(`env=${JSON.stringify(process.env)}\n`)
process.stdout.write(`fake nats-server v9.9.9 mode=${mode}\n`)
if (mode === 'ignore-sigterm') process.on('SIGTERM', () => { process.stdout.write('SIGTERM ignored\n') })
if (mode === 'exit') process.exit(3)
if (mode === 'deaf') { setInterval(() => {}, 1000); await new Promise(() => {}) }
// Like the real nats-server, which reports the configured store_dir with `jetstream/` appended.
const varz = { server_id: 'FAKE', version: '9.9.9', port: Number(listen), jetstream: { enabled: true, config: { store_dir: mode === 'wrong-store' ? '/elsewhere' : `${storeDir.replace(/\/+$/, '')}/jetstream` } } }
createServer((req, res) => {
  if (req.url === '/varz') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(varz)); return }
  if (req.url === '/healthz?js-enabled-only=true') { res.statusCode = 200; res.end('ok'); return }
  res.statusCode = 404; res.end()
}).listen(Number(http), '127.0.0.1')
