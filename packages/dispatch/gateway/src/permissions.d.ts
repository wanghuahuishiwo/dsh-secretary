import type { GatewayRole } from './nkey.ts';
/**
 * What one role may do with events, as NATS subjects: `dsh.events.<type>` it publishes and subscribes to.
 * Kept in `$DSH_HOME/gateway/permissions.<role>.json`; the Gateway reads it when it starts.
 */
export interface SubjectPermissions {
    readonly publish: readonly string[];
    readonly subscribe: readonly string[];
}
/** The `permission: { … }` body of one user in `nats-server.conf`. */
export declare function renderPermissions(permissions: SubjectPermissions): string[];
/** Read both roles' declared permissions; a role without a file may only use JetStream itself. */
export declare function readPermissions(dshHome: string): Promise<Record<GatewayRole, SubjectPermissions>>;
//# sourceMappingURL=permissions.d.ts.map