export type MetricsPeriod = "day" | "week" | "month";

export interface PeriodBounds {
  start: string;
  endExclusive: string;
}

export interface FocusSessionRecord {
  id: string;
  localDate: string;
  taskId: string;
  taskTitle: string;
  colorKey: string;
  status: "completed" | "interrupted";
  creditedMinutes: number;
}

export interface TaskInstanceRecord {
  id: string;
  localDate: string;
  completedAtLocalDate?: string | null;
  status: "pending" | "in_progress" | "completed" | "overdue";
}

export interface ProductivitySummary {
  completedTasks: number;
  creditedMinutes: number;
  completedCycles: number;
  series: Array<{ date: string; taskId: string; title: string; colorKey: string; minutes: number }>;
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) throw new RangeError(`Invalid local date: ${dateKey}`);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

export function getPeriodBounds(period: MetricsPeriod, anchorDate: string): PeriodBounds {
  const anchor = parseDateKey(anchorDate);
  if (period === "day") {
    return { start: anchorDate, endExclusive: toDateKey(addDays(anchor, 1)) };
  }

  if (period === "week") {
    const mondayOffset = (anchor.getUTCDay() + 6) % 7;
    const start = addDays(anchor, -mondayOffset);
    return { start: toDateKey(start), endExclusive: toDateKey(addDays(start, 7)) };
  }

  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1));
  return { start: toDateKey(start), endExclusive: toDateKey(end) };
}

function isWithin(date: string, bounds: PeriodBounds): boolean {
  return date >= bounds.start && date < bounds.endExclusive;
}

export function summarizeProductivity(
  sessions: FocusSessionRecord[],
  tasks: TaskInstanceRecord[],
  bounds: PeriodBounds,
): ProductivitySummary {
  const completedSessions = sessions.filter(
    (session) => session.status === "completed" && session.creditedMinutes > 0 && isWithin(session.localDate, bounds),
  );
  const seriesByKey = new Map<string, ProductivitySummary["series"][number]>();

  for (const session of completedSessions) {
    const key = `${session.localDate}:${session.taskId}`;
    const row = seriesByKey.get(key);
    if (row) {
      row.minutes += session.creditedMinutes;
    } else {
      seriesByKey.set(key, {
        date: session.localDate,
        taskId: session.taskId,
        title: session.taskTitle,
        colorKey: session.colorKey,
        minutes: session.creditedMinutes,
      });
    }
  }

  return {
    completedTasks: tasks.filter((task) => task.status === "completed" && isWithin(task.completedAtLocalDate ?? task.localDate, bounds)).length,
    creditedMinutes: completedSessions.reduce((total, session) => total + session.creditedMinutes, 0),
    completedCycles: completedSessions.length,
    series: [...seriesByKey.values()].sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title)),
  };
}
