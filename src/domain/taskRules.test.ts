import { describe, expect, it } from "vitest";
import { creditCompletedCycle, estimateMinutesFromHours } from "./taskRules";

describe("creditCompletedCycle", () => {
  it("credits one completed 30-minute cycle toward a daily estimate", () => {
    expect(creditCompletedCycle(60, 0, 30, true)).toEqual({ creditedMinutes: 30, isComplete: false });
  });

  it("completes a one-hour task after two completed 30-minute cycles", () => {
    expect(creditCompletedCycle(60, 30, 30, true)).toEqual({ creditedMinutes: 60, isComplete: true });
  });

  it("credits the full final cycle even when it exceeds the estimate", () => {
    expect(creditCompletedCycle(55, 45, 30, true)).toEqual({ creditedMinutes: 75, isComplete: true });
  });

  it("keeps crediting completed tasks when work continues past the estimate", () => {
    expect(creditCompletedCycle(60, 60, 30, true)).toEqual({ creditedMinutes: 90, isComplete: true });
  });

  it("does not credit an interrupted cycle", () => {
    expect(creditCompletedCycle(60, 0, 30, false)).toEqual({ creditedMinutes: 0, isComplete: false });
  });
});

describe("estimateMinutesFromHours", () => {
  it("converts fractional hours to integer minutes", () => {
    expect(estimateMinutesFromHours(1.5)).toBe(90);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid estimate %s", (hours) => {
    expect(() => estimateMinutesFromHours(hours)).toThrow();
  });
});
