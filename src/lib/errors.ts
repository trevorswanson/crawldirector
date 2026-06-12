export type ServiceErrorCode =
  | "OPERATION_STALE"
  | "OPERATION_BLOCKED"
  | "NO_ACCEPTED_OPERATIONS";

// Thrown by the service layer for expected, user-facing failures (e.g. a
// duplicate email). Server Actions catch these and surface the message;
// anything else is an unexpected error and should not leak to the client.
export class ServiceError extends Error {
  readonly code?: ServiceErrorCode;

  constructor(message: string, options?: { code?: ServiceErrorCode }) {
    super(message);
    this.name = "ServiceError";
    this.code = options?.code;
  }
}
