/** Role names that each own one NKey user on the Gateway. */
export type GatewayRole = 'center' | 'node';
/** Credential references under which DSH-managed credentials keep the two private seeds. */
export declare const CREDENTIAL_REFS: Readonly<Record<GatewayRole, string>>;
/** One generated user NKey: the private seed (goes to DSH-managed credentials) and its public key (goes to nats-server.conf). */
export interface NKeyPair {
    readonly seed: string;
    readonly publicKey: string;
}
/** Generate a fresh NKey user pair with the OS CSPRNG. */
export declare function createNKeyPair(seed?: Uint8Array): NKeyPair;
/** Public key of an existing user seed (`SU…`); rejects malformed input. */
export declare function nkeyPublicKeyFromSeed(seedText: string): string;
/** Accept a `U…` public key only. */
export declare function isNKeyPublicKey(value: unknown): value is string;
//# sourceMappingURL=nkey.d.ts.map