import type { Context } from '@deepseek-ai/cordis'
import { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { noConfig } from 'dsh-secretary-core/tooling'

export interface Config {}
export const Config = noConfig('dsh-secretary-storage')
export const name = 'dsh-secretary-storage'
export const inject = ['storage', storageBackendServiceKey('sqlite')]

export function apply(ctx: Context): void {
  const facility = new DomainFacility(ctx, { backend: 'sqlite', routes: {} })
  ctx.effect(() => {
    const unmount = ctx.storage.mount('secretaryDomain', facility)
    return async () => {
      await facility.closeAll()
      unmount()
    }
  })
  ctx.provide('secretaryStorageDomain', facility)
}
