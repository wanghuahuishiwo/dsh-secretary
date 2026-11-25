import { type GatewayRole } from './nkey.ts';
import { type SubjectPermissions } from './permissions.ts';
export type GatewayMode = 'local' | 'remote';
/** A public key of one role's NKey user plus the credential reference that holds its seed elsewhere. */
export interface GatewayKeyRef {
    readonly ref: string;
    readonly publicKey: string;
}
/** The persisted Gateway settings (`settings.json`); never contains a seed. */
export interface GatewaySettings {
    readonly mode: GatewayMode;
    /** Client port, bound on 127.0.0.1 only. */
    readonly clientPort: number;
    /** Monitoring port (`/varz`, `/healthz`), bound on 127.0.0.1 only. */
    readonly monitorPort: number;
    /** `nats-server` binary: a PATH entry name or an absolute path. */
    readonly binary: string;
    /** Remote mode: Gateway address plus the credential references of the roles enabled on this machine. */
    readonly remote: {
        readonly url: string;
        readonly credentials: Readonly<Partial<Record<GatewayRole, string>>>;
    };
    /** Local mode: the generated public keys; the seeds live in DSH-managed credentials. */
    readonly keys: Readonly<Partial<Record<GatewayRole, GatewayKeyRef>>> | null;
}
/** A settings change; omitted fields keep their current value. */
export interface GatewaySettingsPatch {
    readonly mode?: GatewayMode;
    readonly clientPort?: number;
    readonly monitorPort?: number;
    readonly binary?: string;
    readonly remote?: GatewaySettings['remote'];
}
export declare const DEFAULT_SETTINGS: GatewaySettings;
/** Read `settings.json` under `$DSH_HOME/gateway/`; absent means defaults. */
export declare function readSettings(dshHome: string): Promise<GatewaySettings>;
/** Validate a patch against the stored settings and persist the merged result. */
export declare function updateSettings(dshHome: string, patch: GatewaySettingsPatch): Promise<GatewaySettings>;
/** Write settings atomically (mode 0600 is unnecessary: the file never holds a secret). */
export declare function saveSettings(dshHome: string, settings: GatewaySettings): Promise<GatewaySettings>;
/** The derived `nats-server.conf` text: loopback ports, explicit JetStream store_dir, public keys with each role's subject permissions. */
export declare function renderServerConfig(settings: GatewaySettings, paths: {
    readonly jetstream: string;
}, permissions?: Readonly<Partial<Record<GatewayRole, SubjectPermissions>>>): string;
//# sourceMappingURL=settings.d.ts.map