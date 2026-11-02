import { invoke, isTauri } from "@tauri-apps/api/core";
import { creditCompletedCycle, getLocalDateKey } from "../domain/taskRules";
import type {
  AppSettings,
  CompletedCycle,
  FocusSessionRecord,
  MetricsData,
  TaskInput,
  TaskInstance,
  TimerSnapshot,
} from "../domain/types";

interface TaskTemplate extends TaskInput {
  id: string;
  archived: boolean;
}

interface StoredSession extends Omit<FocusSessionRecord, "status"> {
  status: "running" | "completed" | "interrupted";
  taskInstanceId: string;
  startedAtMs: number;
  plannedMinutes: number;
}

interface BrowserState {
  templates: TaskTemplate[];
  tasks: TaskInstance[];
  sessions: StoredSession[];
  settings: AppSettings;
  timer: TimerSnapshot;
}

const STORAGE_KEY = "productivity-focus-app.v1";
const DEFAULT_SETTINGS: AppSettings = { focusMinutes: 30, breakMinutes: 5 };
const idleTimer = (): TimerSnapshot => ({
  mode: "idle",
  focusSessionId: null,
  taskInstanceId: null,
  startedAtMs: null,
  endsAtMs: null,
  focusMinutes: DEFAULT_SETTINGS.focusMinutes,
  breakMinutes: DEFAULT_SETTINGS.breakMinutes,
});

let browserStateCache: BrowserState | undefined;

function browserState(): BrowserState {
  if (browserStateCache) return browserStateCache;
  const raw = localStorage.getItem(STORAGE_KEY);
  let state: BrowserState;
  if (raw) {
    try {
      state = JSON.parse(raw) as BrowserState;
    } catch {
      throw new Error("No se pudieron leer los datos locales. Se conservaron sin modificarlos.");
    }
  } else {
    state = { templates: [], tasks: [], sessions: [], settings: DEFAULT_SETTINGS, timer: idleTimer() };
  }

  if (state.timer.mode === "focus" && state.timer.focusSessionId) {
    const session = state.sessions.find((item) => item.id === state.timer.focusSessionId);
    if (session?.status === "running") {
      session.status = "interrupted";
      session.creditedMinutes = 0;
    }
    state.timer = idleTimer();
    persistBrowserState(state);
  } else if (state.timer.mode === "break") {
    state.timer = idleTimer();
    persistBrowserState(state);
  }
  browserStateCache = state;
  return state;
}

function persistBrowserState(state = browserState()): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
}

function newId(): string {
  return crypto.randomUUID();
}

function makeInstance(template: TaskTemplate, localDate: string, timezoneId: string): TaskInstance {
  return {
    id: newId(),
    templateId: template.id,
    localDate,
    timezoneId,
    title: template.title,
    estimateMinutes: template.estimateMinutes,
    creditedMinutes: 0,
    colorKey: template.colorKey,
    status: "pending",
    completedAtLocalDate: null,
  };
}

function ensureBrowserDailyTasks(localDate: string, timezoneId: string): TaskInstance[] {
  const state = browserState();
  for (const task of state.tasks) {
    if (task.localDate < localDate && (task.status === "pending" || task.status === "in_progress")) {
      task.status = "overdue";
    }
  }
  for (const template of state.templates.filter((item) => !item.archived)) {
    if (!state.tasks.some((task) => task.templateId === template.id && task.localDate === localDate)) {
      state.tasks.push(makeInstance(template, localDate, timezoneId));
    }
  }
  persistBrowserState(state);
  return state.tasks.filter((task) => task.localDate === localDate).sort((a, b) => a.title.localeCompare(b.title));
}

function now(): number {
  return Date.now();
}

function idle(state: BrowserState): void {
  state.timer = { ...state.timer, ...idleTimer(), focusMinutes: state.settings.focusMinutes, breakMinutes: state.settings.breakMinutes };
}

export async function ensureDailyTasks(
  localDate = getLocalDateKey(),
  timezoneId = currentTimeZone(),
): Promise<TaskInstance[]> {
  if (isTauri()) return invoke("ensure_daily_tasks", { localDate, timezoneId });
  return ensureBrowserDailyTasks(localDate, timezoneId);
}

export async function createTask(input: TaskInput): Promise<TaskInstance> {
  const localDate = getLocalDateKey();
  const timezoneId = currentTimeZone();
  if (isTauri()) return invoke("create_task", { ...input, localDate, timezoneId });

  const state = browserState();
  const title = input.title.trim();
  if (!title || title.length > 80) throw new Error("El nombre debe tener entre 1 y 80 caracteres.");
  if (!Number.isInteger(input.estimateMinutes) || input.estimateMinutes < 1 || input.estimateMinutes > 1440) {
    throw new Error("La estimación debe estar entre 1 minuto y 24 horas.");
  }
  const template: TaskTemplate = { ...input, title, id: newId(), archived: false };
  state.templates.push(template);
  const instance = makeInstance(template, localDate, timezoneId);
  state.tasks.push(instance);
  persistBrowserState(state);
  return instance;
}

export async function updateTaskTemplate(templateId: string, input: TaskInput): Promise<void> {
  if (isTauri()) return invoke("update_task_template", { templateId, ...input });
  const state = browserState();
  const template = state.templates.find((item) => item.id === templateId && !item.archived);
  if (!template) throw new Error("No se encontró la tarea para editar.");
  const title = input.title.trim();
  if (!title || title.length > 80) throw new Error("El nombre debe tener entre 1 y 80 caracteres.");
  if (!Number.isInteger(input.estimateMinutes) || input.estimateMinutes < 1 || input.estimateMinutes > 1440) {
    throw new Error("La estimación debe estar entre 1 minuto y 24 horas.");
  }
  Object.assign(template, { ...input, title });
  const latestInstance = state.tasks
    .filter((task) => task.templateId === templateId)
    .sort((left, right) => right.localDate.localeCompare(left.localDate))[0];
  if (latestInstance) latestInstance.colorKey = input.colorKey;
  persistBrowserState(state);
}

export async function archiveTaskTemplate(templateId: string): Promise<void> {
  if (isTauri()) return invoke("archive_task_template", { templateId });
  const state = browserState();
  const template = state.templates.find((item) => item.id === templateId);
  if (template) template.archived = true;
  persistBrowserState(state);
}

export async function getSettings(): Promise<AppSettings> {
  if (isTauri()) return invoke("get_settings");
  return { ...browserState().settings };
}

export async function updateSettings(focusMinutes: number, breakMinutes: number): Promise<AppSettings> {
  if (isTauri()) return invoke("update_settings", { focusMinutes, breakMinutes });
  if (!Number.isInteger(focusMinutes) || focusMinutes < 1 || focusMinutes > 120) {
    throw new Error("El enfoque debe durar entre 1 y 120 minutos.");
  }
  if (!Number.isInteger(breakMinutes) || breakMinutes < 1 || breakMinutes > 30) {
    throw new Error("El descanso debe durar entre 1 y 30 minutos.");
  }
  const state = browserState();
  state.settings = { focusMinutes, breakMinutes };
  if (state.timer.mode === "idle") {
    state.timer.focusMinutes = focusMinutes;
    state.timer.breakMinutes = breakMinutes;
  }
  persistBrowserState(state);
  return { ...state.settings };
}

export async function getTimerSnapshot(): Promise<TimerSnapshot> {
  if (isTauri()) return invoke("get_timer_snapshot");
  return { ...browserState().timer };
}

export async function startFocus(taskInstanceId: string): Promise<TimerSnapshot> {
  if (isTauri()) return invoke("start_focus", { taskInstanceId });
  const state = browserState();
  if (state.timer.mode !== "idle") throw new Error("Ya hay un temporizador activo.");
  const task = state.tasks.find((item) => item.id === taskInstanceId);
  if (!task) throw new Error("Elegí una tarea antes de iniciar el enfoque.");
  const startedAtMs = now();
  const sessionId = newId();
  const timer: TimerSnapshot = {
    mode: "focus",
    focusSessionId: sessionId,
    taskInstanceId,
    startedAtMs,
    endsAtMs: startedAtMs + state.settings.focusMinutes * 60_000,
    focusMinutes: state.settings.focusMinutes,
    breakMinutes: state.settings.breakMinutes,
  };
  state.sessions.push({
    id: sessionId,
    localDate: task.localDate,
    taskId: task.templateId,
    taskTitle: task.title,
    colorKey: task.colorKey,
    status: "running",
    creditedMinutes: 0,
    taskInstanceId,
    startedAtMs,
    plannedMinutes: state.settings.focusMinutes,
  });
  if (task.status !== "completed") task.status = "in_progress";
  state.timer = timer;
  persistBrowserState(state);
  return { ...timer };
}

export async function startBreak(): Promise<TimerSnapshot> {
  if (isTauri()) return invoke("start_break");
  const state = browserState();
  if (state.timer.mode !== "idle") throw new Error("Primero terminá o interrumpí el temporizador actual.");
  const startedAtMs = now();
  state.timer = {
    mode: "break",
    focusSessionId: null,
    taskInstanceId: null,
    startedAtMs,
    endsAtMs: startedAtMs + state.settings.breakMinutes * 60_000,
    focusMinutes: state.settings.focusMinutes,
    breakMinutes: state.settings.breakMinutes,
  };
  persistBrowserState(state);
  return { ...state.timer };
}

export async function completeFocus(): Promise<CompletedCycle> {
  if (isTauri()) return invoke("complete_focus", { completedLocalDate: getLocalDateKey() });
  const state = browserState();
  const timer = state.timer;
  if (timer.mode !== "focus" || !timer.focusSessionId || !timer.taskInstanceId || !timer.endsAtMs) {
    throw new Error("No hay un ciclo de enfoque para completar.");
  }
  const completedAt = now();
  if (completedAt < timer.endsAtMs) throw new Error("El ciclo de enfoque todavía no terminó.");
  const session = state.sessions.find((item) => item.id === timer.focusSessionId);
  const task = state.tasks.find((item) => item.id === timer.taskInstanceId);
  if (!session || !task) throw new Error("No se encontró el ciclo o la tarea activa.");
  const credit = creditCompletedCycle(task.estimateMinutes, task.creditedMinutes, timer.focusMinutes, true);
  const creditedMinutes = credit.creditedMinutes - task.creditedMinutes;
  session.status = "completed";
  session.creditedMinutes = creditedMinutes;
  task.creditedMinutes = credit.creditedMinutes;
  task.status = credit.isComplete ? "completed" : "in_progress";
  task.completedAtLocalDate = credit.isComplete ? getLocalDateKey() : null;
  idle(state);
  persistBrowserState(state);
  return { sessionId: session.id, creditedMinutes, taskCompleted: credit.isComplete, timer: { ...state.timer } };
}

export async function completeBreak(): Promise<TimerSnapshot> {
  if (isTauri()) return invoke("complete_break");
  const state = browserState();
  if (state.timer.mode !== "break") throw new Error("No hay un descanso activo.");
  if (now() < (state.timer.endsAtMs ?? Number.POSITIVE_INFINITY)) throw new Error("El descanso todavía no terminó.");
  idle(state);
  persistBrowserState(state);
  return { ...state.timer };
}

export async function interruptTimer(): Promise<TimerSnapshot> {
  if (isTauri()) return invoke("interrupt_timer");
  const state = browserState();
  if (state.timer.mode === "focus" && state.timer.focusSessionId) {
    const session = state.sessions.find((item) => item.id === state.timer.focusSessionId);
    if (session?.status === "running") session.status = "interrupted";
    const task = session && state.tasks.find((item) => item.id === session.taskInstanceId);
    if (task?.creditedMinutes === 0) task.status = "pending";
  }
  idle(state);
  persistBrowserState(state);
  return { ...state.timer };
}

export async function getMetricsData(start: string, endExclusive: string): Promise<MetricsData> {
  if (isTauri()) return invoke("get_metrics_data", { start, endExclusive });
  const state = browserState();
  return {
    sessions: state.sessions.filter((session) => session.status !== "running" && session.localDate >= start && session.localDate < endExclusive)
      .map(({ id, localDate, taskId, taskTitle, colorKey, status, creditedMinutes }) => ({
        id, localDate, taskId, taskTitle, colorKey, status: status as FocusSessionRecord["status"], creditedMinutes,
      })),
    tasks: state.tasks.filter((task) =>
      (task.localDate >= start && task.localDate < endExclusive)
      || (task.completedAtLocalDate !== null && task.completedAtLocalDate >= start && task.completedAtLocalDate < endExclusive)),
  };
}

export function recoverTimerAfterSuspend(): void {
  if (isTauri()) {
    void interruptTimer();
    return;
  }
  const state = browserState();
  if (state.timer.mode !== "focus" || !state.timer.focusSessionId) return;
  const session = state.sessions.find((item) => item.id === state.timer.focusSessionId);
  if (session?.status === "running") session.status = "interrupted";
  const task = session && state.tasks.find((item) => item.id === session.taskInstanceId);
  if (task?.creditedMinutes === 0) task.status = "pending";
  idle(state);
  persistBrowserState(state);
}

