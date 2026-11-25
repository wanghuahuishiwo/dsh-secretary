/** Real-Gateway tracer of this package; runs only when `DSH_NATS_SERVER` names the nats-server binary. */
import { test } from 'node:test'
import { register } from './scenario.mjs'

register(test, { strict: false })
