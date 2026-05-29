import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUser,
  createCampaign,
  createCrawler,
  createGenericEntity,
  getEntityForUser,
  updateEntity,
  archiveEntity,
  approveChangeSet,
  rejectChangeSet,
  setChangeOperationDecision,
  setEntityLock,
  signOut,
  redirect,
  revalidatePath,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createCampaign: vi.fn(),
  createCrawler: vi.fn(),
  createGenericEntity: vi.fn(),
  getEntityForUser: vi.fn(),
  updateEntity: vi.fn(),
  archiveEntity: vi.fn(),
  approveChangeSet: vi.fn(),
  rejectChangeSet: vi.fn(),
  setChangeOperationDecision: vi.fn(),
  setEntityLock: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ createCampaign }));
vi.mock("@/server/services/entities", () => ({
  archiveEntity,
  createCrawler,
  createGenericEntity,
  getEntityForUser,
  updateEntity,
}));
vi.mock("@/server/services/review", () => ({
  approveChangeSet,
  rejectChangeSet,
  setChangeOperationDecision,
  setEntityLock,
}));
vi.mock("@/server/auth", () => ({ signOut }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  archiveEntityAction,
  approveChangeSetAction,
  createCampaignAction,
  createCrawlerAction,
  createGenericEntityAction,
  rejectChangeSetAction,
  setChangeOperationDecisionAction,
  toggleEntityFieldLockAction,
  toggleEntityLockAction,
  signOutAction,
  updateEntityAction,
} from "@/app/(dm)/actions";

import { ServiceError } from "@/lib/errors";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
});

describe("createCampaignAction", () => {
  it("returns a validation error for an empty name", async () => {
    const result = await createCampaignAction(undefined, form({ name: "" }));
    expect(result?.error).toBeTruthy();
    expect(createCampaign).not.toHaveBeenCalled();
  });

  it("creates the campaign and redirects to its page", async () => {
    createCampaign.mockResolvedValue({ id: "c1" });

    await expect(
      createCampaignAction(undefined, form({ name: "World", summary: "" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createCampaign).toHaveBeenCalledWith("u1", {
      name: "World",
      summary: "",
    });
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1");
  });

  it("returns a generic error when creation fails", async () => {
    createCampaign.mockRejectedValue(new Error("db down"));
    const result = await createCampaignAction(
      undefined,
      form({ name: "World", summary: "" }),
    );
    expect(result?.error).toBe("Could not create the campaign. Please try again.");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("signOutAction", () => {
  it("signs out and redirects to sign-in", async () => {
    await signOutAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/sign-in" });
  });
});

describe("createGenericEntityAction", () => {
  it("validates input before creating", async () => {
    const result = await createGenericEntityAction(
      "c1",
      undefined,
      form({ type: "CRAWLER", name: "" }),
    );
    expect(result?.error).toBeTruthy();
    expect(createGenericEntity).not.toHaveBeenCalled();
  });

  it("creates a generic entity and redirects to detail", async () => {
    createGenericEntity.mockResolvedValue({ id: "e1" });

    await expect(
      createGenericEntityAction(
        "c1",
        undefined,
        form({
          type: "NPC",
          name: "Zev",
          summary: "",
          description: "",
          visibility: "DM_ONLY",
          tags: "admin",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createGenericEntity).toHaveBeenCalledWith("u1", "c1", {
      type: "NPC",
      name: "Zev",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["admin"],
    });
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
  });

  it("returns a generic error when generic entity creation fails", async () => {
    createGenericEntity.mockRejectedValue(new Error("db down"));
    const result = await createGenericEntityAction(
      "c1",
      undefined,
      form({ type: "NPC", name: "Zev" }),
    );

    expect(result?.error).toBe("Could not create the entity. Please try again.");
  });
});

describe("createCrawlerAction", () => {
  it("validates crawler input before creating", async () => {
    const result = await createCrawlerAction(
      "c1",
      undefined,
      form({ name: "", level: "0" }),
    );

    expect(result?.error).toBeTruthy();
    expect(createCrawler).not.toHaveBeenCalled();
  });

  it("creates a crawler and redirects to detail", async () => {
    createCrawler.mockResolvedValue({ id: "e2" });

    await expect(
      createCrawlerAction(
        "c1",
        undefined,
        form({
          name: "Carl",
          summary: "",
          description: "",
          visibility: "PLAYER_FACING",
          tags: "",
          level: "2",
          gold: "1",
          viewCount: "100",
          followerCount: "10",
          favoriteCount: "2",
          killCount: "3",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createCrawler).toHaveBeenCalledWith(
      "u1",
      "c1",
      expect.objectContaining({
        name: "Carl",
        level: 2,
        viewCount: BigInt(100),
        followerCount: BigInt(10),
        favoriteCount: BigInt(2),
      }),
    );
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
  });

  it("returns a generic error when crawler creation fails", async () => {
    createCrawler.mockRejectedValue(new Error("db down"));
    const result = await createCrawlerAction(
      "c1",
      undefined,
      form({ name: "Carl", level: "1" }),
    );

    expect(result?.error).toBe("Could not create the crawler. Please try again.");
  });
});

describe("updateEntityAction", () => {
  it("validates update input before saving", async () => {
    const result = await updateEntityAction(
      "c1",
      "e1",
      undefined,
      form({ type: "NPC", name: "" }),
    );

    expect(result?.error).toBeTruthy();
    expect(updateEntity).not.toHaveBeenCalled();
  });

  it("updates an entity and revalidates relevant routes", async () => {
    await expect(
      updateEntityAction(
        "c1",
        "e1",
        undefined,
        form({
          type: "NPC",
          name: "Zev",
          summary: "",
          description: "",
          visibility: "DM_ONLY",
          tags: "",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(updateEntity).toHaveBeenCalledWith(
      "u1",
      "c1",
      "e1",
      expect.objectContaining({ type: "NPC", name: "Zev" }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
  });

  it("returns a generic error when update fails", async () => {
    updateEntity.mockRejectedValue(new Error("db down"));
    const result = await updateEntityAction(
      "c1",
      "e1",
      undefined,
      form({
        type: "NPC",
        name: "Zev",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: "",
      }),
    );

    expect(result?.error).toBe("Could not update the entity. Please try again.");
  });

  it("surfaces a locked-field service error to the DM", async () => {
    updateEntity.mockRejectedValue(
      new ServiceError("This proposal touches locked entity fields."),
    );
    const result = await updateEntityAction(
      "c1",
      "e1",
      undefined,
      form({
        type: "NPC",
        name: "Zev",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: "",
      }),
    );

    expect(result?.error).toBe("This proposal touches locked entity fields.");
  });
});

describe("archiveEntityAction", () => {
  it("archives and redirects to the campaign page", async () => {
    await expect(archiveEntityAction("c1", "e1")).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(archiveEntity).toHaveBeenCalledWith("u1", "c1", "e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1");
  });
});

describe("review queue actions", () => {
  it("approves a change set and revalidates campaign surfaces", async () => {
    await approveChangeSetAction("c1", "cs1");

    expect(approveChangeSet).toHaveBeenCalledWith("u1", "c1", "cs1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("rejects a change set and revalidates the queue", async () => {
    await rejectChangeSetAction("c1", "cs1");

    expect(rejectChangeSet).toHaveBeenCalledWith("u1", "c1", "cs1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("sets an operation decision and revalidates the queue", async () => {
    await setChangeOperationDecisionAction("c1", "cs1", "op1", "REJECTED");

    expect(setChangeOperationDecision).toHaveBeenCalledWith(
      "u1",
      "c1",
      "cs1",
      "op1",
      { decision: "REJECTED" },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("ignores invalid operation decisions", async () => {
    await setChangeOperationDecisionAction("c1", "cs1", "op1", "EDITED");
    await setChangeOperationDecisionAction("c1", "cs1", "op1", "NOPE");

    expect(setChangeOperationDecision).not.toHaveBeenCalled();
  });
});

describe("toggleEntityLockAction", () => {
  it("flips the whole-entity lock and revalidates the entity page", async () => {
    getEntityForUser.mockResolvedValue({
      id: "e1",
      locked: false,
      lockedFields: [],
    });

    await toggleEntityLockAction("c1", "e1");

    expect(setEntityLock).toHaveBeenCalledWith("u1", "c1", "e1", {
      locked: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
  });

  it("is a no-op when the entity is inaccessible", async () => {
    getEntityForUser.mockResolvedValue(null);

    await toggleEntityLockAction("c1", "missing");

    expect(setEntityLock).not.toHaveBeenCalled();
  });
});

describe("toggleEntityFieldLockAction", () => {
  function fieldForm(field: string): FormData {
    const fd = new FormData();
    fd.set("field", field);
    return fd;
  }

  it("adds a field lock when not already locked", async () => {
    getEntityForUser.mockResolvedValue({
      id: "e1",
      locked: false,
      lockedFields: ["summary"],
    });

    await toggleEntityFieldLockAction("c1", "e1", fieldForm("name"));

    expect(setEntityLock).toHaveBeenCalledWith("u1", "c1", "e1", {
      lockedFields: ["summary", "name"],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
  });

  it("removes a field lock when already locked", async () => {
    getEntityForUser.mockResolvedValue({
      id: "e1",
      locked: false,
      lockedFields: ["name", "summary"],
    });

    await toggleEntityFieldLockAction("c1", "e1", fieldForm("name"));

    expect(setEntityLock).toHaveBeenCalledWith("u1", "c1", "e1", {
      lockedFields: ["summary"],
    });
  });

  it("ignores an unknown field", async () => {
    await toggleEntityFieldLockAction("c1", "e1", fieldForm("not-a-field"));

    expect(getEntityForUser).not.toHaveBeenCalled();
    expect(setEntityLock).not.toHaveBeenCalled();
  });

  it("is a no-op when the entity is inaccessible", async () => {
    getEntityForUser.mockResolvedValue(null);

    await toggleEntityFieldLockAction("c1", "missing", fieldForm("name"));

    expect(setEntityLock).not.toHaveBeenCalled();
  });
});
