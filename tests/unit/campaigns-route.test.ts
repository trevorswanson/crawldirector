import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, listCampaignsForUser } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listCampaignsForUser: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ listCampaignsForUser }));

import { GET } from "@/app/api/campaigns/route";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
});

describe("GET /api/campaigns", () => {
  it("returns only the campaign switcher fields for the current user", async () => {
    listCampaignsForUser.mockResolvedValue([
      {
        id: "c1",
        name: "Floor One",
        summary: "Full service shape",
        createdAt: new Date(),
        members: [{ role: "OWNER" }],
      },
    ]);

    const response = await GET();

    expect(listCampaignsForUser).toHaveBeenCalledWith("u1");
    expect(await response.json()).toEqual({
      campaigns: [{ id: "c1", name: "Floor One" }],
    });
  });
});
