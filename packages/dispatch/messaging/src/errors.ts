/** Error codes of the messaging plugin; the Cordis loader and callers see them unchanged. */
export type MessagingErrorCode =
  | 'messaging/type-invalid'
  | 'messaging/envelope-invalid'
  | 'messaging/identity-missing'
  | 'messaging/identity-invalid'
  | 'messaging/identity-exists'
  | 'messaging/not-declared'
  | 'messaging/role-not-configured'
  | 'messaging/tls-required'
  | 'messaging/seed-unavailable'

/** The single error type thrown by the messaging plugin before it reaches NATS. */
export class MessagingError extends Error {
  readonly code: MessagingErrorCode
  constructor(code: MessagingErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MessagingError'
    this.code = code
  }
}
