import type { GatewayRole } from './nkey.ts';
/** `$DSH_HOME` when set, else the DSH default `~/.dsh` (same rule as the DSH home-paths helper). */
export declare function defaultDshHome(env?: NodeJS.ProcessEnv): string;
/** Every file the Gateway management owns, all under `$DSH_HOME/gateway/`. */
export interface GatewayPaths {
    readonly dir: string;
    readonly settings: string;
    readonly conf: string;
    readonly log: string;
    readonly launch: string;
    readonly jetstream: string;
    /** Subject permissions a role declares for itself; the messaging plugin writes it, the Gateway reads it at start. */
    readonly permissions: (role: GatewayRole) => string;
}
export declare function gatewayPaths(dshHome: string): GatewayPaths;
//# sourceMappingURL=paths.d.ts.map