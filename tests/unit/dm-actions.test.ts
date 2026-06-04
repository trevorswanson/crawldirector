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
  reopenChangeSet,
  setChangeOperationDecision,
  setChangeOperationFieldDecision,
  supersedeChangeSet,
  setEntityLock,
  createRelationship,
  archiveRelationship,
  updateRelationship,
  setRelationshipLock,
  createEvent,
  updateEvent,
  archiveEvent,
  setEventLock,
  reorderEvent,
  linkEventCause,
  archiveEventCausality,
  applyEventEffects,
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
  reopenChangeSet: vi.fn(),
  setChangeOperationDecision: vi.fn(),
  setChangeOperationFieldDecision: vi.fn(),
  supersedeChangeSet: vi.fn(),
  setEntityLock: vi.fn(),
  createRelationship: vi.fn(),
  updateRelationship: vi.fn(),
  archiveRelationship: vi.fn(),
  setRelationshipLock: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  archiveEvent: vi.fn(),
  setEventLock: vi.fn(),
  reorderEvent: vi.fn(),
  linkEventCause: vi.fn(),
  archiveEventCausality: vi.fn(),
  applyEventEffects: vi.fn(),
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
  reopenChangeSet,
  setChangeOperationDecision,
  setChangeOperationFieldDecision,
  supersedeChangeSet,
  setEntityLock,
}));
vi.mock("@/server/services/relationships", () => ({
  createRelationship,
  updateRelationship,
  archiveRelationship,
  setRelationshipLock,
}));
vi.mock("@/server/services/events", () => ({
  createEvent,
  updateEvent,
  archiveEvent,
  setEventLock,
  reorderEvent,
  linkEventCause,
  archiveEventCausality,
  applyEventEffects,
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
  editChangeOperationFieldAction,
  editEventEffectsOperationAction,
  rejectChangeSetAction,
  rejectChangeSetRunAction,
  reopenChangeSetAction,
  setChangeOperationDecisionAction,
  setChangeOperationFieldDecisionAction,
  supersedeChangeSetAction,
  toggleEntityFieldLockAction,
  toggleEntityLockAction,
  createRelationshipAction,
  updateRelationshipAction,
  archiveRelationshipAction,
  toggleRelationshipLockAction,
  createEventAction,
  updateEventAction,
  updateCampaignEventAction,
  createCampaignEventAction,
  archiveEventAction,
  reorderEventAction,
  toggleEventLockAction,
  linkEventCauseAction,
  archiveEventCausalityAction,
  applyEventEffectsAction,
  applyCampaignEventEffectsAction,
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
    await expect(approveChangeSetAction("c1", "cs1")).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(approveChangeSet).toHaveBeenCalledWith("u1", "c1", "cs1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1/review?done=cs1");
  });

  it("approves a generator run and revalidates campaign surfaces", async () => {
    await approveChangeSetRunAction("c1", "run-1");

    expect(approveChangeSetRun).toHaveBeenCalledWith("u1", "c1", "run-1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("rejects a change set and revalidates the queue", async () => {
    await expect(rejectChangeSetAction("c1", "cs1")).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(rejectChangeSet).toHaveBeenCalledWith("u1", "c1", "cs1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1/review?done=cs1");
  });

  it("reopens a rejected change set and redirects to it", async () => {
    await expect(reopenChangeSetAction("c1", "cs1")).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(reopenChangeSet).toHaveBeenCalledWith("u1", "c1", "cs1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1/review?selected=cs1");
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

  it("sets one field decision and revalidates the queue", async () => {
    await setChangeOperationFieldDecisionAction(
      "c1",
      "cs1",
      "op1",
      "summary",
      "ACCEPTED",
    );

    expect(setChangeOperationFieldDecision).toHaveBeenCalledWith(
      "u1",
      "c1",
      "cs1",
      "op1",
      {
        field: "summary",
        decision: "ACCEPTED",
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("ignores invalid field decisions", async () => {
    await setChangeOperationFieldDecisionAction("c1", "cs1", "op1", "", "ACCEPTED");
    await setChangeOperationFieldDecisionAction("c1", "cs1", "op1", "summary", "NOPE");

    expect(setChangeOperationFieldDecision).not.toHaveBeenCalled();
  });

  it("saves one edited field and revalidates the queue", async () => {
    const fd = form({ kind: "string", value: "DM-edited summary" });

    await editChangeOperationFieldAction("c1", "cs1", "op1", "summary", fd);

    expect(setChangeOperationFieldDecision).toHaveBeenCalledWith(
      "u1",
      "c1",
      "cs1",
      "op1",
      {
        field: "summary",
        decision: "ACCEPTED",
        editedValue: { to: "DM-edited summary" },
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("parses typed field edits and ignores invalid edits", async () => {
    await editChangeOperationFieldAction(
      "c1",
      "cs1",
      "op1",
      "tags",
      form({ kind: "array", value: "admin, crawler" }),
    );
    await editChangeOperationFieldAction(
      "c1",
      "cs1",
      "op1",
      "crawler.level",
      form({ kind: "number", value: "12" }),
    );
    await editChangeOperationFieldAction(
      "c1",
      "cs1",
      "op1",
      "crawler.isAlive",
      form({ kind: "boolean", value: "false" }),
    );
    await editChangeOperationFieldAction(
      "c1",
      "cs1",
      "op1",
      "customFields",
      form({ kind: "json", value: "{\"threat\":\"high\"}" }),
    );
    await editChangeOperationFieldAction(
      "c1",
      "cs1",
      "op1",
      "crawler.level",
      form({ kind: "number", value: "not a number" }),
    );
    await editChangeOperationFieldAction(
      "c1",
      "cs1",
      "op1",
      "customFields",
      form({ kind: "json", value: "{not json}" }),
    );
    await editChangeOperationFieldAction(
      "c1",
      "cs1",
      "op1",
      "",
      form({ kind: "string", value: "ignored" }),
    );
    await editChangeOperationFieldAction(
      "c1",
      "cs1",
      "op1",
      "summary",
      form({ value: "ignored" }),
    );

    expect(setChangeOperationFieldDecision).toHaveBeenCalledTimes(4);
  });

  it("saves edited existing effect rows as an EDITED effects patch", async () => {
    const fd = new FormData();
    fd.set("effectCount", "1");
    // Row 0: an ADJUST_STAT keeping its stable id.
    fd.set("effectId_0", "fx-1");
    fd.set("effectKind_0", "ADJUST_STAT");
    fd.set("effectTarget_0", "crawler-1");
    fd.set("effectStat_0", "gold");
    fd.set("effectDelta_0", "750");
    fd.set("effectNote_0", "Boss loot, bumped");
    await editEventEffectsOperationAction("c1", "cs1", "op1", fd);

    expect(setChangeOperationDecision).toHaveBeenCalledWith(
      "u1",
      "c1",
      "cs1",
      "op1",
      {
        decision: "EDITED",
        editedPatch: {
          effects: {
            to: [
              {
                id: "fx-1",
                kind: "ADJUST_STAT",
                targetEntityId: "crawler-1",
                stat: "gold",
                delta: 750,
                note: "Boss loot, bumped",
              },
            ],
          },
        },
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("ignores unsupported new effect rows without stable ids", async () => {
    const fd = new FormData();
    fd.set("effectCount", "1");
    fd.set("effectKind_0", "SET_ALIVE");
    fd.set("effectTarget_0", "crawler-2");
    fd.set("effectValue_0", "dead");

    await editEventEffectsOperationAction("c1", "cs1", "op1", fd);

    expect(setChangeOperationDecision).not.toHaveBeenCalled();
  });

  it("ignores effect edits with no valid rows", async () => {
    // No effectCount at all -> parseEffectRows returns undefined.
    await editEventEffectsOperationAction("c1", "cs1", "op1", new FormData());

    // A targetless row (trailing empty) yields zero effects.
    const emptyRow = new FormData();
    emptyRow.set("effectCount", "1");
    emptyRow.set("effectKind_0", "ADJUST_STAT");
    emptyRow.set("effectStat_0", "gold");
    emptyRow.set("effectDelta_0", "10");
    await editEventEffectsOperationAction("c1", "cs1", "op1", emptyRow);

    // An ADJUST_STAT with a zero delta fails schema validation.
    const zeroDelta = new FormData();
    zeroDelta.set("effectCount", "1");
    zeroDelta.set("effectKind_0", "ADJUST_STAT");
    zeroDelta.set("effectTarget_0", "crawler-1");
    zeroDelta.set("effectStat_0", "gold");
    zeroDelta.set("effectDelta_0", "0");
    await editEventEffectsOperationAction("c1", "cs1", "op1", zeroDelta);

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

describe("updateRelationshipAction", () => {
  it("edits the edge and revalidates the viewed + both endpoint pages", async () => {
    updateRelationship.mockResolvedValue({ id: "r1", sourceId: "e1", targetId: "e2" });

    const result = await updateRelationshipAction(
      "c1",
      "e1",
      "r1",
      undefined,
      form({ type: "RIVAL_OF", disposition: "-50", notes: "Fell out", secret: "true" }),
    );

    expect(result).toBeUndefined();
    expect(updateRelationship).toHaveBeenCalledWith("u1", "c1", "r1", {
      type: "RIVAL_OF",
      disposition: -50,
      notes: "Fell out",
      secret: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
  });

  it("surfaces a ServiceError and hides unexpected errors", async () => {
    updateRelationship.mockRejectedValueOnce(new ServiceError("This relationship is locked."));
    const locked = await updateRelationshipAction(
      "c1",
      "e1",
      "r1",
      undefined,
      form({ type: "ALLY_OF" }),
    );
    expect(locked?.error).toBe("This relationship is locked.");

    updateRelationship.mockRejectedValueOnce(new Error("boom"));
    const generic = await updateRelationshipAction(
      "c1",
      "e1",
      "r1",
      undefined,
      form({ type: "ALLY_OF" }),
    );
    expect(generic?.error).toMatch(/Could not edit the connection/);
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

describe("updateEventAction", () => {
  it("edits the event and revalidates every participant timeline + campaign timeline", async () => {
    updateEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1", "e2"] });

    const result = await updateEventAction(
      "c1",
      "e1",
      "ev1",
      undefined,
      form({ title: "Revised", summary: "New", floor: "10", timeLabel: "Day 4", secret: "true" }),
    );

    expect(result).toBeUndefined();
    expect(updateEvent).toHaveBeenCalledWith("u1", "c1", "ev1", {
      title: "Revised",
      summary: "New",
      floor: 10,
      timeLabel: "Day 4",
      secret: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });

  it("returns a validation error for an empty title", async () => {
    const result = await updateEventAction(
      "c1",
      "e1",
      "ev1",
      undefined,
      form({ title: "" }),
    );
    expect(result?.error).toBeTruthy();
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("parses participant rows when present", async () => {
    updateEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1", "e2"] });

    await updateEventAction(
      "c1",
      "e1",
      "ev1",
      undefined,
      form({
        title: "Boss fight",
        participantCount: "2",
        participantId_0: "e1",
        participantRole_0: "WITNESS",
        participantId_1: "e2",
        participantRole_1: "TARGET",
      }),
    );

    expect(updateEvent).toHaveBeenCalledWith(
      "u1",
      "c1",
      "ev1",
      expect.objectContaining({
        title: "Boss fight",
        participants: [
          { entityId: "e1", role: "WITNESS" },
          { entityId: "e2", role: "TARGET" },
        ],
      }),
    );
  });

  it("surfaces a ServiceError and hides unexpected errors", async () => {
    updateEvent.mockRejectedValueOnce(new ServiceError("This event is locked."));
    const locked = await updateEventAction(
      "c1",
      "e1",
      "ev1",
      undefined,
      form({ title: "X" }),
    );
    expect(locked?.error).toBe("This event is locked.");

    updateEvent.mockRejectedValueOnce(new Error("boom"));
    const generic = await updateEventAction(
      "c1",
      "e1",
      "ev1",
      undefined,
      form({ title: "X" }),
    );
    expect(generic?.error).toMatch(/Could not edit the event/);
  });
});

describe("updateCampaignEventAction", () => {
  it("edits from the timeline page and revalidates every affected participant + timeline", async () => {
    updateEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1", "e2", "e3"] });

    const result = await updateCampaignEventAction(
      "c1",
      "ev1",
      undefined,
      form({
        title: "Boss fight",
        participantCount: "2",
        participantId_0: "e1",
        participantRole_0: "ACTOR",
        participantId_1: "e3",
        participantRole_1: "TARGET",
      }),
    );

    expect(result).toBeUndefined();
    expect(updateEvent).toHaveBeenCalledWith(
      "u1",
      "c1",
      "ev1",
      expect.objectContaining({
        participants: [
          { entityId: "e1", role: "ACTOR" },
          { entityId: "e3", role: "TARGET" },
        ],
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e3");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });

  it("surfaces a ServiceError from the timeline edit", async () => {
    updateEvent.mockRejectedValueOnce(new ServiceError("This event is locked."));
    const result = await updateCampaignEventAction(
      "c1",
      "ev1",
      undefined,
      form({ title: "X" }),
    );
    expect(result?.error).toBe("This event is locked.");
  });
});

describe("event effect rows", () => {
  it("parses ADJUST_STAT and SET_ALIVE effect rows without auto-applying on event edit", async () => {
    updateEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1"] });

    await updateEventAction(
      "c1",
      "e1",
      "ev1",
      undefined,
      form({
        title: "Loot drop",
        effectCount: "2",
        effectKind_0: "ADJUST_STAT",
        effectTarget_0: "e1",
        effectStat_0: "gold",
        effectDelta_0: "500",
        effectNote_0: "Boss loot",
        effectKind_1: "SET_ALIVE",
        effectTarget_1: "e2",
        effectValue_1: "dead",
      }),
    );

    expect(updateEvent).toHaveBeenCalledWith(
      "u1",
      "c1",
      "ev1",
      expect.objectContaining({
        effects: [
          expect.objectContaining({
            kind: "ADJUST_STAT",
            targetEntityId: "e1",
            stat: "gold",
            delta: 500,
            note: "Boss loot",
          }),
          expect.objectContaining({
            kind: "SET_ALIVE",
            targetEntityId: "e2",
            value: false,
          }),
        ],
      }),
    );
  });

  it("parses SET_STAT effect rows as direct values without auto-applying", async () => {
    updateEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1"] });

    await updateEventAction(
      "c1",
      "e1",
      "ev1",
      undefined,
      form({
        title: "Floor change",
        effectCount: "1",
        effectKind_0: "SET_STAT",
        effectTarget_0: "e1",
        effectStat_0: "currentFloor",
        effectValueNumber_0: "1",
      }),
    );

    expect(updateEvent).toHaveBeenCalledWith(
      "u1",
      "c1",
      "ev1",
      expect.objectContaining({
        effects: [
          expect.objectContaining({
            kind: "SET_STAT",
            targetEntityId: "e1",
            stat: "currentFloor",
            valueNumber: 1,
          }),
        ],
      }),
    );
  });

  it("parses campaign timeline effect rows without auto-applying", async () => {
    updateEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1"] });

    await updateCampaignEventAction(
      "c1",
      "ev1",
      undefined,
      form({
        title: "Floor change",
        effectCount: "1",
        effectKind_0: "ADJUST_STAT",
        effectTarget_0: "e1",
        effectStat_0: "gold",
        effectDelta_0: "50",
      }),
    );

    expect(updateEvent).toHaveBeenCalledWith(
      "u1",
      "c1",
      "ev1",
      expect.objectContaining({
        effects: [
          expect.objectContaining({
            kind: "ADJUST_STAT",
            targetEntityId: "e1",
            stat: "gold",
            delta: 50,
          }),
        ],
      }),
    );
  });

  it("skips effect rows without a target and leaves effects absent when no rows", async () => {
    updateEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1"] });

    // effectCount present but the only row has no target -> empty effects array.
    await updateCampaignEventAction(
      "c1",
      "ev1",
      undefined,
      form({
        title: "Loot drop",
        effectCount: "1",
        effectKind_0: "ADJUST_STAT",
        effectTarget_0: "",
        effectStat_0: "gold",
        effectDelta_0: "10",
      }),
    );
    expect(updateEvent).toHaveBeenCalledWith(
      "u1",
      "c1",
      "ev1",
      expect.objectContaining({ effects: [] }),
    );

    updateEvent.mockClear();
    // No effectCount -> effects key omitted entirely (set untouched).
    await updateCampaignEventAction("c1", "ev1", undefined, form({ title: "Loot drop" }));
    expect(updateEvent.mock.calls[0][3]).not.toHaveProperty("effects");
  });
});

describe("applyEventEffectsAction", () => {
  it("submits effects for review and revalidates affected entities + review queue", async () => {
    applyEventEffects.mockResolvedValue({
      id: "ev1",
      changeSetId: "cs1",
      operationId: "op1",
      affectedEntityIds: ["e1", "e2"],
    });

    const result = await applyEventEffectsAction("c1", "e1", "ev1");

    expect(result).toBeUndefined();
    expect(applyEventEffects).toHaveBeenCalledWith("u1", "c1", "ev1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("surfaces a ServiceError (e.g. a locked target) without throwing", async () => {
    applyEventEffects.mockRejectedValueOnce(
      new ServiceError("Cannot update because the entity is locked."),
    );
    const result = await applyEventEffectsAction("c1", "e1", "ev1");
    expect(result?.error).toMatch(/locked/);
  });

  it("hides unexpected errors behind a generic message", async () => {
    applyEventEffects.mockRejectedValueOnce(new Error("boom"));
    const result = await applyEventEffectsAction("c1", "e1", "ev1");
    expect(result?.error).toMatch(/Could not submit the effects/);
  });
});

describe("applyCampaignEventEffectsAction", () => {
  it("submits campaign timeline effects for review and revalidates affected entities", async () => {
    applyEventEffects.mockResolvedValue({
      id: "ev1",
      changeSetId: "cs1",
      operationId: "op1",
      affectedEntityIds: ["e1", "e3"],
    });

    const result = await applyCampaignEventEffectsAction("c1", "ev1");

    expect(result).toBeUndefined();
    expect(applyEventEffects).toHaveBeenCalledWith("u1", "c1", "ev1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e3");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("surfaces a ServiceError from the campaign apply", async () => {
    applyEventEffects.mockRejectedValueOnce(new ServiceError("This event has no effects left to apply."));
    const result = await applyCampaignEventEffectsAction("c1", "ev1");
    expect(result?.error).toMatch(/no effects left/);
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

describe("reorderEventAction", () => {
  it("reorders the event and revalidates participant timelines + the timeline", async () => {
    reorderEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1", "e2"] });

    const result = await reorderEventAction("c1", "ev1", {
      aboveId: "ev2",
      belowId: null,
    });

    expect(result).toBeUndefined();
    expect(reorderEvent).toHaveBeenCalledWith("u1", "c1", "ev1", {
      aboveId: "ev2",
      belowId: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });

  it("returns the service error message and does not revalidate", async () => {
    reorderEvent.mockRejectedValue(new ServiceError("Only within their floor."));

    const result = await reorderEventAction("c1", "ev1", { aboveId: "ev9" });

    expect(result).toEqual({ error: "Only within their floor." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a generic error for an unexpected failure", async () => {
    reorderEvent.mockRejectedValue(new Error("boom"));

    const result = await reorderEventAction("c1", "ev1", {});

    expect(result).toEqual({ error: "Could not reorder the event. Please try again." });
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
