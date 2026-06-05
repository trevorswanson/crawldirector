// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { EventTimeFields } from "@/components/entities/event-time-fields";

afterEach(cleanup);

describe("EventTimeFields", () => {
  it("seeds the basis/offset/unit from initial and disables offset when unscheduled", () => {
    render(
      <EventTimeFields
        initial={{ basis: "FLOOR_COLLAPSE", floor: 9, offset: 12, unit: "HOUR" }}
      />,
    );

    expect((screen.getByLabelText("Time basis") as HTMLSelectElement).value).toBe(
      "FLOOR_COLLAPSE",
    );
    expect((screen.getByLabelText("Time offset") as HTMLInputElement).value).toBe("12");
    expect((screen.getByLabelText("Time unit") as HTMLSelectElement).value).toBe("HOUR");

    // Switching to UNSCHEDULED disables the offset + unit controls.
    fireEvent.change(screen.getByLabelText("Time basis"), {
      target: { value: "UNSCHEDULED" },
    });
    expect((screen.getByLabelText("Time offset") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Time unit") as HTMLSelectElement).disabled).toBe(true);
  });

  it("reveals an anchor picker for the EVENT basis, excluding the edited event", () => {
    render(
      <EventTimeFields
        initial={{ basis: "FLOOR_START", floor: 3 }}
        anchorCandidates={[
          { id: "ev1", title: "Carl's stunt" },
          { id: "self", title: "This event" },
        ]}
        excludeEventId="self"
      />,
    );

    // No anchor picker until EVENT is chosen.
    expect(screen.queryByLabelText("Anchor event")).toBeNull();

    fireEvent.change(screen.getByLabelText("Time basis"), {
      target: { value: "EVENT" },
    });

    const anchor = screen.getByLabelText("Anchor event");
    expect(anchor).toBeDefined();
    expect(screen.getByRole("option", { name: "Carl's stunt" })).toBeDefined();
    // The event being edited is not offered as its own anchor.
    expect(screen.queryByRole("option", { name: "This event" })).toBeNull();
  });

  it("infers UNSCHEDULED with no initial floor or basis", () => {
    render(<EventTimeFields />);
    expect((screen.getByLabelText("Time basis") as HTMLSelectElement).value).toBe(
      "UNSCHEDULED",
    );
  });
});
