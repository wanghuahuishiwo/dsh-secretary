import type { Context } from '@deepseek-ai/cordis'
import { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainError, DomainFacility, descriptorOf } from '@deepseek-ai/dsh-storage-domain'
import type { Domain, DomainSpec } from '@deepseek-ai/dsh-storage-domain'

declare module '@deepseek-ai/dsh-storage' {
  /** The Secretary-owned domain form; the host's own `domain` form stays untouched. */
  interface StorageForms {
    secretaryDomain: DomainFacility
  }
}
import { noConfig } from 'dsh-secretary-tooling'

export interface Config {}
export const Config = noConfig('dsh-secretary-storage-domain')
export const name = 'dsh-secretary-storage-domain'
export const inject = ['storage', storageBackendServiceKey('sqlite')]

/** Domain that holds records this layer had to move aside to keep a domain readable. */
export const QUARANTINE_DOMAIN = 'secretary_quarantine'
const QUARANTINE_TABLE = 'records'
/**
 * Bound on repair attempts for one open call. Each attempt removes exactly one
 * rejected record, so this only guards against a pathological medium; a domain
 * with more bad records than this still fails loud instead of looping.
 */
const MAX_REPAIRS = 100

/** One stored record moved out of its domain because it no longer parses. */
export interface QuarantinedRecord {
  /** Domain whose open rejected the record. */
  readonly domain: string
  /** Table the record lived in. */
  readonly table: string
  /** Key of the record. */
  readonly key: string
  /** Why the record was rejected (the schema failure behind `invalid-record`). */
  readonly reason: string
  /** The stored value, byte-for-byte as the medium held it. */
  readonly raw: unknown
  /** When this layer moved the record aside. */
  readonly quarantinedAt: string
}

// The facility only calls `valueSchema.parse`; every secretary service declares
// its record schemas the same way instead of importing zod.
const quarantineSpec = {
  name: QUARANTINE_DOMAIN,
  version: 1,
  tables: {
    [QUARANTINE_TABLE]: {
      valueSchema: {
        parse(value: unknown) {
          const record = value as Partial<QuarantinedRecord> | null
          if (typeof record !== 'object' || record === null
            || typeof record.domain !== 'string' || typeof record.table !== 'string'
            || typeof record.key !== 'string' || typeof record.reason !== 'string'
            || !('raw' in record) || typeof record.quarantinedAt !== 'string') {
            throw new Error('secretary: invalid stored quarantine record')
          }
          return record as QuarantinedRecord
        },
      },
    },
  },
} as unknown as DomainSpec

function invalidRecordOf(error: unknown): { table: string; key: string } | undefined {
  if (!(error instanceof DomainError) || error.code !== 'invalid-record') return undefined
  const { table, key } = error.detail ?? { table: '', key: '' }
  // `''` marks the global slot, which has no per-record document to move aside.
  if (table === '' || key === '') return undefined
  return { table, key }
}

/**
 * The secretary domain facility. Same open semantics as the host facility, plus
 * one repair step: a stored record that fails its schema is moved to
 * {@link QUARANTINE_DOMAIN} and removed from its own table, then the open is
 * retried. A single unusable record must not make a whole domain — and every
 * service that reads it — unavailable.
 */
class SecretaryDomainFacility extends DomainFacility {
  private readonly repairCtx: Context
  private readonly backendName: string

  constructor(ctx: Context, config: { backend: string; routes?: Record<string, string> }) {
    super(ctx, config)
    this.repairCtx = ctx
    this.backendName = config.backend
  }

  override async open<S extends DomainSpec>(spec: S): Promise<Domain<S>> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await super.open(spec)
      } catch (error) {
        const rejected = invalidRecordOf(error)
        if (rejected === undefined || attempt >= MAX_REPAIRS) throw error
        await this.quarantine(spec, rejected, error)
      }
    }
  }

  /** Move one rejected record aside, then leave its table readable. */
  private async quarantine(
    spec: DomainSpec,
    rejected: { table: string; key: string },
    cause: unknown,
  ): Promise<void> {
    const backend = this.repairCtx.storage.backend.get(this.backendName)
    if (backend.kv === undefined) throw cause
    const unit = await backend.kv.open(descriptorOf(spec))
    try {
      const snapshot = await unit.loadAll()
      const raw = snapshot.tables[rejected.table]?.[rejected.key]
      if (raw === undefined) throw cause
      const record: QuarantinedRecord = {
        domain: spec.name,
        table: rejected.table,
        key: rejected.key,
        reason: (cause as Error & { cause?: unknown }).cause instanceof Error
          ? ((cause as Error & { cause: Error }).cause).message
          : String((cause as Error).message),
        raw,
        quarantinedAt: new Date().toISOString(),
      }
      // Quarantine first: the medium keeps the record if this write fails.
      await this.putQuarantine(record)
      await unit.deleteRecord(rejected.table, rejected.key)
      this.repairCtx.logger?.error?.(
        `secretary: domain '${spec.name}' record '${rejected.key}' in table '${rejected.table}' `
        + `no longer matches its schema; moved to domain '${QUARANTINE_DOMAIN}' (${record.reason})`,
      )
    } finally {
      await unit.close()
    }
  }

  private async putQuarantine(record: QuarantinedRecord): Promise<void> {
    const domain = await super.open(quarantineSpec)
    try {
      const key = `${record.domain}:${record.table}:${record.key}:${record.quarantinedAt}`
      await domain.table(QUARANTINE_TABLE).put(key, record)
    } finally {
      await domain.close()
    }
  }
}

export function apply(ctx: Context): void {
  const facility = new SecretaryDomainFacility(ctx, { backend: 'sqlite', routes: {} })
  ctx.effect(() => {
    const unmount = ctx.storage.mount('secretaryDomain', facility)
    return async () => {
      await facility.closeAll()
      unmount()
    }
  })
  ctx.provide('secretaryStorageDomain', facility)
}
