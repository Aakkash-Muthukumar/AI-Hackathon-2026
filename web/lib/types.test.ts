import { describe, it, expect } from "vitest";
import { getUrgency, SOURCE_LABELS, URGENCY_COLORS } from "./types";

describe("getUrgency", () => {
  it("returns 'later' when no deadline is given", () => {
    expect(getUrgency(undefined)).toBe("later");
  });

  it("returns 'overdue' for a past deadline", () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    expect(getUrgency(past)).toBe("overdue");
  });

  it("returns 'today' for a deadline within 24 hours", () => {
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 3).toISOString();
    expect(getUrgency(soon)).toBe("today");
  });

  it("returns 'this_week' for a deadline within 7 days", () => {
    const inThreeDays = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString();
    expect(getUrgency(inThreeDays)).toBe("this_week");
  });

  it("returns 'later' for a deadline more than a week out", () => {
    const inTwoWeeks = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
    expect(getUrgency(inTwoWeeks)).toBe("later");
  });
});

describe("label maps", () => {
  it("has a label and color for every urgency level", () => {
    for (const level of ["overdue", "today", "this_week", "later"] as const) {
      expect(URGENCY_COLORS[level]).toBeTruthy();
    }
  });

  it("has a label for every assignment source", () => {
    expect(SOURCE_LABELS.canvas).toBe("Canvas");
    expect(SOURCE_LABELS.manual).toBe("Manual");
  });
});
