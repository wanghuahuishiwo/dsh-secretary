/** Where the configured `nats-server` binary was found, or why not. */
export interface BinaryProbe {
    /** The configured value: a PATH entry name or a path. */
    readonly configured: string;
    readonly found: boolean;
    /** Absolute path when found. */
    readonly path?: string;
    /** The install command when not found. */
    readonly hint?: string;
}
export declare const NATS_SERVER_INSTALL_HINT = "brew install nats-server";
/** Probe the configured binary: a path is checked directly, a bare name is searched on PATH. */
export declare function locateNatsServer(configured: string, env?: NodeJS.ProcessEnv): Promise<BinaryProbe>;
/** Resolve the binary or fail with the install hint. */
export declare function requireNatsServer(configured: string, env?: NodeJS.ProcessEnv): Promise<string>;
//# sourceMappingURL=binary.d.ts.map