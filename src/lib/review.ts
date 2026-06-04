// Shared, client-safe helpers for rendering and round-tripping Review Queue
// operation diffs. Kept free of server imports so both the server page and the
// client-side per-field editor can use them.

export type ReviewInputKind = "array" | "boolean" | "json" | "number" | "string";

function isObjectArray(value: unknown[]): boolean {
  return value.some((item) => item !== null && typeof item === "object");
}

// Classify a value so the editor renders the right control and the action
// parses the submitted string back to the right type. Arrays of objects (e.g. an
// event's participant rows) are treated as JSON so editing round-trips, while
// arrays of scalars (e.g. tags) stay comma-separated.
export function reviewInputKind(value: unknown): ReviewInputKind {
  if (Array.isArray(value)) return isObjectArray(value) ? "json" : "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value && typeof value === "object") return "json";
  return "string";
}

// Human-readable rendering of a proposed/current value for the read-only diff.
export function formatReviewValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "Empty";
  if (Array.isArray(value)) {
    if (isObjectArray(value)) return JSON.stringify(value);
    return value.join(", ") || "Empty";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Render a value into the string an <input>/<textarea> should hold for editing
// (the inverse of the action's `parseReviewEditedValue`).
export function formatInputValue(value: unknown, kind: ReviewInputKind): string {
  if (kind === "array" && Array.isArray(value)) return value.join(", ");
  if (kind === "json") return JSON.stringify(value ?? null, null, 2);
  if (value === undefined || value === null) return "";
  return String(value);
}
