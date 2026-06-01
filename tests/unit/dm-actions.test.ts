import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUser,
  createCampaign,
  getCampaignCanonIntegrity,
  createCrawler,
  createGenericEntity,
  getEntityForUser,
  updateEntity,
  archiveEntity,
  approveChangeSet,
  approveChangeSetRun,
  rejectChangeSet,
  rejectChangeSetRun,
  setChangeOperationDecision,
  supersedeChangeSet,
  setEntityLock,
  createRelationship,
  archiveRelationship,
  setRelationshipLock,
  createEvent,
  archiveEvent,
  setEventLock,
  linkEventCause,
  archiveEventCausality,
  signOut,
  redirect,
  revalidatePath,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createCampaign: vi.fn(),
  getCampaignCanonIntegrity: vi.fn(),
  createCrawler: vi.fn(),
  createGenericEntity: vi.fn(),
  getEntityForUser: vi.fn(),
  updateEntity: vi.fn(),
  archiveEntity: vi.fn(),
  approveChangeSet: vi.fn(),
  approveChangeSetRun: vi.fn(),
  rejectChangeSet: vi.fn(),
  rejectChangeSetRun: vi.fn(),
  setChangeOperationDecision: vi.fn(),
  supersedeChangeSet: vi.fn(),
  setEntityLock: vi.fn(),
  createRelationship: vi.fn(),
  archiveRelationship: vi.fn(),
  setRelationshipLock: vi.fn(),
  createEvent: vi.fn(),
  archiveEvent: vi.fn(),
  setEventLock: vi.fn(),
  linkEventCause: vi.fn(),
  archiveEventCausality: vi.fn(),
  signOut: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({
  createCampaign,
  getCampaignCanonIntegrity,
}));
vi.mock("@/server/services/entities", () => ({
  archiveEntity,
  createCrawler,
  createGenericEntity,
  getEntityForUser,
  updateEntity,
}));
vi.mock("@/server/services/review", () => ({
  approveChangeSet,
  approveChangeSetRun,
  rejectChangeSet,
  rejectChangeSetRun,
  setChangeOperationDecision,
  supersedeChangeSet,
  setEntityLock,
}));
vi.mock("@/server/services/relationships", () => ({
  createRelationship,
  archiveRelationship,
  setRelationshipLock,
}));
vi.mock("@/server/services/events", () => ({
  createEvent,
  archiveEvent,
  setEventLock,
  linkEventCause,
  archiveEventCausality,
}));
vi.mock("@/server/auth", () => ({ signOut }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  archiveEntityAction,
  approveChangeSetAction,
  approveChangeSetRunAction,
  createCampaignAction,
  createCrawlerAction,
  createGenericEntityAction,
  quickCreateEntityAction,
  getCampaignCanonIntegrityAction,
  editChangeOperationPatchAction,
  rejectChangeSetAction,
  rejectChangeSetRunAction,
  setChangeOperationDecisionAction,
  supersedeChangeSetAction,
  toggleEntityFieldLockAction,
  toggleEntityLockAction,
  createRelationshipAction,
  archiveRelationshipAction,
  toggleRelationshipLockAction,
  createEventAction,
  createCampaignEventAction,
  archiveEventAction,
  toggleEventLockAction,
  linkEventCauseAction,
  archiveEventCausalityAction,
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

    expect(createGenericEntity).toHaveBeenCalledWith("u1", "c1", expect.objectContaining({
      type: "NPC",
      name: "Zev",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: ["admin"],
    }));
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

describe("quickCreateEntityAction", () => {
  it("quick-creates a stub crawler and redirects to detail", async () => {
    createCrawler.mockResolvedValue({ id: "e9" });

    await expect(
      quickCreateEntityAction("c1", undefined, form({ type: "CRAWLER", name: "Carl" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createCrawler).toHaveBeenCalledWith(
      "u1",
      "c1",
      expect.objectContaining({ name: "Carl", isStub: true }),
    );
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1/entities/e9");
  });

  it("quick-creates a stub generic entity and redirects to detail", async () => {
    createGenericEntity.mockResolvedValue({ id: "e10" });

    await expect(
      quickCreateEntityAction("c1", undefined, form({ type: "NPC", name: "Zev" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createGenericEntity).toHaveBeenCalledWith(
      "u1",
      "c1",
      expect.objectContaining({ type: "NPC", name: "Zev", isStub: true }),
    );
  });

  it("quick-creates a stub crawler and stays on the page", async () => {
    createCrawler.mockResolvedValue({ id: "e9" });

    const result = await quickCreateEntityAction(
      "c1",
      undefined,
      form({ type: "CRAWLER", name: "Carl", actionType: "stay" }),
    );

    expect(createCrawler).toHaveBeenCalledWith(
      "u1",
      "c1",
      expect.objectContaining({ name: "Carl", isStub: true }),
    );
    expect(redirect).not.toHaveBeenCalled();
    expect(result?.success).toBe('Created stub "Carl".');
  });

  it("returns a validation error for a blank crawler name", async () => {
    const result = await quickCreateEntityAction(
      "c1",
      undefined,
      form({ type: "CRAWLER", name: "" }),
    );
    expect(result?.error).toBeTruthy();
    expect(createCrawler).not.toHaveBeenCalled();
  });

  it("returns a validation error for a blank generic-entity name", async () => {
    const result = await quickCreateEntityAction(
      "c1",
      undefined,
      form({ type: "NPC", name: "" }),
    );
    expect(result?.error).toBeTruthy();
    expect(createGenericEntity).not.toHaveBeenCalled();
  });

  it("surfaces a ServiceError message", async () => {
    createGenericEntity.mockRejectedValue(new ServiceError("Campaign not found."));
    const result = await quickCreateEntityAction(
      "c1",
      undefined,
      form({ type: "NPC", name: "Zev" }),
    );
    expect(result?.error).toBe("Campaign not found.");
  });

  it("hides unexpected errors behind a generic message", async () => {
    createCrawler.mockRejectedValue(new Error("db down"));
    const result = await quickCreateEntityAction(
      "c1",
      undefined,
      form({ type: "CRAWLER", name: "Carl" }),
    );
    expect(result?.error).toBe("Could not create the entity. Please try again.");
  });
});

describe("getCampaignCanonIntegrityAction", () => {
  it("delegates to the campaigns service for the current user", async () => {
    const integrity = { dmPercent: 100, aiPercent: 0, playerPercent: 0, lockedPercent: 0 };
    getCampaignCanonIntegrity.mockResolvedValue(integrity);

    const result = await getCampaignCanonIntegrityAction("c1");

    expect(getCampaignCanonIntegrity).toHaveBeenCalledWith("u1", "c1");
    expect(result).toBe(integrity);
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

  it("approves a generator run and revalidates campaign surfaces", async () => {
    await approveChangeSetRunAction("c1", "run-1");

    expect(approveChangeSetRun).toHaveBeenCalledWith("u1", "c1", "run-1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("rejects a change set and revalidates the queue", async () => {
    await rejectChangeSetAction("c1", "cs1");

    expect(rejectChangeSet).toHaveBeenCalledWith("u1", "c1", "cs1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("rejects a generator run and revalidates the queue", async () => {
    await rejectChangeSetRunAction("c1", "run-1");

    expect(rejectChangeSetRun).toHaveBeenCalledWith("u1", "c1", "run-1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("supersedes a change set and revalidates campaign surfaces", async () => {
    await supersedeChangeSetAction("c1", "cs1");

    expect(supersedeChangeSet).toHaveBeenCalledWith("u1", "c1", "cs1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
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

  it("saves an edited operation patch and revalidates the queue", async () => {
    const fd = new FormData();
    fd.append("field", "summary");
    fd.set("apply:summary", "on");
    fd.set("kind:summary", "string");
    fd.set("value:summary", "DM-edited summary");
    fd.append("field", "tags");
    fd.set("apply:tags", "on");
    fd.set("kind:tags", "array");
    fd.set("value:tags", "admin, crawler");
    fd.append("field", "crawler.level");
    fd.set("apply:crawler.level", "on");
    fd.set("kind:crawler.level", "number");
    fd.set("value:crawler.level", "12");
    fd.append("field", "crawler.isAlive");
    fd.set("apply:crawler.isAlive", "on");
    fd.set("kind:crawler.isAlive", "boolean");
    fd.set("value:crawler.isAlive", "false");
    fd.append("field", "customFields");
    fd.set("apply:customFields", "on");
    fd.set("kind:customFields", "json");
    fd.set("value:customFields", "{\"threat\":\"high\"}");
    fd.append("field", "description");
    fd.set("kind:description", "string");
    fd.set("value:description", "unchecked value");

    await editChangeOperationPatchAction("c1", "cs1", "op1", fd);

    expect(setChangeOperationDecision).toHaveBeenCalledWith(
      "u1",
      "c1",
      "cs1",
      "op1",
      {
        decision: "EDITED",
        editedPatch: {
          summary: { to: "DM-edited summary" },
          tags: { to: ["admin", "crawler"] },
          "crawler.level": { to: 12 },
          "crawler.isAlive": { to: false },
          customFields: { to: { threat: "high" } },
        },
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("ignores invalid edited operation patch submissions", async () => {
    const noneSelected = new FormData();
    noneSelected.append("field", "summary");
    noneSelected.set("kind:summary", "string");
    noneSelected.set("value:summary", "DM-edited summary");

    const badNumber = new FormData();
    badNumber.append("field", "crawler.level");
    badNumber.set("apply:crawler.level", "on");
    badNumber.set("kind:crawler.level", "number");
    badNumber.set("value:crawler.level", "not a number");

    const emptyNumber = new FormData();
    emptyNumber.append("field", "crawler.level");
    emptyNumber.set("apply:crawler.level", "on");
    emptyNumber.set("kind:crawler.level", "number");
    emptyNumber.set("value:crawler.level", "  ");

    const badJson = new FormData();
    badJson.append("field", "customFields");
    badJson.set("apply:customFields", "on");
    badJson.set("kind:customFields", "json");
    badJson.set("value:customFields", "{not json}");

    const badKind = new FormData();
    badKind.append("field", "summary");
    badKind.set("apply:summary", "on");
    badKind.set("kind:summary", "not-a-kind");
    badKind.set("value:summary", "whatever");

    await editChangeOperationPatchAction("c1", "cs1", "op1", noneSelected);
    await editChangeOperationPatchAction("c1", "cs1", "op1", badNumber);
    await editChangeOperationPatchAction("c1", "cs1", "op1", emptyNumber);
    await editChangeOperationPatchAction("c1", "cs1", "op1", badJson);
    await editChangeOperationPatchAction("c1", "cs1", "op1", badKind);

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

  it("allows locking item data fields", async () => {
    getEntityForUser.mockResolvedValue({
      id: "e1",
      locked: false,
      lockedFields: [],
    });

    await toggleEntityFieldLockAction("c1", "e1", fieldForm("data.itemTypeId"));

    expect(setEntityLock).toHaveBeenCalledWith("u1", "c1", "e1", {
      lockedFields: ["data.itemTypeId"],
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

describe("createRelationshipAction", () => {
  it("returns a validation error when no target is selected", async () => {
    const result = await createRelationshipAction(
      "c1",
      "e1",
      undefined,
      form({ type: "ALLY_OF", targetId: "" }),
    );

    expect(result?.error).toBeTruthy();
    expect(createRelationship).not.toHaveBeenCalled();
  });

  it("creates the edge and revalidates both entity pages", async () => {
    createRelationship.mockResolvedValue({ id: "r1" });

    const result = await createRelationshipAction(
      "c1",
      "e1",
      undefined,
      form({ type: "ALLY_OF", targetId: "e2", secret: "true" }),
    );

    expect(result).toBeUndefined();
    expect(createRelationship).toHaveBeenCalledWith("u1", "c1", "e1", {
      type: "ALLY_OF",
      targetId: "e2",
      disposition: undefined,
      notes: undefined,
      secret: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
  });

  it("surfaces a ServiceError message", async () => {
    createRelationship.mockRejectedValue(new ServiceError("This relationship is locked."));

    const result = await createRelationshipAction(
      "c1",
      "e1",
      undefined,
      form({ type: "ALLY_OF", targetId: "e2" }),
    );

    expect(result?.error).toBe("This relationship is locked.");
  });

  it("hides unexpected errors behind a generic message", async () => {
    createRelationship.mockRejectedValue(new Error("boom"));

    const result = await createRelationshipAction(
      "c1",
      "e1",
      undefined,
      form({ type: "ALLY_OF", targetId: "e2" }),
    );

    expect(result?.error).toMatch(/Could not add the connection/);
  });
});

describe("archiveRelationshipAction", () => {
  it("archives the edge and revalidates the source entity page", async () => {
    await archiveRelationshipAction("c1", "e1", "r1");

    expect(archiveRelationship).toHaveBeenCalledWith("u1", "c1", "r1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
  });
});

describe("toggleRelationshipLockAction", () => {
  it("toggles the edge lock and revalidates both endpoint pages", async () => {
    setRelationshipLock.mockResolvedValue({
      id: "r1",
      locked: false,
      sourceId: "e1",
      targetId: "e2",
    });

    await toggleRelationshipLockAction("c1", "e1", "r1", true);

    expect(setRelationshipLock).toHaveBeenCalledWith("u1", "c1", "r1", false);
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
  });
});

describe("createEventAction", () => {
  it("returns a validation error when the title is empty", async () => {
    const result = await createEventAction(
      "c1",
      "e1",
      undefined,
      form({ title: "" }),
    );

    expect(result?.error).toBeTruthy();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("logs the event with the source entity as a participant", async () => {
    createEvent.mockResolvedValue({ id: "ev1" });

    const result = await createEventAction(
      "c1",
      "e1",
      undefined,
      form({ title: "Boss fight", floor: "9", timeLabel: "Day 3", secret: "true" }),
    );

    expect(result).toBeUndefined();
    expect(createEvent).toHaveBeenCalledWith("u1", "c1", {
      title: "Boss fight",
      summary: undefined,
      floor: 9,
      timeLabel: "Day 3",
      secret: true,
      participants: [{ entityId: "e1", role: "ACTOR" }],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
  });

  it("includes an optional co-participant and revalidates both pages", async () => {
    createEvent.mockResolvedValue({ id: "ev1" });

    await createEventAction(
      "c1",
      "e1",
      undefined,
      form({
        title: "Brawl",
        sourceRole: "ACTOR",
        otherId: "e2",
        otherRole: "TARGET",
      }),
    );

    expect(createEvent).toHaveBeenCalledWith("u1", "c1", {
      title: "Brawl",
      summary: undefined,
      floor: undefined,
      timeLabel: undefined,
      secret: false,
      participants: [
        { entityId: "e1", role: "ACTOR" },
        { entityId: "e2", role: "TARGET" },
      ],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
  });

  it("surfaces a ServiceError message", async () => {
    createEvent.mockRejectedValue(new ServiceError("Participant entity not found."));

    const result = await createEventAction(
      "c1",
      "e1",
      undefined,
      form({ title: "Ghost event" }),
    );

    expect(result?.error).toBe("Participant entity not found.");
  });

  it("hides unexpected errors behind a generic message", async () => {
    createEvent.mockRejectedValue(new Error("boom"));

    const result = await createEventAction(
      "c1",
      "e1",
      undefined,
      form({ title: "Boom event" }),
    );

    expect(result?.error).toMatch(/Could not log the event/);
  });
});

describe("createCampaignEventAction", () => {
  it("logs a campaign event with multiple participants and revalidates timeline surfaces", async () => {
    createEvent.mockResolvedValue({ id: "ev1" });
    const fd = form({
      title: "Arena cascade",
      floor: "6",
      timeLabel: "Night 2",
      participantCount: "3",
      participantId_0: "e1",
      participantRole_0: "ACTOR",
      participantId_1: "e2",
      participantRole_1: "TARGET",
      participantId_2: "e3",
      participantRole_2: "WITNESS",
    });

    const result = await createCampaignEventAction("c1", undefined, fd);

    expect(result).toBeUndefined();
    expect(createEvent).toHaveBeenCalledWith("u1", "c1", {
      title: "Arena cascade",
      summary: undefined,
      floor: 6,
      timeLabel: "Night 2",
      secret: false,
      participants: [
        { entityId: "e1", role: "ACTOR" },
        { entityId: "e2", role: "TARGET" },
        { entityId: "e3", role: "WITNESS" },
      ],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e3");
  });

  it("requires at least one selected participant", async () => {
    const result = await createCampaignEventAction(
      "c1",
      undefined,
      form({ title: "No witnesses", participantCount: "2" }),
    );

    expect(result?.error).toBe("Choose at least one participant.");
    expect(createEvent).not.toHaveBeenCalled();
  });
});

describe("archiveEventAction", () => {
  it("archives the event and revalidates the entity page", async () => {
    archiveEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1"] });

    await archiveEventAction("c1", "e1", "ev1");

    expect(archiveEvent).toHaveBeenCalledWith("u1", "c1", "ev1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
  });

  it("revalidates every participant timeline when archiving an event", async () => {
    archiveEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1", "e2", "e3"] });

    await archiveEventAction("c1", "e1", "ev1");

    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e3");
  });
});

describe("toggleEventLockAction", () => {
  it("toggles the event lock and revalidates every participant timeline", async () => {
    setEventLock.mockResolvedValue({
      id: "ev1",
      locked: true,
      participantIds: ["e1", "e2", "e3"],
    });

    await toggleEventLockAction("c1", "e1", "ev1", false);

    expect(setEventLock).toHaveBeenCalledWith("u1", "c1", "ev1", true);
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e3");
  });
});

describe("linkEventCauseAction", () => {
  it("links a selected cause event and revalidates the current entity", async () => {
    linkEventCause.mockResolvedValue({ id: "ec1" });

    const result = await linkEventCauseAction(
      "c1",
      "entity1",
      "effect1",
      undefined,
      form({ causeId: "cause1", weight: "75", note: "Broadcast backlash" }),
    );

    expect(result).toBeUndefined();
    expect(linkEventCause).toHaveBeenCalledWith("u1", "c1", {
      causeId: "cause1",
      effectId: "effect1",
      weight: 75,
      note: "Broadcast backlash",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/entity1");
  });

  it("surfaces causality ServiceError messages", async () => {
    linkEventCause.mockRejectedValue(new ServiceError("This causality link would create a cycle."));

    const result = await linkEventCauseAction(
      "c1",
      "entity1",
      "effect1",
      undefined,
      form({ causeId: "cause1" }),
    );

    expect(result?.error).toMatch(/cycle/);
  });
});

describe("archiveEventCausalityAction", () => {
  it("archives a causality link and revalidates the current entity page", async () => {
    archiveEventCausality.mockResolvedValue({
      id: "ec1",
      affectedEventIds: ["cause1", "effect1"],
    });

    await archiveEventCausalityAction("c1", "entity1", "ec1");

    expect(archiveEventCausality).toHaveBeenCalledWith("u1", "c1", "ec1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/entity1");
  });
});
