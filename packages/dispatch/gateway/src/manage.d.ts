import { type GatewayStatus, type LaunchRecord } from './status.ts';
/** Where private seeds live: DSH-managed credentials in the Host, the environment in the CLI. */
export interface SecretStore {
    resolve(ref: string): Promise<string | undefined>;
    set(ref: string, value: string): Promise<void>;
}
export interface StartOptions {
    /** Who asked for the start; recorded in launch.json. */
    readonly by?: LaunchRecord['by'];
    /** Private-seed store for first-time key generation. */
    readonly secrets?: SecretStore;
    /** Ready deadline; the default is the 10 second contract. */
    readonly readyTimeoutMs?: number;
    /** Extra environment for the child beyond PATH/HOME/TMPDIR/LANG; never pass seeds here. */
    readonly env?: Readonly<Record<string, string>>;
}
/** Start the Gateway as a detached child; returns once the readiness probe passes. */
export declare function startGateway(dshHome: string, options?: StartOptions): Promise<GatewayStatus>;
export interface StopOptions {
    /** How long SIGTERM may take; the default is the 10 second contract. Never SIGKILL. */
    readonly stopTimeoutMs?: number;
}
/** Send SIGTERM to our recorded Gateway and wait for it to exit; never force-kills. */
export declare function stopGateway(dshHome: string, options?: StopOptions): Promise<GatewayStatus>;
/** Explicit restart: stop first; a stop that times out aborts without starting. */
export declare function restartGateway(dshHome: string, options?: StartOptions & StopOptions): Promise<GatewayStatus>;
//# sourceMappingURL=manage.d.ts.map