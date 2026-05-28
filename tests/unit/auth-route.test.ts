import { describe, expect, it, vi } from "vitest";

const { GET: mockGet, POST: mockPost } = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  handlers: { GET: mockGet, POST: mockPost },
}));

import { GET, POST } from "@/app/api/auth/[...nextauth]/route";

describe("auth route handler", () => {
  it("re-exports the NextAuth GET and POST handlers", () => {
    expect(GET).toBe(mockGet);
    expect(POST).toBe(mockPost);
  });
});
