// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { useActionState, useFormStatus } = vi.hoisted(() => ({
  useActionState: vi.fn(),
  useFormStatus: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState,
}));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus,
}));
vi.mock("@/app/(dm)/actions", () => ({
  archiveEntityAction: vi.fn(),
  createCrawlerAction: Object.assign(vi.fn(), { bind: vi.fn(() => vi.fn()) }),
  createGenericEntityAction: Object.assign(vi.fn(), {
    bind: vi.fn(() => vi.fn()),
  }),
  updateEntityAction: Object.assign(vi.fn(), { bind: vi.fn(() => vi.fn()) }),
}));

import {
  ArchiveEntityForm,
  CreateCrawlerForm,
  CreateGenericEntityForm,
  EditEntityForm,
} from "@/components/entities/entity-forms";
import type { EntityDetail } from "@/server/services/entities";

const noopAction = vi.fn();

const crawlerEntity: EntityDetail = {
  id: "e1",
  campaignId: "c1",
  type: "CRAWLER",
  name: "Carl",
  summary: "No shoes",
  description: "Crawler notes",
  status: "CANON",
  visibility: "PLAYER_FACING",
  tags: ["floor 1"],
  version: 1,
  locked: false,
  lockedFields: [],
  isStub: false,
  agentEnabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  crawler: {
    realName: "Carl",
    crawlerNo: "1",
    level: 2,
    hp: 30,
    mp: 5,
    gold: 10,
    viewCount: BigInt(5000),
    followerCount: BigInt(500),
    favoriteCount: BigInt(50),
    killCount: 3,
    isAlive: true,
    currentFloor: 1,
  },
};

const genericEntity: EntityDetail = {
  ...crawlerEntity,
  id: "e2",
  type: "NPC",
  name: "Zev",
  summary: null,
  description: null,
  visibility: "DM_ONLY",
  tags: [],
  crawler: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  useActionState.mockReturnValue([undefined, noopAction]);
  useFormStatus.mockReturnValue({ pending: false });
});

afterEach(cleanup);

describe("entity forms", () => {
  it("renders the crawler creation fields", () => {
    render(<CreateCrawlerForm campaignId="c1" />);

    expect(screen.getByLabelText("Name")).toBeDefined();
    expect(screen.getByLabelText("Real name")).toBeDefined();
    expect(screen.getByLabelText("Crawler number")).toBeDefined();
    expect(screen.getByLabelText("Views")).toBeDefined();
    expect(screen.getByLabelText("Followers")).toBeDefined();
    expect(screen.getByLabelText("Favorites")).toBeDefined();
    expect(screen.getByRole("button", { name: /Create crawler/ })).toBeDefined();
  });

  it("renders the generic entity creation type selector", () => {
    render(<CreateGenericEntityForm campaignId="c1" />);

    expect(screen.getByLabelText("Type")).toBeDefined();
    expect(screen.getByRole("button", { name: /Create entity/ })).toBeDefined();
  });

  it("renders crawler edit values and success state", () => {
    useActionState.mockReturnValue([{ success: "Saved." }, noopAction]);
    render(<EditEntityForm campaignId="c1" entity={crawlerEntity} />);

    expect(screen.getAllByDisplayValue("Carl")).toHaveLength(2);
    expect(screen.getByDisplayValue("Crawler notes")).toBeDefined();
    expect(screen.getByDisplayValue("500")).toBeDefined();
    expect(screen.getByText("Saved.")).toBeDefined();
  });

  it("renders generic edit fields without crawler-only inputs", () => {
    useActionState.mockReturnValue([{ error: "Nope" }, noopAction]);
    render(<EditEntityForm campaignId="c1" entity={genericEntity} />);

    expect(screen.getByDisplayValue("Zev")).toBeDefined();
    expect(screen.queryByLabelText("Crawler number")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Nope");
  });

  it("renders archive action and pending submit state", () => {
    useFormStatus.mockReturnValue({ pending: true });
    render(<ArchiveEntityForm campaignId="c1" entityId="e1" />);

    expect(screen.getByRole("button", { name: /Archive/ })).toBeDefined();
  });
});
