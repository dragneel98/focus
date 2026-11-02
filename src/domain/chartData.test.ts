import { describe, expect, it } from "vitest";
import { buildStackedChartData } from "./chartData";

describe("buildStackedChartData", () => {
  it("fills empty dates and keeps each task as a stable colored series", () => {
    const chart = buildStackedChartData(
      "week",
      "2026-10-25",
      [
        { date: "2026-10-19", taskId: "math", title: "Matemática", colorKey: "blue", minutes: 30 },
        { date: "2026-10-21", taskId: "history", title: "Historia", colorKey: "terracotta", minutes: 45 },
      ],
    );

    expect(chart.rows).toHaveLength(7);
    expect(chart.rows[0]).toMatchObject({ date: "2026-10-19", math: 30, history: 0 });
    expect(chart.rows[1]).toMatchObject({ date: "2026-10-20", math: 0, history: 0 });
    expect(chart.series).toEqual([
      { key: "history", title: "Historia", color: "#c26c4f" },
      { key: "math", title: "Matemática", color: "#4777f5" },
    ]);
  });
});
