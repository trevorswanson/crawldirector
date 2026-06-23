// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { proposeEventConsequencesAction } = vi.hoisted(() => ({
  proposeEventConsequencesAction: vi.fn(),
}));

vi.mock("@/app/(dm)/actions", () => ({ proposeEventConsequencesAction }));

import { ConsequenceGenerator } from "@/components/timeline/consequence-generator";

describe("ConsequenceGenerator", () => {
  it("submits an event and links the resulting Review Queue proposal", async () => {
    proposeEventConsequencesAction.mockResolvedValue({
      success: "2 consequences proposed (test-model). Review them in the queue.",
      changeSetId: "cs-1",
      timestamp: 1,
    });
    render(<ConsequenceGenerator campaignId="c1" eventId="ev-1" />);
    fireEvent.click(screen.getByRole("button", { name: /propose consequences/i }));
    await waitFor(() => expect(proposeEventConsequencesAction).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: /open review queue/i }).getAttribute("href")).toBe(
      "/campaigns/c1/review?selected=cs-1",
    );
  });
});
