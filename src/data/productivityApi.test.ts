import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeFocus, createTask, ensureDailyTasks, getMetricsData, startFocus, updateSettings, updateTaskTemplate } from "./productivityApi";

describe("task template updates", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => vi.useRealTimers());

  it("updates the color of already-created task instances", async () => {
    const task = await createTask({ title: "Study", estimateMinutes: 60, colorKey: "blue" });

    await updateTaskTemplate(task.templateId, { title: "Study", estimateMinutes: 60, colorKey: "sage" });

    const [updatedTask] = await ensureDailyTasks(task.localDate, task.timezoneId);
    expect(updatedTask.colorKey).toBe("sage");
  });

  it("keeps completed tasks complete while crediting further focus cycles", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00"));
    await updateSettings(1, 1);
    const task = await createTask({ title: "Study", estimateMinutes: 1, colorKey: "blue" });

    await startFocus(task.id);
    vi.advanceTimersByTime(60_000);
    await completeFocus();
    await startFocus(task.id);
    vi.advanceTimersByTime(60_000);
    await completeFocus();

    const [updatedTask] = await ensureDailyTasks(task.localDate, task.timezoneId);
    const metrics = await getMetricsData(task.localDate, "2026-10-26");
    expect(updatedTask).toMatchObject({ creditedMinutes: 2, status: "completed" });
    expect(metrics.sessions.reduce((total, session) => total + session.creditedMinutes, 0)).toBe(2);
  });
});
