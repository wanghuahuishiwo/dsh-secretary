/**
 * Bundle tracer for #100: the Outbox relay and the durable consumer acceptance on a real Gateway (nats-server + JetStream),
 * including real process crashes of a role host. The scenarios live with the messaging plugin; the binary is mandatory here.
 */
import { test } from 'node:test'
import { register } from '../../../dispatch/messaging/tests/reliability.mjs'

register(test, { strict: true })
