import { getPeriodBounds, type MetricsPeriod } from "./metrics";

export const TASK_COLORS: Record<string, string> = {
  graphite: "#64748b",
  blue: "#4777f5",
  terracotta: "#c26c4f",
  sage: "#639579",
  violet: "#8b70d5",
  rose: "#ca6b86",
};

export interface MetricSeriesValue {
  date: string;
  taskId: string;
  title: string;
  colorKey: string;
  minutes: number;
}

export interface StackedChartSeries {
  key: string;
  title: string;
  color: string;
}

export interface StackedChartRow extends Record<string, string | number> {
  date: string;
  label: string;
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getDateKeys(start: string, endExclusive: string): string[] {
  const [year, month, day] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const end = endExclusive;
  const keys: string[] = [];
  while (dateKey(date) < end) {
    keys.push(dateKey(date));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return keys;
}

function dayLabel(dateKeyValue: string, period: MetricsPeriod): string {
  if (period === "day") return "Hoy";
  const [year, month, day] = dateKeyValue.split("-").map(Number);
  if (period === "month") return String(day);
  return new Date(year, month - 1, day).toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
}

export function buildStackedChartData(
  period: MetricsPeriod,
  anchorDate: string,
  values: MetricSeriesValue[],
): { rows: StackedChartRow[]; series: StackedChartSeries[] } {
  const bounds = getPeriodBounds(period, anchorDate);
  const taskMap = new Map<string, StackedChartSeries>();
  for (const value of values) {
    if (!taskMap.has(value.taskId)) {
      taskMap.set(value.taskId, {
        key: value.taskId,
        title: value.title,
        color: TASK_COLORS[value.colorKey] ?? TASK_COLORS.graphite,
      });
    }
  }
  const series = [...taskMap.values()].sort((left, right) => left.title.localeCompare(right.title, "es"));
  const rows = getDateKeys(bounds.start, bounds.endExclusive).map((date) => {
    const row: StackedChartRow = { date, label: dayLabel(date, period) };
    for (const item of series) row[item.key] = 0;
    for (const value of values) {
      if (value.date === date) row[value.taskId] = Number(row[value.taskId] ?? 0) + value.minutes;
    }
    return row;
  });
  return { rows, series };
}

