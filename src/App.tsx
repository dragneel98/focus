import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Activity, BarChart3, CalendarDays, Check, Settings2, X } from "lucide-react";
import { MetricsView } from "./components/MetricsView";
import { SettingsView } from "./components/SettingsView";
import { TaskDialog } from "./components/TaskDialog";
import { TaskList } from "./components/TaskList";
import { TimerPanel } from "./components/TimerPanel";
import { formatMinutes, getLocalDateKey } from "./domain/taskRules";
import type { TaskInput } from "./domain/types";
import type { AppView } from "./state/useProductivityStore";
import { useProductivityStore } from "./state/useProductivityStore";

const navItems: Array<{ id: AppView; label: string; icon: typeof CalendarDays }> = [
  { id: "today", label: "Hoy", icon: CalendarDays },
  { id: "statistics", label: "Estadísticas", icon: BarChart3 },
  { id: "settings", label: "Preferencias", icon: Settings2 },
];

function formatToday(date: Date): string {
  const value = date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return value.charAt(0).toLocaleUpperCase("es-AR") + value.slice(1);
}

function CompletionOverlay({ title, visible, onClose }: { title: string; visible: boolean; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="completion-overlay"
          role="status"
          aria-live="polite"
          initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.32, ease: "easeOut" }}
        >
          <div className="completion-mark"><Check size={21} strokeWidth={2.5} /></div>
          <div>
            <p className="eyebrow">CICLO COMPLETADO</p>
            <strong>{title}</strong>
            <span>El tiempo quedó registrado en tus métricas.</span>
          </div>
          <button className="icon-button completion-close" onClick={onClose} type="button" aria-label="Cerrar aviso">
            <X size={16} />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Toast({ text, tone, onDismiss }: { text: string; tone: "success" | "error" | "neutral"; onDismiss: () => void }) {
  return (
    <div className={`toast toast-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="toast-mark" aria-hidden="true" />
      <span>{text}</span>
      <button className="icon-button" type="button" aria-label="Descartar aviso" onClick={onDismiss}><X size={15} /></button>
    </div>
  );
}

function App() {
  const view = useProductivityStore((state) => state.view);
  const period = useProductivityStore((state) => state.period);
  const today = useProductivityStore((state) => state.today);
  const tasks = useProductivityStore((state) => state.tasks);
  const selectedTaskId = useProductivityStore((state) => state.selectedTaskId);
  const settings = useProductivityStore((state) => state.settings);
  const timer = useProductivityStore((state) => state.timer);
  const nowMs = useProductivityStore((state) => state.nowMs);
  const metrics = useProductivityStore((state) => state.metrics);
  const loading = useProductivityStore((state) => state.loading);
  const toast = useProductivityStore((state) => state.toast);
  const load = useProductivityStore((state) => state.load);
  const setView = useProductivityStore((state) => state.setView);
  const selectTask = useProductivityStore((state) => state.selectTask);
  const setPeriod = useProductivityStore((state) => state.setPeriod);
  const addTask = useProductivityStore((state) => state.addTask);
  const editTask = useProductivityStore((state) => state.editTask);
  const archiveTask = useProductivityStore((state) => state.archiveTask);
  const saveSettings = useProductivityStore((state) => state.saveSettings);
  const beginFocus = useProductivityStore((state) => state.beginFocus);
  const beginBreak = useProductivityStore((state) => state.beginBreak);
  const interrupt = useProductivityStore((state) => state.interrupt);
  const tick = useProductivityStore((state) => state.tick);
  const dismissToast = useProductivityStore((state) => state.dismissToast);
  const reportError = useProductivityStore((state) => state.reportError);

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("productivity-theme") === "dark");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<(typeof tasks)[number] | null>(null);
  const [completedTaskTitle, setCompletedTaskTitle] = useState("");
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const timerTask = tasks.find((task) => task.id === timer.taskInstanceId) ?? selectedTask;
  const todayText = useMemo(() => formatToday(new Date()), [today]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("productivity-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    let lastWallClock = Date.now();
    let lastMonotonic = performance.now();
    let dateRefreshInFlight = false;
    const interval = window.setInterval(() => {
      const wallClock = Date.now();
      const monotonic = performance.now();
      const wallDelta = wallClock - lastWallClock;
      const monotonicDelta = monotonic - lastMonotonic;
      lastWallClock = wallClock;
      lastMonotonic = monotonic;
      const state = useProductivityStore.getState();

      if (wallDelta - monotonicDelta > 5000 && state.timer.mode === "focus") {
        void state.interrupt();
        return;
      }
      void tick();
      if (!dateRefreshInFlight && getLocalDateKey(new Date(wallClock)) !== state.today) {
        dateRefreshInFlight = true;
        void state.refreshTasks().finally(() => { dateRefreshInFlight = false; });
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [tick]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(dismissToast, 4200);
    return () => window.clearTimeout(timeout);
  }, [toast, dismissToast]);

  useEffect(() => {
    function onTaskCompleted(event: Event) {
      const detail = (event as CustomEvent<{ taskId: string }>).detail;
      const task = useProductivityStore.getState().tasks.find((item) => item.id === detail?.taskId);
      setCompletedTaskTitle(task?.title ?? "Tarea diaria");
      window.setTimeout(() => setCompletedTaskTitle(""), 2400);
    }
    window.addEventListener("productivity:task-completed", onTaskCompleted);
    return () => window.removeEventListener("productivity:task-completed", onTaskCompleted);
  }, []);

  async function handleSaveTask(input: TaskInput) {
    if (editingTask) await editTask(editingTask, input);
    else await addTask(input);
  }

  async function handleArchiveTask(task: (typeof tasks)[number]) {
    if (!window.confirm(`¿Querés archivar “${task.title}”? Ya no se repetirá en los próximos días.`)) return;
    try {
      await archiveTask(task);
    } catch (error) {
      reportError(error instanceof Error ? error.message : "No se pudo archivar la tarea.");
    }
  }

  const activeTimer = timer.mode !== "idle";
  const taskCount = tasks.length;
  const completedCount = tasks.filter((task) => task.status === "completed").length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <div><strong>FOCO</strong><small>Productividad consciente</small></div>
        </div>

        <div className="sidebar-section-label">ESPACIO PERSONAL</div>
        <nav className="primary-nav" aria-label="Navegación principal">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={view === item.id ? "nav-item nav-item-active" : "nav-item"}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setView(item.id)}
              >
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
                {item.id === "today" ? <span className="nav-count">{taskCount}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        {activeTimer ? (
          <button className="sidebar-timer-card" type="button" onClick={() => setView("today")}>
            <span className="mini-pulse" />
            <span><strong>{timer.mode === "focus" ? "Enfoque activo" : "Descanso activo"}</strong><small>{timerTask?.title ?? "Temporizador"}</small></span>
            <span className="sidebar-timer-time">{timer.endsAtMs ? formatMinutes(Math.ceil((timer.endsAtMs - nowMs) / 60_000)) : ""}</span>
          </button>
        ) : null}
        <div className="sidebar-footer">
          <div className="local-badge"><span />DATOS LOCALES</div>
          {/* <button className="help-link" type="button" onClick={() => setView("settings")}>
            <CircleHelp size={16} /> Ayuda y preferencias
          </button> */}
          <p>Hecho para avanzar<br />sin apurarte.</p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>FOCO</span><span className="breadcrumb-divider">/</span><strong>{navItems.find((item) => item.id === view)?.label}</strong></div>
          <div className="topbar-right">
            {activeTimer ? <span className="active-indicator"><span className="mini-pulse" />{timer.mode === "focus" ? "Enfoque" : "Descanso"}</span> : null}
            <span className="topbar-date">{todayText}</span>
          </div>
        </header>

        {loading ? (
          <div className="loading-state" role="status"><span className="loading-dots" /> Preparando tu espacio…</div>
        ) : (
          <div className="main-content">
            {view === "today" ? (
              <div className="view-stack">
                <div className="page-heading today-heading">
                  <div>
                    <p className="eyebrow">{todayText.toLocaleUpperCase("es-AR")}</p>
                    <h1>Tu jornada, <span className="heading-light">a tu manera.</span></h1>
                    <p className="page-description">Elegí una tarea. El resto es estar presente en el próximo ciclo.</p>
                  </div>
                  <div className="day-progress">
                    <span className="day-progress-label">AVANCE DEL DÍA</span>
                    <strong>{completedCount}<span> / {taskCount}</span></strong>
                    <div className="day-progress-track"><span style={{ width: taskCount ? `${(completedCount / taskCount) * 100}%` : "0%" }} /></div>
                  </div>
                </div>

                <div className="today-grid">
                  <TaskList
                    tasks={tasks}
                    selectedTaskId={selectedTaskId}
                    timerActive={activeTimer}
                    onSelect={selectTask}
                    onAdd={() => { setEditingTask(null); setTaskDialogOpen(true); }}
                    onEdit={(task) => { setEditingTask(task); setTaskDialogOpen(true); }}
                    onArchive={(task) => void handleArchiveTask(task)}
                    onContinue={(taskId) => { selectTask(taskId); void beginFocus(); }}
                  />
                  <div className="today-side">
                    <TimerPanel
                      timer={timer}
                      nowMs={nowMs}
                      selectedTask={timerTask}
                      onStartFocus={() => void beginFocus()}
                      onStartBreak={() => void beginBreak()}
                      onInterrupt={() => void interrupt()}
                    />
                    <div className="focus-summary panel">
                      <span className="summary-icon"><Activity size={17} /></span>
                      <div><strong>{formatMinutes(metrics.creditedMinutes)}</strong><span>acreditados en este período</span></div>
                      <button className="text-link" type="button" onClick={() => setView("statistics")}>Ver métricas</button>
                    </div>
                  </div>
                </div>
                <p className="page-footnote">El progreso se registra al terminar un ciclo de enfoque. Las pausas y los ciclos interrumpidos no suman.</p>
              </div>
            ) : null}

            {view === "statistics" ? (
              <MetricsView period={period} today={today} metrics={metrics} onPeriodChange={(value) => void setPeriod(value)} />
            ) : null}

            {view === "settings" ? (
              <SettingsView
                settings={settings}
                darkMode={darkMode}
                onSave={saveSettings}
                onToggleTheme={() => setDarkMode((value) => !value)}
              />
            ) : null}
          </div>
        )}
      </main>

      {taskDialogOpen ? (
        <TaskDialog
          task={editingTask}
          onClose={() => { setTaskDialogOpen(false); setEditingTask(null); }}
          onSave={handleSaveTask}
        />
      ) : null}

      {toast ? <Toast text={toast.text} tone={toast.tone} onDismiss={dismissToast} /> : null}
      <CompletionOverlay title={completedTaskTitle} visible={Boolean(completedTaskTitle)} onClose={() => setCompletedTaskTitle("")} />
    </div>
  );
}

export default App;

