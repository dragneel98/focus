import { create } from "zustand";
import {
  archiveTaskTemplate,
  completeBreak,
  completeFocus,
  createTask,
  ensureDailyTasks,
  getMetricsData,
  getSettings,
  getTimerSnapshot,
  interruptTimer,
  startBreak,
  startFocus,
  updateSettings,
  updateTaskTemplate,
} from "../data/productivityApi";
import { notifyCycleFinished } from "../data/notifications";
import { playTimerEndSound, prepareTimerEndSound } from "../data/timerSound";
import { getPeriodBounds, summarizeProductivity, type MetricsPeriod, type ProductivitySummary } from "../domain/metrics";
import { formatMinutes, getLocalDateKey } from "../domain/taskRules";
import type { AppSettings, TaskInput, TaskInstance, TimerSnapshot } from "../domain/types";

export type AppView = "today" | "statistics" | "settings";
export interface ToastMessage { id: number; text: string; tone: "success" | "error" | "neutral" }

const idleTimer: TimerSnapshot = {
  mode: "idle", focusSessionId: null, taskInstanceId: null, startedAtMs: null, endsAtMs: null,
  focusMinutes: 30, breakMinutes: 5,
};

interface ProductivityState {
  view: AppView;
  period: MetricsPeriod;
  today: string;
  tasks: TaskInstance[];
  selectedTaskId: string | null;
  settings: AppSettings;
  timer: TimerSnapshot;
  metrics: ProductivitySummary;
  loading: boolean;
  timerBusy: boolean;
  toast: ToastMessage | null;
  nowMs: number;
  load: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  setView: (view: AppView) => void;
  selectTask: (id: string) => void;
  setPeriod: (period: MetricsPeriod) => Promise<void>;
  addTask: (input: TaskInput) => Promise<void>;
  editTask: (task: TaskInstance, input: TaskInput) => Promise<void>;
  archiveTask: (task: TaskInstance) => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  beginFocus: () => Promise<void>;
  beginBreak: () => Promise<void>;
  interrupt: () => Promise<void>;
  tick: () => Promise<void>;
  dismissToast: () => void;
  reportError: (message: string) => void;
}

const emptyMetrics: ProductivitySummary = { completedTasks: 0, creditedMinutes: 0, completedCycles: 0, series: [] };

function showToast(set: (partial: Partial<ProductivityState>) => void, text: string, tone: ToastMessage["tone"] = "neutral") {
  set({ toast: { id: Date.now(), text, tone } });
}

async function readMetrics(period: MetricsPeriod, anchor: string): Promise<ProductivitySummary> {
  const bounds = getPeriodBounds(period, anchor);
  const data = await getMetricsData(bounds.start, bounds.endExclusive);
  return summarizeProductivity(data.sessions, data.tasks, bounds);
}

export const useProductivityStore = create<ProductivityState>((set, get) => ({
  view: "today",
  period: "week",
  today: getLocalDateKey(),
  tasks: [],
  selectedTaskId: null,
  settings: { focusMinutes: 30, breakMinutes: 5 },
  timer: idleTimer,
  metrics: emptyMetrics,
  loading: true,
  timerBusy: false,
  toast: null,
  nowMs: Date.now(),

  load: async () => {
    set({ loading: true });
    try {
      const today = getLocalDateKey();
      const tasks = await ensureDailyTasks(today);
      const [settings, timer] = await Promise.all([getSettings(), getTimerSnapshot()]);
      const metrics = await readMetrics(get().period, today);
      const selectedTaskId = tasks.find((task) => task.status !== "completed")?.id ?? null;
      set({ today, tasks, settings, timer, metrics, selectedTaskId, loading: false });
    } catch (error) {
      set({ loading: false });
      showToast(set, error instanceof Error ? error.message : "No se pudo cargar la jornada.", "error");
    }
  },

  refreshTasks: async () => {
    const today = getLocalDateKey();
    const tasks = await ensureDailyTasks(today);
    const selectedTask = tasks.find((task) => task.id === get().selectedTaskId);
    const selectedTaskId = selectedTask && selectedTask.status !== "completed"
      ? selectedTask.id
      : tasks.find((task) => task.status !== "completed")?.id ?? null;
    set({ today, tasks, selectedTaskId });
  },

  setView: (view) => set({ view }),
  selectTask: (selectedTaskId) => set({ selectedTaskId }),

  setPeriod: async (period) => {
    set({ period });
    try {
      set({ metrics: await readMetrics(period, get().today) });
    } catch (error) {
      showToast(set, error instanceof Error ? error.message : "No se pudieron cargar las métricas.", "error");
    }
  },

  addTask: async (input) => {
    const task = await createTask(input);
    await get().refreshTasks();
    set({ selectedTaskId: task.id, view: "today" });
    showToast(set, "Tarea diaria agregada.", "success");
  },

  editTask: async (task, input) => {
    await updateTaskTemplate(task.templateId, input);
    await get().refreshTasks();
    showToast(set, "El color se actualizó en las tareas existentes; los demás cambios se aplican a próximas jornadas.", "success");
  },

  archiveTask: async (task) => {
    await archiveTaskTemplate(task.templateId);
    await get().refreshTasks();
    if (get().selectedTaskId === task.id) set({ selectedTaskId: null });
    showToast(set, "Tarea archivada.", "neutral");
  },

  saveSettings: async (settings) => {
    const saved = await updateSettings(settings.focusMinutes, settings.breakMinutes);
    set({ settings: saved });
    if (get().timer.mode === "idle") {
      set({ timer: { ...get().timer, focusMinutes: saved.focusMinutes, breakMinutes: saved.breakMinutes } });
    }
    showToast(set, "Preferencias guardadas.", "success");
  },

  beginFocus: async () => {
    prepareTimerEndSound();
    const taskId = get().selectedTaskId;
    if (!taskId) {
      showToast(set, "Elegí una tarea antes de iniciar el enfoque.", "error");
      return;
    }
    try {
      const timer = await startFocus(taskId);
      set({ timer });
      showToast(set, "Enfoque iniciado. Un ciclo completo acredita tiempo a la tarea.", "neutral");
    } catch (error) {
      showToast(set, error instanceof Error ? error.message : "No se pudo iniciar el enfoque.", "error");
    }
  },

  beginBreak: async () => {
    prepareTimerEndSound();
    try {
      set({ timer: await startBreak() });
      showToast(set, "Descanso iniciado.", "neutral");
    } catch (error) {
      showToast(set, error instanceof Error ? error.message : "No se pudo iniciar el descanso.", "error");
    }
  },

  interrupt: async () => {
    const wasBreak = get().timer.mode === "break";
    try {
      set({ timer: await interruptTimer() });
      showToast(set, wasBreak ? "Descanso finalizado." : "Ciclo interrumpido: no se acreditó tiempo.", "neutral");
      await get().refreshTasks();
    } catch (error) {
      showToast(set, error instanceof Error ? error.message : "No se pudo interrumpir el ciclo.", "error");
    }
  },

  tick: async () => {
    const currentTime = Date.now();
    set({ nowMs: currentTime });
    const { timer, timerBusy } = get();
    if (timerBusy || timer.mode === "idle" || !timer.endsAtMs || currentTime < timer.endsAtMs) return;
    set({ timerBusy: true });
    try {
      if (timer.mode === "focus") {
        const result = await completeFocus();
        playTimerEndSound();
        set({ timer: result.timer });
        await get().refreshTasks();
        const task = get().tasks.find((item) => item.id === timer.taskInstanceId);
        const text = result.taskCompleted
          ? `Tarea completada: ${task?.title ?? "¡bien hecho!"}`
          : `Ciclo terminado: ${formatMinutes(result.creditedMinutes)} acreditados.`;
        showToast(set, text, "success");
        await notifyCycleFinished("Enfoque terminado", text);
        if (result.taskCompleted) {
          window.dispatchEvent(new CustomEvent("productivity:task-completed", { detail: { taskId: timer.taskInstanceId } }));
        }
      } else {
        set({ timer: await completeBreak() });
        playTimerEndSound();
        const text = "Terminó el descanso. Cuando quieras, elegí una tarea y seguí.";
        showToast(set, text, "success");
        await notifyCycleFinished("Descanso terminado", text);
      }
      set({ metrics: await readMetrics(get().period, get().today) });
    } catch (error) {
      showToast(set, error instanceof Error ? error.message : "No se pudo cerrar el ciclo.", "error");
      set({ timer: await getTimerSnapshot() });
    } finally {
      set({ timerBusy: false });
    }
  },

  dismissToast: () => set({ toast: null }),
  reportError: (message) => showToast(set, message, "error"),
}));
