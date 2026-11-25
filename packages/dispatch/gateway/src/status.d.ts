import { type GatewaySettings } from './settings.ts';
/** Every state the shared logic can report. */
export type GatewayState = 'not-started' | 'starting' | 'running' | 'stopping' | 'stopped' | 'start-failed' | 'abnormal-exit' | 'record-invalid' | 'unknown' | 'unmanaged' | 'remote';
/** Chinese label of each state, shared by the console and the CLI. */
export declare const STATE_LABELS: Readonly<Record<GatewayState, string>>;
/** The launch record (`launch.json`): the only thing that ties a pid to "our" Gateway. */
export interface LaunchRecord {
    readonly pid: number;
    readonly startedAt: string;
    readonly by: 'console' | 'cli';
    readonly stopRequestedAt?: string;
    readonly exit?: {
        readonly reason: 'stopped' | 'abnormal';
        readonly at: string;
    };
}
/** Result of probing the Gateway; a pure derivation from files, the pid and `/varz`. */
export interface GatewayStatus {
    readonly state: GatewayState;
    readonly mode: GatewaySettings['mode'];
    readonly label: string;
    readonly pid?: number;
    readonly version?: string;
    readonly startedAt?: string;
    readonly startedBy?: LaunchRecord['by'];
    readonly endedAt?: string;
    /** Client address: `nats://127.0.0.1:<port>` locally, the configured address in remote mode. */
    readonly clientUrl: string;
    /** Monitoring base URL (`/varz`, `/healthz`); absent in remote mode. */
    readonly monitorUrl?: string;
    readonly binary: {
        readonly configured: string;
        readonly found: boolean;
        readonly hint?: string;
    };
    /** Last lines of nats-server.log, attached to failure states. */
    readonly logTail?: string;
    /** Human-readable reason for the state when it is not obvious. */
    readonly detail?: string;
}
/** Seconds a start may take before it counts as failed and the process is terminated. */
export declare const READY_TIMEOUT_MS = 10000;
/** Seconds a stop may take after SIGTERM before it is reported as stuck (never force-killed). */
export declare const STOP_TIMEOUT_MS = 10000;
export declare function isProcessAlive(pid: number): boolean;
/** Derive the Gateway status without holding any process handle. */
export declare function probeGateway(dshHome: string): Promise<GatewayStatus>;
//# sourceMappingURL=status.d.ts.map