import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUser,
  createCampaign,
  isLoreSeedDatasetAvailable,
  getCampaignCanonIntegrity,
  getCampaignIntegrityReport,
  getCampaignHeaderStatus,
  setCampaignCurrentFloor,
  createCrawler,
  createGenericEntity,
  getEntityForUser,
  updateEntity,
  archiveEntity,
  restoreEntity,
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
  restoreRelationship,
  updateRelationship,
  setRelationshipLock,
  createEvent,
  updateEvent,
  archiveEvent,
  restoreEvent,
  setEventLock,
  reorderEvent,
  orderEventsFromCausality,
  linkEventCause,
  archiveEventCausality,
  restoreEventCausality,
  applyEventEffects,
  cancelJob,
  grantEntityKnowledge,
  revokeKnowledge,
  fleshOutEntity,
  fleshOutEntities,
  inferRelationshipsForEntity,
  scaffoldStubEntities,
  askCampaign,
  searchCanon,
  searchEntityCandidates,
  enqueueJob,
  enqueueBuildSemanticIndexJob,
  enqueueMigrateEntityDataJob,
  signOut,
  redirect,
  revalidatePath,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createCampaign: vi.fn(),
  isLoreSeedDatasetAvailable: vi.fn().mockReturnValue(true),
  getCampaignCanonIntegrity: vi.fn(),
  getCampaignIntegrityReport: vi.fn(),
  getCampaignHeaderStatus: vi.fn(),
  setCampaignCurrentFloor: vi.fn(),
  createCrawler: vi.fn(),
  createGenericEntity: vi.fn(),
  getEntityForUser: vi.fn(),
  updateEntity: vi.fn(),
  archiveEntity: vi.fn(),
  restoreEntity: vi.fn(),
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
  restoreRelationship: vi.fn(),
  setRelationshipLock: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  archiveEvent: vi.fn(),
  restoreEvent: vi.fn(),
  setEventLock: vi.fn(),
  reorderEvent: vi.fn(),
  orderEventsFromCausality: vi.fn(),
  linkEventCause: vi.fn(),
  archiveEventCausality: vi.fn(),
  restoreEventCausality: vi.fn(),
  applyEventEffects: vi.fn(),
  cancelJob: vi.fn(),
  grantEntityKnowledge: vi.fn(),
  revokeKnowledge: vi.fn(),
  fleshOutEntity: vi.fn(),
  fleshOutEntities: vi.fn(),
  inferRelationshipsForEntity: vi.fn(),
  scaffoldStubEntities: vi.fn(),
  askCampaign: vi.fn(),
  searchCanon: vi.fn(),
  searchEntityCandidates: vi.fn(),
  enqueueJob: vi.fn(),
  enqueueBuildSemanticIndexJob: vi.fn(),
  enqueueMigrateEntityDataJob: vi.fn(),
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
  getCampaignHeaderStatus,
  setCampaignCurrentFloor,
}));
vi.mock("@/server/services/references", () => ({
  getCampaignIntegrityReport,
}));
vi.mock("@/server/services/entities", () => ({
  archiveEntity,
  restoreEntity,
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
  restoreRelationship,
  setRelationshipLock,
}));
vi.mock("@/server/services/events", () => ({
  createEvent,
  updateEvent,
  archiveEvent,
  restoreEvent,
  setEventLock,
  reorderEvent,
  orderEventsFromCausality,
  linkEventCause,
  archiveEventCausality,
  restoreEventCausality,
  applyEventEffects,
}));
vi.mock("@/server/services/knowledge", () => ({
  grantEntityKnowledge,
  revokeKnowledge,
}));
vi.mock("@/server/services/generation", () => ({
  fleshOutEntity,
  fleshOutEntities,
  inferRelationshipsForEntity,
  scaffoldStubEntities,
}));
vi.mock("@/server/services/ask", () => ({ askCampaign }));
vi.mock("@/server/services/search", () => ({ searchCanon, searchEntityCandidates }));
vi.mock("@/server/services/jobs", () => ({
  cancelJob,
  enqueueJob,
  enqueueBuildSemanticIndexJob,
  enqueueMigrateEntityDataJob,
}));
vi.mock("@/server/services/seeding", () => ({ isLoreSeedDatasetAvailable }));
vi.mock("@/server/auth", () => ({ signOut }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  archiveEntityAction,
  restoreEntityAction,
  approveChangeSetAction,
  approveChangeSetRunAction,
  createCampaignAction,
  createCrawlerAction,
  createGenericEntityAction,
  quickCreateEntityAction,
  getCampaignCanonIntegrityAction,
  getCampaignIntegrityIssueCountAction,
  getCampaignHeaderStatusAction,
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
  restoreRelationshipAction,
  toggleRelationshipLockAction,
  createEventAction,
  updateEventAction,
  updateCampaignEventAction,
  createCampaignEventAction,
  archiveEventAction,
  restoreEventAction,
  reorderEventAction,
  orderEventsFromCausalityAction,
  toggleEventLockAction,
  linkEventCauseAction,
  archiveEventCausalityAction,
  restoreEventCausalityAction,
  applyEventEffectsAction,
  applyCampaignEventEffectsAction,
  signOutAction,
  updateEntityAction,
  setCampaignCurrentFloorAction,
  setCampaignEventLockAction,
  archiveCampaignEventAction,
  restoreCampaignEventAction,
  linkCampaignEventCauseAction,
  archiveCampaignEventCausalityAction,
  restoreCampaignEventCausalityAction,
  grantEntityKnownToAction,
  grantEntityKnowsAboutAction,
  revokeKnowledgeAction,
  fleshOutEntityAction,
  fleshOutEntitiesAction,
  enqueueBulkFleshAction,
  enqueueBuildSemanticIndexAction,
  enqueueMigrateEntityDataAction,
  cancelJobAction,
  askCampaignAction,
  searchCampaignPreviewAction,
  searchEntityCandidatesAction,
  inferRelationshipsForEntityAction,
  scaffoldStubsAction,
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

  it("enqueues a LORE_SEED job and still redirects when seedLore is 'on'", async () => {
    createCampaign.mockResolvedValue({ id: "c1" });
    enqueueJob.mockResolvedValue({ id: "j1" });

    await expect(
      createCampaignAction(undefined, form({ name: "Lore World", summary: "", seedLore: "on" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(enqueueJob).toHaveBeenCalledWith("u1", "c1", "LORE_SEED", {});
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1");
  });

  it("does not enqueue when seedLore is absent", async () => {
    createCampaign.mockResolvedValue({ id: "c1" });

    await expect(
      createCampaignAction(undefined, form({ name: "No Lore", summary: "" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("still redirects even if the enqueue throws", async () => {
    createCampaign.mockResolvedValue({ id: "c1" });
    enqueueJob.mockRejectedValue(new Error("queue down"));

    await expect(
      createCampaignAction(undefined, form({ name: "Lore World", summary: "", seedLore: "on" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/campaigns/c1");
  });

  it("does not enqueue when seedLore is 'on' but dataset is unavailable, still redirects", async () => {
    createCampaign.mockResolvedValue({ id: "c1" });
    isLoreSeedDatasetAvailable.mockReturnValueOnce(false);

    await expect(
      createCampaignAction(undefined, form({ name: "Lore World", summary: "", seedLore: "on" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(enqueueJob).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1");
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

describe("getCampaignIntegrityIssueCountAction", () => {
  it("returns the total integrity issue count for the current user", async () => {
    getCampaignIntegrityReport.mockResolvedValue({
      checkedEntities: 8,
      brokenReferences: [{ entityId: "e1" }, { entityId: "e2" }],
      staleData: [{ entityId: "e3" }],
    });

    const result = await getCampaignIntegrityIssueCountAction("c1");

    expect(getCampaignIntegrityReport).toHaveBeenCalledWith("u1", "c1");
    expect(result).toBe(3);
  });
});

describe("getCampaignHeaderStatusAction", () => {
  it("delegates to the campaigns service for the current user", async () => {
    const status = {
      currentFloor: { id: "f9", name: "Larracos", floorNumber: 9 },
      currentDay: 52,
    };
    getCampaignHeaderStatus.mockResolvedValue(status);

    const result = await getCampaignHeaderStatusAction("c1");

    expect(getCampaignHeaderStatus).toHaveBeenCalledWith("u1", "c1");
    expect(result).toBe(status);
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
          visibility: "PLAYER_VISIBLE",
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
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1?archivedEntity=e1");
  });
});

describe("restoreEntityAction", () => {
  it("restores and redirects back to the entity page", async () => {
    await expect(restoreEntityAction("c1", "e1")).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(restoreEntity).toHaveBeenCalledWith("u1", "c1", "e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(redirect).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
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

  it("flips endpoints for an incoming edge (other → viewed entity)", async () => {
    createRelationship.mockResolvedValue({ id: "r1" });

    const result = await createRelationshipAction(
      "c1",
      "e1",
      undefined,
      form({ type: "MENTOR_OF", targetId: "e2", direction: "in" }),
    );

    expect(result).toBeUndefined();
    // The picked entity (e2) becomes the source; the viewed entity (e1) the target.
    expect(createRelationship).toHaveBeenCalledWith("u1", "c1", "e2", {
      type: "MENTOR_OF",
      targetId: "e1",
      disposition: undefined,
      notes: undefined,
      secret: false,
    });
    // Both endpoint pages are revalidated regardless of direction.
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

describe("restoreRelationshipAction", () => {
  it("restores the edge and revalidates the source entity page", async () => {
    await restoreRelationshipAction("c1", "e1", "r1");

    expect(restoreRelationship).toHaveBeenCalledWith("u1", "c1", "r1");
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

  it("logs a campaign timeline event with no participants", async () => {
    createEvent.mockResolvedValue({ id: "ev1" });

    const result = await createCampaignEventAction(
      "c1",
      undefined,
      form({ title: "No witnesses", participantCount: "2" }),
    );

    expect(result).toBeUndefined();
    expect(createEvent).toHaveBeenCalledWith("u1", "c1", {
      title: "No witnesses",
      summary: undefined,
      floor: undefined,
      timeLabel: undefined,
      secret: false,
      participants: [],
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
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
  it("auto-applies effects and revalidates affected entities without the review queue", async () => {
    applyEventEffects.mockResolvedValue({
      id: "ev1",
      changeSetId: "cs1",
      affectedEntityIds: ["e1", "e2"],
    });

    const result = await applyEventEffectsAction("c1", "e1", "ev1");

    expect(result).toBeUndefined();
    expect(applyEventEffects).toHaveBeenCalledWith("u1", "c1", "ev1", {
      autoApprove: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
    expect(revalidatePath).not.toHaveBeenCalledWith("/campaigns/c1/review");
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
    expect(result?.error).toMatch(/Could not apply the effects/);
  });
});

describe("applyCampaignEventEffectsAction", () => {
  it("auto-applies campaign timeline effects and revalidates affected entities", async () => {
    applyEventEffects.mockResolvedValue({
      id: "ev1",
      changeSetId: "cs1",
      affectedEntityIds: ["e1", "e3"],
    });

    const result = await applyCampaignEventEffectsAction("c1", "ev1");

    expect(result).toBeUndefined();
    expect(applyEventEffects).toHaveBeenCalledWith("u1", "c1", "ev1", {
      autoApprove: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e3");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
    expect(revalidatePath).not.toHaveBeenCalledWith("/campaigns/c1/review");
  });

  it("surfaces a ServiceError from the campaign apply", async () => {
    applyEventEffects.mockRejectedValueOnce(new ServiceError("This event has no effects left to apply."));
    const result = await applyCampaignEventEffectsAction("c1", "ev1");
    expect(result?.error).toMatch(/no effects left/);
  });

  it("hides unexpected campaign apply failures behind a generic message", async () => {
    applyEventEffects.mockRejectedValueOnce(new Error("boom"));
    const result = await applyCampaignEventEffectsAction("c1", "ev1");
    expect(result?.error).toMatch(/Could not apply the effects/);
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

describe("restoreEventAction", () => {
  it("restores the event and revalidates affected participant timelines", async () => {
    restoreEvent.mockResolvedValue({ id: "ev1", participantIds: ["e1", "e2"] });

    await restoreEventAction("c1", "e1", "ev1");

    expect(restoreEvent).toHaveBeenCalledWith("u1", "c1", "ev1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
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

describe("orderEventsFromCausalityAction", () => {
  it("orders the timeline and revalidates affected entity + timeline pages", async () => {
    orderEventsFromCausality.mockResolvedValue({
      updatedIds: ["ev1", "ev2"],
      affectedEntityIds: ["e1", "e2"],
    });

    const result = await orderEventsFromCausalityAction("c1");

    expect(result).toBeUndefined();
    expect(orderEventsFromCausality).toHaveBeenCalledWith("u1", "c1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });

  it("still revalidates the timeline when nothing moved", async () => {
    orderEventsFromCausality.mockResolvedValue({ updatedIds: [], affectedEntityIds: [] });

    const result = await orderEventsFromCausalityAction("c1");

    expect(result).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });

  it("returns the service error message and does not revalidate", async () => {
    orderEventsFromCausality.mockRejectedValue(new ServiceError("Not allowed."));

    const result = await orderEventsFromCausalityAction("c1");

    expect(result).toEqual({ error: "Not allowed." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a generic error for an unexpected failure", async () => {
    orderEventsFromCausality.mockRejectedValue(new Error("boom"));

    const result = await orderEventsFromCausalityAction("c1");

    expect(result).toEqual({ error: "Could not order the timeline. Please try again." });
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

  it("requires a selected cause event", async () => {
    const result = await linkEventCauseAction(
      "c1",
      "entity1",
      "effect1",
      undefined,
      form({ causeId: "" }),
    );

    expect(result?.error).toBe("Choose a cause event.");
    expect(linkEventCause).not.toHaveBeenCalled();
  });

  it("hides unexpected causality failures behind a generic message", async () => {
    linkEventCause.mockRejectedValue(new Error("db down"));

    const result = await linkEventCauseAction(
      "c1",
      "entity1",
      "effect1",
      undefined,
      form({ causeId: "cause1" }),
    );

    expect(result?.error).toBe("Could not link the events. Please try again.");
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

describe("restoreEventCausalityAction", () => {
  it("restores a causality link and revalidates the current entity page", async () => {
    restoreEventCausality.mockResolvedValue({
      id: "ec1",
      affectedEventIds: ["cause1", "effect1"],
    });

    await restoreEventCausalityAction("c1", "entity1", "ec1");

    expect(restoreEventCausality).toHaveBeenCalledWith("u1", "c1", "ec1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/entity1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });
});

describe("setCampaignCurrentFloorAction", () => {
  it("sets the campaign current floor and revalidates the timeline page", async () => {
    setCampaignCurrentFloor.mockResolvedValue({ currentFloorId: "f1", floorNumber: 1 });

    const result = await setCampaignCurrentFloorAction("c1", "f1");

    expect(result).toBeUndefined();
    expect(setCampaignCurrentFloor).toHaveBeenCalledWith("u1", "c1", "f1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });

  it("returns service error message on failure", async () => {
    setCampaignCurrentFloor.mockRejectedValue(new ServiceError("Floor entity not found."));

    const result = await setCampaignCurrentFloorAction("c1", "f1");

    expect(result).toEqual({ error: "Floor entity not found." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns generic error on unexpected error", async () => {
    setCampaignCurrentFloor.mockRejectedValue(new Error("unexpected"));

    const result = await setCampaignCurrentFloorAction("c1", "f1");

    expect(result).toEqual({ error: "Could not set the current floor. Please try again." });
  });
});

describe("setCampaignEventLockAction", () => {
  it("toggles lock and revalidates affected participants + timeline page", async () => {
    setEventLock.mockResolvedValue({
      id: "ev1",
      locked: true,
      participantIds: ["e1", "e2"],
    });

    await setCampaignEventLockAction("c1", "ev1", false);

    expect(setEventLock).toHaveBeenCalledWith("u1", "c1", "ev1", true);
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });
});

describe("archiveCampaignEventAction", () => {
  it("archives event and revalidates affected participants + timeline page", async () => {
    archiveEvent.mockResolvedValue({
      id: "ev1",
      participantIds: ["e1", "e2"],
    });

    await archiveCampaignEventAction("c1", "ev1");

    expect(archiveEvent).toHaveBeenCalledWith("u1", "c1", "ev1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });
});

describe("restoreCampaignEventAction", () => {
  it("restores event and revalidates affected participants + timeline page", async () => {
    restoreEvent.mockResolvedValue({
      id: "ev1",
      participantIds: ["e1", "e2"],
    });

    await restoreCampaignEventAction("c1", "ev1");

    expect(restoreEvent).toHaveBeenCalledWith("u1", "c1", "ev1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e2");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });
});

describe("linkCampaignEventCauseAction", () => {
  it("links event cause and revalidates timeline page", async () => {
    linkEventCause.mockResolvedValue({ id: "ec1" });

    const result = await linkCampaignEventCauseAction(
      "c1",
      "effect1",
      undefined,
      form({ causeId: "cause1" }),
    );

    expect(result).toBeUndefined();
    expect(linkEventCause).toHaveBeenCalledWith("u1", "c1", {
      causeId: "cause1",
      effectId: "effect1",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });

  it("returns error if causeId is missing", async () => {
    const result = await linkCampaignEventCauseAction(
      "c1",
      "effect1",
      undefined,
      form({}),
    );

    expect(result).toEqual({ error: "Choose a cause event." });
    expect(linkEventCause).not.toHaveBeenCalled();
  });

  it("surfaces service error message", async () => {
    linkEventCause.mockRejectedValue(new ServiceError("Cycle detected."));

    const result = await linkCampaignEventCauseAction(
      "c1",
      "effect1",
      undefined,
      form({ causeId: "cause1" }),
    );

    expect(result?.error).toBe("Cycle detected.");
  });

  it("returns generic error on unexpected error", async () => {
    linkEventCause.mockRejectedValue(new Error("unexpected"));

    const result = await linkCampaignEventCauseAction(
      "c1",
      "effect1",
      undefined,
      form({ causeId: "cause1" }),
    );

    expect(result).toEqual({ error: "Could not link the events. Please try again." });
  });
});

describe("archiveCampaignEventCausalityAction", () => {
  it("archives campaign event causality and revalidates timeline page", async () => {
    archiveEventCausality.mockResolvedValue({
      id: "ec1",
      affectedEventIds: ["cause1", "effect1"],
    });

    await archiveCampaignEventCausalityAction("c1", "ec1");

    expect(archiveEventCausality).toHaveBeenCalledWith("u1", "c1", "ec1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });
});

describe("restoreCampaignEventCausalityAction", () => {
  it("restores campaign event causality and revalidates timeline page", async () => {
    restoreEventCausality.mockResolvedValue({
      id: "ec1",
      affectedEventIds: ["cause1", "effect1"],
    });

    await restoreCampaignEventCausalityAction("c1", "ec1");

    expect(restoreEventCausality).toHaveBeenCalledWith("u1", "c1", "ec1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/timeline");
  });
});

describe("grantEntityKnownToAction", () => {
  it("reveals the viewed entity (target) to the picked recipient and revalidates both", async () => {
    grantEntityKnowledge.mockResolvedValue({ id: "k1", created: true, affectedEntityIds: [] });

    const result = await grantEntityKnownToAction(
      "c1",
      "viewed",
      undefined,
      form({ entityId: "actor", notes: "knows it" }),
    );

    expect(result).toBeUndefined();
    expect(grantEntityKnowledge).toHaveBeenCalledWith("u1", "c1", {
      targetEntityId: "viewed",
      recipientEntityId: "actor",
      notes: "knows it",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/viewed");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/actor");
  });

  it("returns a validation error and skips the service when no entity is picked", async () => {
    const result = await grantEntityKnownToAction("c1", "viewed", undefined, form({ entityId: "" }));
    expect(result?.error).toBeTruthy();
    expect(grantEntityKnowledge).not.toHaveBeenCalled();
  });

  it("surfaces a ServiceError message and a generic fallback", async () => {
    grantEntityKnowledge.mockRejectedValueOnce(new ServiceError("nope"));
    expect(
      (await grantEntityKnownToAction("c1", "viewed", undefined, form({ entityId: "actor" })))?.error,
    ).toBe("nope");

    grantEntityKnowledge.mockRejectedValueOnce(new Error("boom"));
    expect(
      (await grantEntityKnownToAction("c1", "viewed", undefined, form({ entityId: "actor" })))?.error,
    ).toBe("Could not record the reveal. Please try again.");
  });
});

describe("grantEntityKnowsAboutAction", () => {
  it("records the viewed entity (recipient) knowing the picked target", async () => {
    grantEntityKnowledge.mockResolvedValue({ id: "k1", created: true, affectedEntityIds: [] });

    await grantEntityKnowsAboutAction("c1", "viewed", undefined, form({ entityId: "canon" }));

    expect(grantEntityKnowledge).toHaveBeenCalledWith("u1", "c1", {
      targetEntityId: "canon",
      recipientEntityId: "viewed",
      notes: undefined,
    });
  });

  it("returns a validation error when no entity is picked", async () => {
    const result = await grantEntityKnowsAboutAction("c1", "viewed", undefined, form({ entityId: "" }));
    expect(result?.error).toBeTruthy();
    expect(grantEntityKnowledge).not.toHaveBeenCalled();
  });

  it("surfaces a ServiceError and a generic fallback", async () => {
    grantEntityKnowledge.mockRejectedValueOnce(new ServiceError("locked"));
    expect(
      (await grantEntityKnowsAboutAction("c1", "v", undefined, form({ entityId: "x" })))?.error,
    ).toBe("locked");

    grantEntityKnowledge.mockRejectedValueOnce(new Error("boom"));
    expect(
      (await grantEntityKnowsAboutAction("c1", "v", undefined, form({ entityId: "x" })))?.error,
    ).toBe("Could not record the reveal. Please try again.");
  });
});

describe("revokeKnowledgeAction", () => {
  it("revokes the grant and revalidates the viewed entity plus affected endpoints", async () => {
    revokeKnowledge.mockResolvedValue({ id: "k1", affectedEntityIds: ["viewed", "actor"] });

    await revokeKnowledgeAction("c1", "viewed", "k1");

    expect(revokeKnowledge).toHaveBeenCalledWith("u1", "c1", "k1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/viewed");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/actor");
  });
});

describe("fleshOutEntityAction", () => {
  it("files a proposal and returns a success message + link, revalidating queue + entity", async () => {
    fleshOutEntity.mockResolvedValue({ changeSetId: "cs1", providerId: "anthropic", model: "claude-opus-4-8" });

    const result = await fleshOutEntityAction("c1", "e1", undefined, form({}));

    expect(fleshOutEntity).toHaveBeenCalledWith("u1", "c1", "e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(result?.success).toContain("claude-opus-4-8");
    expect(result?.changeSetId).toBe("cs1");
    expect(result?.error).toBeUndefined();
  });

  it("surfaces a ServiceError message and a generic fallback", async () => {
    fleshOutEntity.mockRejectedValueOnce(new ServiceError("No AI provider is configured."));
    expect((await fleshOutEntityAction("c1", "e1", undefined, form({})))?.error).toBe(
      "No AI provider is configured.",
    );

    fleshOutEntity.mockRejectedValueOnce(new Error("boom"));
    expect((await fleshOutEntityAction("c1", "e1", undefined, form({})))?.error).toBe(
      "Generation failed. Please try again.",
    );
  });
});

describe("inferRelationshipsForEntityAction", () => {
  it("files relationship proposals and returns a success message + link, revalidating queue + entity", async () => {
    inferRelationshipsForEntity.mockResolvedValue({
      changeSetId: "cs2",
      providerId: "anthropic",
      model: "claude-opus-4-8",
      operationCount: 2,
    });

    const result = await inferRelationshipsForEntityAction("c1", "e1", undefined, form({}));

    expect(inferRelationshipsForEntity).toHaveBeenCalledWith("u1", "c1", "e1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/entities/e1");
    expect(result?.success).toContain("2 relationship");
    expect(result?.success).toContain("claude-opus-4-8");
    expect(result?.changeSetId).toBe("cs2");
    expect(result?.error).toBeUndefined();
  });

  it("surfaces a ServiceError message and a generic fallback", async () => {
    inferRelationshipsForEntity.mockRejectedValueOnce(new ServiceError("No usable relationships."));
    expect((await inferRelationshipsForEntityAction("c1", "e1", undefined, form({})))?.error).toBe(
      "No usable relationships.",
    );

    inferRelationshipsForEntity.mockRejectedValueOnce(new Error("boom"));
    expect((await inferRelationshipsForEntityAction("c1", "e1", undefined, form({})))?.error).toBe(
      "Generation failed. Please try again.",
    );
  });
});

describe("scaffoldStubsAction", () => {
  it("scaffolds stubs and returns a success message + link, revalidating queue + world", async () => {
    scaffoldStubEntities.mockResolvedValue({
      changeSetId: "cs3",
      providerId: "anthropic",
      model: "claude-opus-4-8",
      stubCount: 3,
    });

    const result = await scaffoldStubsAction("c1", undefined, form({ instruction: "Bone Market." }));

    expect(scaffoldStubEntities).toHaveBeenCalledWith("u1", "c1", "Bone Market.");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
    expect(result?.success).toContain("3 stubs");
    expect(result?.success).toContain("claude-opus-4-8");
    expect(result?.changeSetId).toBe("cs3");
    expect(result?.error).toBeUndefined();
  });

  it("uses the singular noun for a single stub", async () => {
    scaffoldStubEntities.mockResolvedValue({
      changeSetId: "cs4",
      providerId: "anthropic",
      model: "claude-opus-4-8",
      stubCount: 1,
    });
    const result = await scaffoldStubsAction("c1", undefined, form({ instruction: "One thing." }));
    expect(result?.success).toContain("1 stub proposed");
    expect(result?.success).toContain("Review it in the queue");
  });

  it("surfaces a ServiceError message and a generic fallback", async () => {
    scaffoldStubEntities.mockRejectedValueOnce(new ServiceError("No AI provider is configured."));
    expect((await scaffoldStubsAction("c1", undefined, form({ instruction: "x" })))?.error).toBe(
      "No AI provider is configured.",
    );

    scaffoldStubEntities.mockRejectedValueOnce(new Error("boom"));
    expect((await scaffoldStubsAction("c1", undefined, form({ instruction: "x" })))?.error).toBe(
      "Generation failed. Please try again.",
    );
  });
});

describe("askCampaignAction", () => {
  it("passes the question and returns the answer + sources (no revalidate — read-only)", async () => {
    const sources = [
      {
        index: 1,
        cited: true,
        targetType: "ENTITY" as const,
        targetId: "e1",
        kind: "NPC",
        label: "The Maestro",
        href: "/campaigns/c1/entities/e1",
      },
    ];
    askCampaign.mockResolvedValue({
      role: "OWNER",
      question: "Who is the Maestro?",
      answer: "A manipulative manager [1].",
      grounded: true,
      sources,
      model: "claude-opus-4-8",
      providerId: "anthropic",
    });

    const result = await askCampaignAction("c1", undefined, form({ question: "Who is the Maestro?" }));

    expect(askCampaign).toHaveBeenCalledWith("u1", "c1", "Who is the Maestro?");
    expect(result?.answer).toBe("A manipulative manager [1].");
    expect(result?.grounded).toBe(true);
    expect(result?.sources).toEqual(sources);
    expect(result?.model).toBe("claude-opus-4-8");
    expect(result?.error).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a ServiceError message and a generic fallback", async () => {
    askCampaign.mockRejectedValueOnce(new ServiceError("Add an AI provider key in Settings."));
    expect((await askCampaignAction("c1", undefined, form({ question: "x" })))?.error).toBe(
      "Add an AI provider key in Settings.",
    );

    askCampaign.mockRejectedValueOnce(new Error("boom"));
    expect((await askCampaignAction("c1", undefined, form({ question: "x" })))?.error).toBe(
      "The campaign couldn't answer that. Please try again.",
    );
  });
});

describe("searchEntityCandidatesAction", () => {
  it("uses the authenticated user and clamps search picker options", async () => {
    searchEntityCandidates.mockResolvedValue([
      { id: "e1", name: "Carl", type: "CRAWLER" },
    ]);

    const result = await searchEntityCandidatesAction("c1", "Carl", {
      limit: 100,
      types: ["CRAWLER"],
      excludeIds: ["self"],
    });

    expect(searchEntityCandidates).toHaveBeenCalledWith("u1", "c1", "Carl", {
      limit: 20,
      types: ["CRAWLER"],
      excludeIds: ["self"],
    });
    expect(result).toEqual([{ id: "e1", name: "Carl", type: "CRAWLER" }]);
  });

  it("returns an empty picker result for invalid options", async () => {
    await expect(
      searchEntityCandidatesAction("c1", "Carl", {
        types: ["NOT_A_TYPE"],
      } as never),
    ).resolves.toEqual([]);
    expect(searchEntityCandidates).not.toHaveBeenCalled();
  });
});

describe("searchCampaignPreviewAction", () => {
  it("returns direct-link preview rows for the global search typeahead", async () => {
    searchCanon.mockResolvedValue({
      role: "OWNER",
      query: "mordecai",
      hits: [
        {
          targetType: "ENTITY",
          targetId: "e1",
          rank: 1,
          entity: {
            id: "e1",
            type: "NPC",
            name: "Mordecai",
            summary: "Tutorial guild advisor",
            status: "CANON",
            source: "DM",
            tags: [],
            isStub: false,
          },
        },
        {
          targetType: "EVENT",
          targetId: "ev1",
          rank: 0.5,
          event: {
            id: "ev1",
            title: "The announcement",
            summary: null,
            status: "CANON",
            source: "DM",
            secret: false,
          },
        },
      ],
    });

    const result = await searchCampaignPreviewAction("c1", "mordecai");

    expect(searchCanon).toHaveBeenCalledWith("u1", "c1", "mordecai", {
      limit: 5,
      semantic: false,
    });
    expect(result).toEqual([
      {
        id: "ENTITY:e1",
        label: "Mordecai",
        meta: "NPC",
        excerpt: "Tutorial guild advisor",
        href: "/campaigns/c1/entities/e1",
      },
      {
        id: "EVENT:ev1",
        label: "The announcement",
        meta: "Event",
        excerpt: null,
        href: "/campaigns/c1/timeline?event=ev1",
      },
    ]);
  });

  it("returns no preview rows for blank queries", async () => {
    await expect(searchCampaignPreviewAction("c1", " ")).resolves.toEqual([]);
    expect(searchCanon).not.toHaveBeenCalled();
  });
});

describe("fleshOutEntitiesAction", () => {
  function idsForm(ids: string[]): FormData {
    const fd = new FormData();
    for (const id of ids) fd.append("entityIds", id);
    return fd;
  }

  it("passes the selected ids and returns a summary with outcomes, revalidating queue + world", async () => {
    fleshOutEntities.mockResolvedValue({
      model: "claude-opus-4-8",
      proposedCount: 2,
      skippedCount: 1,
      outcomes: [
        { entityId: "e1", entityName: "A", status: "proposed", changeSetId: "cs1" },
        { entityId: "e2", entityName: "B", status: "proposed", changeSetId: "cs2" },
        { entityId: "e3", entityName: "C", status: "skipped", detail: "Locked." },
      ],
    });

    const result = await fleshOutEntitiesAction("c1", undefined, idsForm(["e1", "e2", "e3"]));

    expect(fleshOutEntities).toHaveBeenCalledWith("u1", "c1", ["e1", "e2", "e3"]);
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/review");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
    expect(result?.success).toContain("2 drafts proposed");
    expect(result?.success).toContain("1 skipped");
    expect(result?.proposedCount).toBe(2);
    expect(result?.outcomes).toHaveLength(3);
    // The action only surfaces display fields, never internal ids.
    expect(result?.outcomes?.[2]).toEqual({ entityName: "C", status: "skipped", detail: "Locked." });
    expect(result?.error).toBeUndefined();
  });

  it("uses the singular noun and an it/them phrasing for a single proposal", async () => {
    fleshOutEntities.mockResolvedValue({
      model: "m",
      proposedCount: 1,
      skippedCount: 0,
      outcomes: [{ entityId: "e1", entityName: "A", status: "proposed", changeSetId: "cs1" }],
    });
    const result = await fleshOutEntitiesAction("c1", undefined, idsForm(["e1"]));
    expect(result?.success).toContain("1 draft proposed");
    expect(result?.success).toContain("Review it in the queue");
    expect(result?.success).not.toContain("skipped");
  });

  it("returns an error (not a success) when nothing was proposed, keeping the outcomes", async () => {
    fleshOutEntities.mockResolvedValue({
      model: "m",
      proposedCount: 0,
      skippedCount: 1,
      outcomes: [{ entityId: "e1", entityName: "A", status: "skipped", detail: "No changes." }],
    });
    const result = await fleshOutEntitiesAction("c1", undefined, idsForm(["e1"]));
    expect(result?.success).toBeUndefined();
    expect(result?.error).toContain("No drafts were proposed");
    expect(result?.outcomes).toHaveLength(1);
  });

  it("surfaces a ServiceError message and a generic fallback", async () => {
    fleshOutEntities.mockRejectedValueOnce(new ServiceError("Select at least one entity to flesh out."));
    expect((await fleshOutEntitiesAction("c1", undefined, idsForm([])))?.error).toBe(
      "Select at least one entity to flesh out.",
    );

    fleshOutEntities.mockRejectedValueOnce(new Error("boom"));
    expect((await fleshOutEntitiesAction("c1", undefined, idsForm(["e1"])))?.error).toBe(
      "Generation failed. Please try again.",
    );
  });
});

describe("enqueueBulkFleshAction", () => {
  function idsForm(ids: string[]): FormData {
    const fd = new FormData();
    for (const id of ids) fd.append("entityIds", id);
    return fd;
  }

  it("calls enqueueJob with BULK_FLESH kind and the parsed entityIds, returns queued message", async () => {
    enqueueJob.mockResolvedValue({ id: "j1" });

    const result = await enqueueBulkFleshAction("c1", undefined, idsForm(["e1", "e2"]));

    expect(enqueueJob).toHaveBeenCalledWith("u1", "c1", "BULK_FLESH", { entityIds: ["e1", "e2"] });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1");
    expect(result?.success).toContain("Background run queued");
    expect(result?.error).toBeUndefined();
  });

  it("returns an error when entityIds is empty", async () => {
    const result = await enqueueBulkFleshAction("c1", undefined, idsForm([]));
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(result?.error).toBe("No entities selected.");
  });

  it("returns an error when entityIds exceeds 20", async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `e${i}`);
    const result = await enqueueBulkFleshAction("c1", undefined, idsForm(ids));
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(result?.error).toBe("Select at most 20 entities.");
  });

  it("surfaces a ServiceError message and a generic fallback for unexpected errors", async () => {
    enqueueJob.mockRejectedValueOnce(new ServiceError("You do not have permission."));
    expect((await enqueueBulkFleshAction("c1", undefined, idsForm(["e1"])))?.error).toBe(
      "You do not have permission.",
    );

    enqueueJob.mockRejectedValueOnce(new Error("db down"));
    expect((await enqueueBulkFleshAction("c1", undefined, idsForm(["e1"])))?.error).toBe(
      "Failed to queue job. Please try again.",
    );
  });
});

describe("enqueueBuildSemanticIndexAction", () => {
  it("enqueues an EMBED_SEARCH_DOCS job and revalidates the search page", async () => {
    enqueueBuildSemanticIndexJob.mockResolvedValue({
      id: "j1",
      status: "QUEUED",
      created: true,
    });

    const result = await enqueueBuildSemanticIndexAction("c1", undefined, new FormData());

    expect(enqueueBuildSemanticIndexJob).toHaveBeenCalledWith("u1", "c1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/search");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/jobs");
    expect(result?.success).toContain("Semantic index build queued");
    expect(result?.activeJobStatus).toBe("QUEUED");
    expect(result?.error).toBeUndefined();
  });

  it("does not treat an already active semantic job as a new queued rebuild", async () => {
    enqueueBuildSemanticIndexJob.mockResolvedValue({
      id: "j1",
      status: "RUNNING",
      created: false,
    });

    const result = await enqueueBuildSemanticIndexAction("c1", undefined, new FormData());

    expect(result?.success).toContain("Semantic index build is already running");
    expect(result?.activeJobStatus).toBe("RUNNING");
    expect(result?.error).toBeUndefined();
  });

  it("surfaces a ServiceError message and a generic fallback for unexpected errors", async () => {
    enqueueBuildSemanticIndexJob.mockRejectedValueOnce(
      new ServiceError("You do not have permission."),
    );
    expect((await enqueueBuildSemanticIndexAction("c1", undefined, new FormData()))?.error).toBe(
      "You do not have permission.",
    );

    enqueueBuildSemanticIndexJob.mockRejectedValueOnce(new Error("db down"));
    expect((await enqueueBuildSemanticIndexAction("c1", undefined, new FormData()))?.error).toBe(
      "Failed to queue job. Please try again.",
    );
  });
});

describe("enqueueMigrateEntityDataAction", () => {
  it("enqueues a MIGRATE_ENTITY_DATA job and revalidates integrity and jobs", async () => {
    enqueueMigrateEntityDataJob.mockResolvedValue({
      id: "j1",
      status: "QUEUED",
      created: true,
    });

    const result = await enqueueMigrateEntityDataAction("c1", undefined, new FormData());

    expect(enqueueMigrateEntityDataJob).toHaveBeenCalledWith("u1", "c1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/integrity");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/jobs");
    expect(result?.success).toContain("Data repair queued");
    expect(result?.activeJobStatus).toBe("QUEUED");
    expect(result?.error).toBeUndefined();
  });

  it("does not treat an already active data repair as a new queued job", async () => {
    enqueueMigrateEntityDataJob.mockResolvedValue({
      id: "j1",
      status: "RUNNING",
      created: false,
    });

    const result = await enqueueMigrateEntityDataAction("c1", undefined, new FormData());

    expect(result?.success).toContain("Data repair is already running");
    expect(result?.activeJobStatus).toBe("RUNNING");
    expect(result?.error).toBeUndefined();
  });

  it("surfaces a ServiceError message and a generic fallback for unexpected errors", async () => {
    enqueueMigrateEntityDataJob.mockRejectedValueOnce(
      new ServiceError("You do not have permission."),
    );
    expect((await enqueueMigrateEntityDataAction("c1", undefined, new FormData()))?.error).toBe(
      "You do not have permission.",
    );

    enqueueMigrateEntityDataJob.mockRejectedValueOnce(new Error("db down"));
    expect((await enqueueMigrateEntityDataAction("c1", undefined, new FormData()))?.error).toBe(
      "Failed to queue data repair. Please try again.",
    );
  });
});

describe("cancelJobAction", () => {
  it("cancels a queued job and revalidates job/search surfaces", async () => {
    cancelJob.mockResolvedValue({
      id: "j1",
      kind: "EMBED_SEARCH_DOCS",
      status: "FAILED",
      error: "Canceled by DM.",
      result: null,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: new Date(),
    });

    const result = await cancelJobAction("c1", "j1");

    expect(cancelJob).toHaveBeenCalledWith("u1", "c1", "j1");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/jobs");
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/c1/search");
    expect(result?.success).toBe("Job canceled.");
  });

  it("surfaces ServiceError messages and hides unexpected failures", async () => {
    cancelJob.mockRejectedValueOnce(
      new ServiceError("Only queued jobs can be canceled."),
    );
    expect((await cancelJobAction("c1", "j1"))?.error).toBe(
      "Only queued jobs can be canceled.",
    );

    cancelJob.mockRejectedValueOnce(new Error("db down"));
    expect((await cancelJobAction("c1", "j1"))?.error).toBe(
      "Could not cancel the job. Please try again.",
    );
  });
});
