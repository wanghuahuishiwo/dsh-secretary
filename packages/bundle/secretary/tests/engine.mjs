/** Bundle tracer for #102: the engine wired to the messaging plugin on a real Gateway; the scenarios live with the engine. */
import { test } from 'node:test'
import { register } from '../../../dispatch/engine/tests/tracer.mjs'

register(test, { strict: true })
