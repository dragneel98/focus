import { describe, expect, it } from "vitest";
import { getPeriodBounds, summarizeProductivity } from "./metrics";

const completedSession = (overrides: Record<string, unknown> = {}) => ({
  id: "session-1",
  localDate: "2026-10-21",
  taskId: "task-1",
  taskTitle: "Estudiar matemática",
  colorKey: "graphite",
  status: "completed" as const,
  creditedMinutes: 30,
  ...overrides,
});

describe("getPeriodBounds", () => {
  it("returns the selected local day", () => {
    expect(getPeriodBounds("day", "2026-10-25")).toEqual({ start: "2026-10-25", endExclusive: "2026-10-26" });
  });

  it("uses Monday as the first day of the week", () => {
    expect(getPeriodBounds("week", "2026-10-25")).toEqual({ start: "2026-10-19", endExclusive: "2026-10-26" });
  });

  it("uses calendar month boundaries", () => {
    expect(getPeriodBounds("month", "2026-10-25")).toEqual({ start: "2026-10-01", endExclusive: "2026-11-01" });
  });
});

describe("summarizeProductivity", () => {
  it("aggregates only credited completed sessions and completed task instances", () => {
    const result = summarizeProductivity(
      [
        completedSession(),
        completedSession({ id: "session-2", taskId: "task-2", taskTitle: "Leer historia", colorKey: "blue", creditedMinutes: 45 }),
        completedSession({ id: "session-3", status: "interrupted", creditedMinutes: 0 }),
      ],
      [
        { id: "task-1", localDate: "2026-10-21", status: "completed" },
        { id: "task-2", localDate: "2026-10-21", status: "in_progress" },
      ],
      { start: "2026-10-19", endExclusive: "2026-10-26" },
    );

    expect(result).toMatchObject({
      completedTasks: 1,
      creditedMinutes: 75,
      completedCycles: 2,
    });
    expect(result.series).toContainEqual({ date: "2026-10-21", taskId: "task-1", title: "Estudiar matemática", colorKey: "graphite", minutes: 30 });
    expect(result.series).toContainEqual({ date: "2026-10-21", taskId: "task-2", title: "Leer historia", colorKey: "blue", minutes: 45 });
  });
});
