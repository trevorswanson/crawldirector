// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const {
  requireUser,
  getCampaignForUser,
  getCampaignIntegrityReport,
  getActiveCampaignJob,
  notFound,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getCampaignForUser: vi.fn(),
  getCampaignIntegrityReport: vi.fn(),
  getActiveCampaignJob: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/references", () => ({ getCampaignIntegrityReport }));
vi.mock("@/server/services/jobs", () => ({ getActiveCampaignJob }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/integrity/migrate-entity-data-button", () => ({
  MigrateEntityDataButton: ({
    activeJob,
  }: {
    activeJob?: { status: "QUEUED" | "RUNNING" } | null;
  }) => <div data-testid="repair-data-button">{activeJob?.status ?? "idle"}</div>,
}));

import CampaignIntegrityPage from "@/app/(dm)/campaigns/[id]/integrity/page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "World One",
    members: [{ role: "OWNER" }],
  });
  getCampaignIntegrityReport.mockResolvedValue({
    checkedEntities: 7,
    brokenReferences: [
      {
        entityId: "item1",
        entityName: "Missing Ref",
        entityType: "ITEM",
        field: "itemTypeId",
        patchKey: "data.itemTypeId",
        targetType: "ITEM_TYPE",
        targetId: "missing-target",
        reason: "MISSING",
      },
      {
        entityId: "item2",
        entityName: "Wrong Type Ref",
        entityType: "ITEM",
        field: "itemTypeId",
        patchKey: "data.itemTypeId",
        targetType: "ITEM_TYPE",
        targetId: "npc1",
        reason: "WRONG_TYPE",
        actualType: "NPC",
      },
    ],
    staleData: [
      {
        entityId: "floor1",
        entityName: "Legacy Floor",
        entityType: "FLOOR",
        storedVersion: 1,
        currentVersion: 2,
      },
    ],
  });
  getActiveCampaignJob.mockResolvedValue(null);
});

afterEach(() => cleanup());

describe("CampaignIntegrityPage", () => {
  it("renders broken references and stale data rows for a DM", async () => {
    render(await CampaignIntegrityPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByRole("heading", { name: /Canon Integrity/i })).toBeTruthy();
    expect(screen.getByText("World One")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Missing Ref")).toBeTruthy();
    expect(screen.getByText("MISSING")).toBeTruthy();
    expect(screen.getByText("Wrong Type Ref")).toBeTruthy();
    expect(screen.getByText(/actual NPC/i)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /open entity/i })).toHaveLength(2);
    expect(screen.getByText("Legacy Floor")).toBeTruthy();
    expect(screen.getByText("v1 -> v2")).toBeTruthy();
    expect(screen.getByText(/older saved format/i)).toBeTruthy();
    expect(screen.getByText(/Queue a repair pass/i)).toBeTruthy();
    expect(screen.queryByText(/MIGRATE_ENTITY_DATA/)).toBeNull();
    expect(screen.queryByText(/descriptor version/i)).toBeNull();
    expect(screen.getByTestId("repair-data-button").textContent).toBe("idle");
    expect(getCampaignIntegrityReport).toHaveBeenCalledWith("u1", "c1");
    expect(getActiveCampaignJob).toHaveBeenCalledWith("u1", "c1", "MIGRATE_ENTITY_DATA");
  });

  it("passes an active data repair job to the repair control", async () => {
    getActiveCampaignJob.mockResolvedValue({
      id: "j1",
      kind: "MIGRATE_ENTITY_DATA",
      status: "RUNNING",
      error: null,
      result: null,
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: null,
    });

    render(await CampaignIntegrityPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByTestId("repair-data-button").textContent).toBe("RUNNING");
  });

  it("renders an empty state when no integrity issues are found", async () => {
    getCampaignIntegrityReport.mockResolvedValue({
      checkedEntities: 3,
      brokenReferences: [],
      staleData: [],
    });

    render(await CampaignIntegrityPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText(/No integrity issues detected/i)).toBeTruthy();
    expect(getActiveCampaignJob).not.toHaveBeenCalled();
  });

  it("404s when the campaign is not visible to the user", async () => {
    getCampaignForUser.mockResolvedValue(null);

    await expect(
      CampaignIntegrityPage({ params: Promise.resolve({ id: "c1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getCampaignIntegrityReport).not.toHaveBeenCalled();
  });

  it("404s for player memberships", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c1",
      name: "World One",
      members: [{ role: "PLAYER" }],
    });

    await expect(
      CampaignIntegrityPage({ params: Promise.resolve({ id: "c1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getCampaignIntegrityReport).not.toHaveBeenCalled();
  });
});
