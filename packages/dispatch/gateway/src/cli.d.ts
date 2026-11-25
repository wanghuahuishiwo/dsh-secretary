export declare const GATEWAY_USAGE = "usage: dsh-secretary gateway <start|stop|restart|status>";
/** Where the CLI reads/writes; `env` defaults to `process.env`. */
export interface CliIo {
    readonly stdout: {
        write(chunk: string): unknown;
    };
    readonly stderr: {
        write(chunk: string): unknown;
    };
    readonly env?: NodeJS.ProcessEnv;
    readonly argv?: readonly string[];
}
/**
 * `dsh-secretary gateway <action>`: the same shared logic as the console buttons, usable while DSH is not running.
 * Resolves to the process exit code: 0 on success, 1 for a reported error, 2 for usage.
 */
export declare function gatewayCommand(args: readonly string[], io: CliIo): Promise<number>;
//# sourceMappingURL=cli.d.ts.map