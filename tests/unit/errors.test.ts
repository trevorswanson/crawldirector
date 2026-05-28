import { describe, expect, it } from "vitest";

import { ServiceError } from "@/lib/errors";

describe("ServiceError", () => {
  it("is an Error with the ServiceError name and message", () => {
    const err = new ServiceError("boom");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.name).toBe("ServiceError");
    expect(err.message).toBe("boom");
  });
});
