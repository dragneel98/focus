import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskList } from "./TaskList";
import type { TaskInstance } from "../domain/types";

const task: TaskInstance = {
  id: "today-math",
  templateId: "math",
  localDate: "2026-10-25",
  timezoneId: "America/Argentina/Buenos_Aires",
  title: "Estudiar matemática",
  estimateMinutes: 60,
  creditedMinutes: 30,
  colorKey: "blue",
  status: "in_progress",
  completedAtLocalDate: null,
};

describe("TaskList", () => {
  it("allows choosing a task for focus but never offers manual completion", () => {
    const onSelect = vi.fn();
    render(
      <TaskList
        tasks={[task]}
        selectedTaskId={null}
        timerActive={false}
        onSelect={onSelect}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /estudiar matemática/i }));
    expect(onSelect).toHaveBeenCalledWith("today-math");
    expect(screen.queryByRole("button", { name: /completar/i })).not.toBeInTheDocument();
    expect(screen.getByText("30 min de 1 h" )).toBeInTheDocument();
  });

  it("does not allow changing the selected task while a timer is active", () => {
    const onSelect = vi.fn();
    render(
      <TaskList
        tasks={[task]}
        selectedTaskId="today-math"
        timerActive
        onSelect={onSelect}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: /estudiar matemática/i })).toHaveAttribute("aria-disabled", "true");
  });

  it("offers a continue action for completed tasks", () => {
    const onContinue = vi.fn();
    render(
      <TaskList
        tasks={[{ ...task, status: "completed", creditedMinutes: 90 }]}
        selectedTaskId="today-math"
        timerActive={false}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onContinue={onContinue}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /seguir trabajando/i }));
    expect(onContinue).toHaveBeenCalledWith("today-math");
  });
});
