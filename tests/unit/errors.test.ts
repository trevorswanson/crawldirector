import { describe, expect, it } from "vitest";

import { ServiceError } from "@/lib/errors";

describe("ServiceError", () => {
  it("is an Error with the ServiceError name and message", () => {
    const err = new ServiceError("boom");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.name).toBe("ServiceError");
    expect(err.message).toBe("boom");
    expect(err.code).toBeUndefined();
  });

  it("exposes a structured error code when provided", () => {
    const err = new ServiceError("boom", { code: "OPERATION_STALE" });
    expect(err.name).toBe("ServiceError");
    expect(err.code).toBe("OPERATION_STALE");
  });
});
