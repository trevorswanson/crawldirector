// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { requireUser, getCampaignForUser, getPersonaStudio, notFound } = vi.hoisted(
  () => ({
    requireUser: vi.fn(),
    getCampaignForUser: vi.fn(),
    getPersonaStudio: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  }),
);

vi.mock("@/server/auth/session", () => ({ requireUser }));
vi.mock("@/server/services/campaigns", () => ({ getCampaignForUser }));
vi.mock("@/server/services/persona", () => ({ getPersonaStudio }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/app/(dm)/actions", () => ({
  activatePersonaSnapshotAction: vi.fn(),
  togglePersonaPromptLockAction: vi.fn(),
}));
vi.mock("@/components/persona/persona-editor", () => ({
  PersonaEditor: (props: { snapshotId?: string; fullyLocked?: boolean }) => (
    <div data-testid="persona-editor">
      editor:{props.snapshotId ?? "new"}:{props.fullyLocked ? "locked" : "open"}
    </div>
  ),
}));

import PersonaStudioPage from "@/app/(dm)/campaigns/[id]/persona/page";

function snapshot(over: Record<string, unknown> = {}) {
  return {
    id: "snap1",
    label: "Petty God",
    dials: { sentience: 80 },
    values: ["ratings"],
    overtAgendas: ["Be a show."],
    secretAgendas: ["Punish Borant."],
    resources: [{ key: "spotlight", value: "overlays" }],
    knowledgeScope: "OMNISCIENT",
    voiceGuide: "Grandiose.",
    constraints: "",
    compiledPrompt: "System AI persona: Petty God",
    isActive: true,
    locked: false,
    promptLocked: false,
    version: 4,
    source: "DM",
    createdAt: new Date("2026-06-19T00:00:00Z"),
    updatedAt: new Date("2026-06-19T00:00:00Z"),
    originChangeSetId: "cs1",
    ...over,
  };
}

function render_(searchParams: Record<string, string> = {}) {
  return PersonaStudioPage({
    params: Promise.resolve({ id: "c1" }),
    searchParams: Promise.resolve(searchParams),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1" });
  getCampaignForUser.mockResolvedValue({
    id: "c1",
    name: "World One",
    members: [{ role: "OWNER" }],
  });
});

afterEach(() => cleanup());

describe("Persona Studio page", () => {
  it("shows an empty state pointing to the World Browser when no System AI entity exists", async () => {
    getPersonaStudio.mockResolvedValue({
      entities: [],
      selectedEntityId: null,
      snapshots: [],
      activeSnapshotId: null,
    });

    render(await render_());

    expect(screen.getByText(/No System AI entity yet/i)).toBeDefined();
    const link = screen.getByRole("link", { name: /Open World Browser/i });
    expect(link.getAttribute("href")).toBe("/campaigns/c1");
  });

  it("renders the selected active snapshot, its stored prompt, and review deep-link", async () => {
    getPersonaStudio.mockResolvedValue({
      entities: [{ id: "e1", name: "The System" }],
      selectedEntityId: "e1",
      snapshots: [snapshot()],
      activeSnapshotId: "snap1",
    });

    render(await render_());

    expect(screen.getByText("Active persona")).toBeDefined();
    expect(screen.getByRole("button", { name: /Lock prompt/i })).toBeDefined();
    expect(screen.getByText("System AI persona: Petty God")).toBeDefined();
    expect(screen.getByTestId("persona-editor").textContent).toBe("editor:snap1:open");
    const review = screen.getByRole("link", { name: /View in Review Queue/i });
    expect(review.getAttribute("href")).toBe("/campaigns/c1/review?selected=cs1");
  });

  it("surfaces the prompt-locked notice and an unlock control", async () => {
    getPersonaStudio.mockResolvedValue({
      entities: [{ id: "e1", name: "The System" }],
      selectedEntityId: "e1",
      snapshots: [snapshot({ promptLocked: true })],
      activeSnapshotId: "snap1",
    });

    render(await render_());

    expect(screen.getByText(/compiled prompt is locked/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Unlock prompt/i })).toBeDefined();
  });

  it("offers a Make active control for an inactive snapshot", async () => {
    getPersonaStudio.mockResolvedValue({
      entities: [{ id: "e1", name: "The System" }],
      selectedEntityId: "e1",
      snapshots: [snapshot({ isActive: false })],
      activeSnapshotId: null,
    });

    render(await render_());

    expect(screen.getByRole("button", { name: /Make active/i })).toBeDefined();
    expect(screen.queryByText("Active persona")).toBeNull();
  });

  it("enters create mode for snapshot=new", async () => {
    getPersonaStudio.mockResolvedValue({
      entities: [{ id: "e1", name: "The System" }],
      selectedEntityId: "e1",
      snapshots: [snapshot()],
      activeSnapshotId: "snap1",
    });

    render(await render_({ snapshot: "new" }));

    expect(screen.getByTestId("persona-editor").textContent).toBe("editor:new:open");
    expect(screen.getAllByText(/New persona snapshot/i).length).toBeGreaterThan(0);
  });

  it("rejects players via notFound", async () => {
    getCampaignForUser.mockResolvedValue({
      id: "c1",
      name: "World One",
      members: [{ role: "PLAYER" }],
    });

    await expect(render_()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
