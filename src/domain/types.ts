export type TaskStatus = "pending" | "in_progress" | "completed" | "overdue";
export type TimerMode = "idle" | "focus" | "break";

export interface TaskInstance {
  id: string;
  templateId: string;
  localDate: string;
  timezoneId: string;
  title: string;
  estimateMinutes: number;
  creditedMinutes: number;
  colorKey: string;
  status: TaskStatus;
  completedAtLocalDate: string | null;
}

export interface AppSettings {
  focusMinutes: number;
  breakMinutes: number;
}

export interface TimerSnapshot {
  mode: TimerMode;
  focusSessionId: string | null;
  taskInstanceId: string | null;
  startedAtMs: number | null;
  endsAtMs: number | null;
  focusMinutes: number;
  breakMinutes: number;
}

export interface CompletedCycle {
  sessionId: string;
  creditedMinutes: number;
  taskCompleted: boolean;
  timer: TimerSnapshot;
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

export interface MetricsData {
  sessions: FocusSessionRecord[];
  tasks: TaskInstance[];
}

export interface TaskInput {
  title: string;
  estimateMinutes: number;
  colorKey: string;
}

