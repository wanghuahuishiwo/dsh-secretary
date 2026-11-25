import type { GatewayStatus } from './status.ts';
/** Error codes of the shared Gateway logic; the Remote and the CLI surface them unchanged. */
export type GatewayErrorCode = 'gateway/invalid-settings' | 'gateway/keys-missing' | 'gateway/keys-unavailable' | 'gateway/not-installed' | 'gateway/remote-mode' | 'gateway/not-managed' | 'gateway/invalid-permissions' | 'gateway/start-failed' | 'gateway/stop-timeout' | 'gateway/usage';
/** The single error type thrown by the shared Gateway logic. */
export declare class GatewayError extends Error {
    readonly code: GatewayErrorCode;
    /** The status observed when the action failed (start/stop failures). */
    readonly status?: GatewayStatus;
    constructor(code: GatewayErrorCode, message: string, status?: GatewayStatus);
}
//# sourceMappingURL=errors.d.ts.map