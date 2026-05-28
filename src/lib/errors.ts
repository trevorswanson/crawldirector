// Thrown by the service layer for expected, user-facing failures (e.g. a
// duplicate email). Server Actions catch these and surface the message;
// anything else is an unexpected error and should not leak to the client.
export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceError";
  }
}
