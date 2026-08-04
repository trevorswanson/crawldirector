import { describe, expect, it } from "vitest";

import {
  addSessionLogEntrySchema,
  promoteSessionLogEntrySchema,
  createCampaignSchema,
  createCrawlerSchema,
  createEventSchema,
  createGenericEntitySchema,
  createRelationshipSchema,
  createSessionSchema,
  lockFieldSchema,
  playerSuggestionSchema,
  revealEntityBroadlySchema,
  sanitizeImageUrl,
  sessionRevealSchema,
  signInSchema,
  signUpSchema,
  updateEntitySchema,
  updateEventSchema,
} from "@/lib/validation";

describe("signUpSchema", () => {
  it("accepts a valid sign-up", () => {
    const r = signUpSchema.safeParse({
      name: "Carl",
      email: "carl@example.com",
      password: "hunter2hunter2",
    });
    expect(r.success).toBe(true);
  });

  it("rejects short passwords", () => {
    const r = signUpSchema.safeParse({
      name: "Carl",
      email: "carl@example.com",
      password: "short",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed emails", () => {
    const r = signUpSchema.safeParse({
      name: "Carl",
      email: "not-an-email",
      password: "hunter2hunter2",
    });
    expect(r.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("accepts a valid sign-in", () => {
    const r = signInSchema.safeParse({
      email: "carl@example.com",
      password: "anything",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const r = signInSchema.safeParse({
      email: "carl@example.com",
      password: "",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const r = signInSchema.safeParse({ email: "nope", password: "x" });
    expect(r.success).toBe(false);
  });
});

describe("createCampaignSchema", () => {
  it("requires a name", () => {
    expect(createCampaignSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ name: "World" }).success).toBe(true);
  });

  it("accepts an optional summary and an empty-string summary", () => {
    expect(
      createCampaignSchema.safeParse({ name: "World", summary: "A place" })
        .success,
    ).toBe(true);
    expect(
      createCampaignSchema.safeParse({ name: "World", summary: "" }).success,
    ).toBe(true);
  });

  it("rejects an over-long summary", () => {
    const r = createCampaignSchema.safeParse({
      name: "World",
      summary: "x".repeat(2001),
    });
    expect(r.success).toBe(false);
  });
});

describe("entity schemas", () => {
  it("normalizes tags and accepts generic entity types", () => {
    const parsed = createGenericEntitySchema.parse({
      type: "FACTION",
      name: "  Skull Empire  ",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: "war, sponsor, war",
    });
    expect(parsed.name).toBe("Skull Empire");
    expect(parsed.tags).toEqual(["war", "sponsor", "war"]);
  });

  it("accepts already-normalized tag arrays from service callers", () => {
    const parsed = createGenericEntitySchema.parse({
      type: "NPC",
      name: "Zev",
      summary: "",
      description: "",
      visibility: "DM_ONLY",
      tags: [" admin ", ""],
    });
    expect(parsed.tags).toEqual(["admin"]);
  });

  it("rejects CRAWLER in the generic entity schema", () => {
    expect(
      createGenericEntitySchema.safeParse({
        type: "CRAWLER",
        name: "Carl",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: "",
      }).success,
    ).toBe(false);
  });

  it("coerces crawler numeric fields from form values", () => {
    const parsed = createCrawlerSchema.parse({
      name: "Carl",
      summary: "",
      description: "",
      visibility: "PLAYER_VISIBLE",
      tags: "",
      level: "2",
      hp: "30",
      mp: "",
      gold: "10",
      viewCount: "500",
      followerCount: "25",
      favoriteCount: "5",
      killCount: "3",
      currentFloor: "1",
      isAlive: "true",
    });
    expect(parsed.level).toBe(2);
    expect(parsed.mp).toBeUndefined();
    expect(parsed.viewCount).toBe(BigInt(500));
    expect(parsed.followerCount).toBe(BigInt(25));
    expect(parsed.favoriteCount).toBe(BigInt(5));
  });

  it("preserves large crawler audience ratings as bigint values", () => {
    const viewCount = "9007199254740993";
    const parsed = createCrawlerSchema.parse({
      name: "Carl",
      summary: "",
      description: "",
      visibility: "PLAYER_VISIBLE",
      tags: "",
      viewCount,
    });
    expect(parsed.viewCount).toBe(BigInt(viewCount));
  });

  it("rejects unsafe numeric audience ratings before precision is lost", () => {
    const r = createCrawlerSchema.safeParse({
      name: "Carl",
      summary: "",
      description: "",
      visibility: "PLAYER_VISIBLE",
      tags: "",
      viewCount: 9007199254740992,
    });
    expect(r.success).toBe(false);
  });

  it("accepts and trims an http(s) image URL", () => {
    const parsed = createGenericEntitySchema.parse({
      type: "NPC",
      name: "Donut",
      summary: "",
      description: "",
      imageUrl: "  https://example.com/donut.png  ",
      visibility: "DM_ONLY",
      tags: "",
    });
    expect(parsed.imageUrl).toBe("https://example.com/donut.png");
  });

  it("treats a blank image URL as empty (optional)", () => {
    const parsed = createGenericEntitySchema.parse({
      type: "NPC",
      name: "Donut",
      summary: "",
      description: "",
      imageUrl: "",
      visibility: "DM_ONLY",
      tags: "",
    });
    expect(parsed.imageUrl).toBe("");
  });

  it("rejects a non-http(s) image URL scheme", () => {
    const r = createGenericEntitySchema.safeParse({
      type: "NPC",
      name: "Donut",
      summary: "",
      description: "",
      imageUrl: "javascript:alert(1)",
      visibility: "DM_ONLY",
      tags: "",
    });
    expect(r.success).toBe(false);
  });

  it("keeps update type immutable by requiring the submitted type", () => {
    expect(
      updateEntitySchema.safeParse({
        type: "NPC",
        name: "Zev",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: "",
      }).success,
    ).toBe(true);
    expect(
      updateEntitySchema.safeParse({
        name: "Zev",
        summary: "",
        description: "",
        visibility: "DM_ONLY",
        tags: "",
      }).success,
    ).toBe(false);
  });
});

describe("lockFieldSchema", () => {
  it("accepts a core lockable field", () => {
    expect(lockFieldSchema.safeParse("name").success).toBe(true);
  });

  it("accepts a crawler lockable field", () => {
    expect(lockFieldSchema.safeParse("crawler.level").success).toBe(true);
  });

  it("accepts the imageUrl core lockable field", () => {
    expect(lockFieldSchema.safeParse("imageUrl").success).toBe(true);
  });

  it("rejects an unknown field", () => {
    expect(lockFieldSchema.safeParse("bogus").success).toBe(false);
  });
});

describe("playerSuggestionSchema", () => {
  it("accepts trimmed summary/description, both optional", () => {
    const parsed = playerSuggestionSchema.safeParse({
      summary: "  New bio  ",
      description: "  New notes  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.summary).toBe("New bio");
      expect(parsed.data.description).toBe("New notes");
    }
  });

  it("accepts an empty object (both fields absent)", () => {
    expect(playerSuggestionSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an overlong summary or description", () => {
    expect(
      playerSuggestionSchema.safeParse({ summary: "a".repeat(501) }).success,
    ).toBe(false);
    expect(
      playerSuggestionSchema.safeParse({ description: "a".repeat(10001) })
        .success,
    ).toBe(false);
  });
});

describe("createSessionSchema", () => {
  it("requires a title", () => {
    expect(createSessionSchema.safeParse({ title: "" }).success).toBe(false);
    expect(createSessionSchema.safeParse({ title: "  " }).success).toBe(false);
  });

  it("accepts a title alone, with playedAt/focus/notes all optional", () => {
    const parsed = createSessionSchema.safeParse({ title: "Session 12" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe("Session 12");
      expect(parsed.data.playedAt).toBeUndefined();
    }
  });

  it("accepts a valid date string for playedAt and rejects an invalid one", () => {
    expect(
      createSessionSchema.safeParse({ title: "S", playedAt: "2026-08-04" }).success,
    ).toBe(true);
    expect(
      createSessionSchema.safeParse({ title: "S", playedAt: "not-a-date" }).success,
    ).toBe(false);
  });

  it("treats an empty playedAt string as unset", () => {
    const parsed = createSessionSchema.safeParse({ title: "S", playedAt: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.playedAt).toBeUndefined();
  });

  it("rejects an overlong title", () => {
    expect(createSessionSchema.safeParse({ title: "a".repeat(201) }).success).toBe(false);
  });
});

describe("addSessionLogEntrySchema", () => {
  it("requires non-empty text", () => {
    expect(addSessionLogEntrySchema.safeParse({ text: "" }).success).toBe(false);
    expect(addSessionLogEntrySchema.safeParse({ text: "  " }).success).toBe(false);
  });

  it("trims text and defaults taggedIds to an empty array", () => {
    const parsed = addSessionLogEntrySchema.safeParse({ text: "  Donut vs the Maestro  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.text).toBe("Donut vs the Maestro");
      expect(parsed.data.taggedIds).toEqual([]);
    }
  });

  it("accepts tagged entity ids", () => {
    const parsed = addSessionLogEntrySchema.safeParse({
      text: "Tagged entry",
      taggedIds: ["e1", "e2"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.taggedIds).toEqual(["e1", "e2"]);
  });

  it("rejects too many tagged entities or overlong text", () => {
    expect(
      addSessionLogEntrySchema.safeParse({
        text: "x",
        taggedIds: Array.from({ length: 21 }, (_, i) => `e${i}`),
      }).success,
    ).toBe(false);
    expect(addSessionLogEntrySchema.safeParse({ text: "a".repeat(2001) }).success).toBe(false);
  });
});

describe("promoteSessionLogEntrySchema", () => {
  it("requires a non-empty title", () => {
    expect(promoteSessionLogEntrySchema.safeParse({ title: "" }).success).toBe(false);
    expect(promoteSessionLogEntrySchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("trims the title", () => {
    const parsed = promoteSessionLogEntrySchema.safeParse({ title: "  Maestro incident  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.title).toBe("Maestro incident");
  });

  it("rejects an overlong title", () => {
    expect(promoteSessionLogEntrySchema.safeParse({ title: "a".repeat(201) }).success).toBe(false);
  });
});

describe("revealEntityBroadlySchema", () => {
  it("requires a non-empty entity id", () => {
    expect(revealEntityBroadlySchema.safeParse({ entityId: "" }).success).toBe(false);
    expect(revealEntityBroadlySchema.safeParse({ entityId: "  " }).success).toBe(false);
  });

  it("accepts and trims a picked entity id", () => {
    const parsed = revealEntityBroadlySchema.safeParse({ entityId: "  e1  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.entityId).toBe("e1");
  });
});

describe("sessionRevealSchema", () => {
  it("accepts an ENTITY recipient with a targetEntityId + recipientEntityId", () => {
    const parsed = sessionRevealSchema.safeParse({
      targetEntityId: "target1",
      recipientKind: "ENTITY",
      recipientEntityId: "npc1",
      notes: "  overheard  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.recipientKind === "ENTITY") {
      expect(parsed.data.recipientEntityId).toBe("npc1");
      expect(parsed.data.notes).toBe("overheard");
    }
  });

  it("accepts a MEMBERSHIP recipient with a targetEntityId + membershipId", () => {
    const parsed = sessionRevealSchema.safeParse({
      targetEntityId: "target1",
      recipientKind: "MEMBERSHIP",
      membershipId: "m1",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.recipientKind === "MEMBERSHIP") {
      expect(parsed.data.membershipId).toBe("m1");
    }
  });

  it("rejects an ENTITY recipient missing recipientEntityId", () => {
    expect(
      sessionRevealSchema.safeParse({
        targetEntityId: "target1",
        recipientKind: "ENTITY",
        recipientEntityId: "",
      }).success,
    ).toBe(false);
  });

  it("rejects a MEMBERSHIP recipient missing membershipId", () => {
    expect(
      sessionRevealSchema.safeParse({
        targetEntityId: "target1",
        recipientKind: "MEMBERSHIP",
      }).success,
    ).toBe(false);
  });

  it("rejects a blank targetEntityId and an unknown recipientKind", () => {
    expect(
      sessionRevealSchema.safeParse({
        targetEntityId: "",
        recipientKind: "ENTITY",
        recipientEntityId: "npc1",
      }).success,
    ).toBe(false);
    expect(
      sessionRevealSchema.safeParse({
        targetEntityId: "target1",
        recipientKind: "SOMETHING_ELSE",
      }).success,
    ).toBe(false);
  });
});

describe("sanitizeImageUrl", () => {
  it("keeps a valid http(s) URL (trimmed)", () => {
    expect(sanitizeImageUrl("  https://example.com/a.png  ")).toBe(
      "https://example.com/a.png",
    );
  });

  it("nulls an unsafe scheme, blank, and non-string input", () => {
    expect(sanitizeImageUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(sanitizeImageUrl("")).toBeNull();
    expect(sanitizeImageUrl(null)).toBeNull();
    expect(sanitizeImageUrl(42)).toBeNull();
  });

  it("nulls an overlong URL", () => {
    expect(sanitizeImageUrl(`https://example.com/${"a".repeat(2050)}`)).toBeNull();
  });
});

describe("createRelationshipSchema", () => {
  it("parses a full edge and coerces secret + disposition", () => {
    const parsed = createRelationshipSchema.parse({
      type: "ALLY_OF",
      targetId: "e2",
      disposition: "75",
      notes: "trusted",
      secret: "on",
    });
    expect(parsed.type).toBe("ALLY_OF");
    expect(parsed.targetId).toBe("e2");
    expect(parsed.disposition).toBe(75);
    expect(parsed.notes).toBe("trusted");
    expect(parsed.secret).toBe(true);
  });

  it("defaults secret to false and leaves disposition undefined when blank", () => {
    const parsed = createRelationshipSchema.parse({
      type: "RIVAL_OF",
      targetId: "e3",
      disposition: "",
      notes: "",
    });
    expect(parsed.secret).toBe(false);
    expect(parsed.disposition).toBeUndefined();
  });

  it("requires a target entity", () => {
    const result = createRelationshipSchema.safeParse({
      type: "ALLY_OF",
      targetId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range disposition", () => {
    const result = createRelationshipSchema.safeParse({
      type: "ALLY_OF",
      targetId: "e2",
      disposition: "500",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown relationship type", () => {
    const result = createRelationshipSchema.safeParse({
      type: "NOT_A_TYPE",
      targetId: "e2",
    });
    expect(result.success).toBe(false);
  });
});

describe("createEventSchema", () => {
  it("parses an event, coerces floor + secret, and defaults the role", () => {
    const parsed = createEventSchema.parse({
      title: "Floor 9 boss fight",
      summary: "They won",
      floor: "9",
      timeLabel: "Day 3",
      secret: "on",
      participants: [{ entityId: "e1" }, { entityId: "e2", role: "TARGET" }],
    });
    expect(parsed.title).toBe("Floor 9 boss fight");
    expect(parsed.floor).toBe(9);
    expect(parsed.secret).toBe(true);
    expect(parsed.participants[0].role).toBe("ACTOR");
    expect(parsed.participants[1].role).toBe("TARGET");
  });

  it("defaults secret to false and leaves floor undefined when blank", () => {
    const parsed = createEventSchema.parse({
      title: "Quiet moment",
      summary: "",
      floor: "",
      timeLabel: "",
      participants: [{ entityId: "e1", role: "WITNESS" }],
    });
    expect(parsed.secret).toBe(false);
    expect(parsed.floor).toBeUndefined();
  });

  it("requires a title", () => {
    const result = createEventSchema.safeParse({
      title: "",
      participants: [{ entityId: "e1", role: "ACTOR" }],
    });
    expect(result.success).toBe(false);
  });

  it("allows an event with no participants", () => {
    const result = createEventSchema.safeParse({
      title: "Lonely event",
      participants: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an out-of-range floor", () => {
    const result = createEventSchema.safeParse({
      title: "Bad floor",
      floor: "99",
      participants: [{ entityId: "e1", role: "ACTOR" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown participant role", () => {
    const result = createEventSchema.safeParse({
      title: "Bad role",
      participants: [{ entityId: "e1", role: "NOPE" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("updateEventSchema effects", () => {
  it("parses a SET_STAT effect value", () => {
    const parsed = updateEventSchema.parse({
      title: "Floor shift",
      effects: [
        {
          kind: "SET_STAT",
          targetEntityId: "crawler1",
          stat: "currentFloor",
          valueNumber: "1",
        },
      ],
    });

    expect(parsed.effects?.[0]).toMatchObject({
      kind: "SET_STAT",
      stat: "currentFloor",
      valueNumber: 1,
    });
  });

  it("rejects incomplete event effects", () => {
    const missingAdjustStat = updateEventSchema.safeParse({
      title: "Bad adjust",
      effects: [{ kind: "ADJUST_STAT", targetEntityId: "crawler1", delta: "1" }],
    });
    const missingStat = updateEventSchema.safeParse({
      title: "Bad set",
      effects: [{ kind: "SET_STAT", targetEntityId: "crawler1", valueNumber: "1" }],
    });
    const missingValue = updateEventSchema.safeParse({
      title: "Bad set",
      effects: [{ kind: "SET_STAT", targetEntityId: "crawler1", stat: "currentFloor" }],
    });
    const missingDelta = updateEventSchema.safeParse({
      title: "Bad adjust",
      effects: [{ kind: "ADJUST_STAT", targetEntityId: "crawler1", stat: "gold" }],
    });
    const missingAliveValue = updateEventSchema.safeParse({
      title: "Bad alive",
      effects: [{ kind: "SET_ALIVE", targetEntityId: "crawler1" }],
    });

    expect(missingAdjustStat.success).toBe(false);
    expect(missingStat.success).toBe(false);
    expect(missingValue.success).toBe(false);
    expect(missingDelta.success).toBe(false);
    expect(missingAliveValue.success).toBe(false);
  });
});
