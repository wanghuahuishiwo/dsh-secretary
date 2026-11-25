/**
 * Bundle tracer for #99: center and node realms in one DSH host exchange CloudEvents through a real Gateway
 * (nats-server + JetStream). The scenarios live with the messaging plugin; here the nats-server binary is mandatory.
 */
import { test } from 'node:test'
import { register } from '../../../dispatch/messaging/tests/scenario.mjs'

register(test, { strict: true })
