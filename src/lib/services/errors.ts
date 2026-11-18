export class ServiceError extends Error {
  constructor(message: string, public readonly code: "validation" | "not_found" | "forbidden" | "db" = "db") {
    super(message);
    this.name = "ServiceError";
  }
}

export function fromDb(error: { message: string; code?: string } | null, context: string): never | void {
  if (!error) return;
  if (error.code === "42501") throw new ServiceError(error.message || "You don't have access to this.", "forbidden");
  throw new ServiceError(`${context}: ${error.message}`);
}
