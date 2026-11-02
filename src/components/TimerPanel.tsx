import { Coffee, Pause, Play, Sparkles } from "lucide-react";
import type { TaskInstance, TimerSnapshot } from "../domain/types";

interface TimerPanelProps {
  timer: TimerSnapshot;
  nowMs: number;
  selectedTask: TaskInstance | null;
  onStartFocus: () => void;
  onStartBreak: () => void;
  onInterrupt: () => void;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function TimerPanel({ timer, nowMs, selectedTask, onStartFocus, onStartBreak, onInterrupt }: TimerPanelProps) {
  const active = timer.mode !== "idle";
  const duration = timer.mode === "break" ? timer.breakMinutes : timer.focusMinutes;
  const remainingMs = timer.endsAtMs ? Math.max(0, timer.endsAtMs - nowMs) : duration * 60_000;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const progress = active && duration > 0 ? Math.max(0, Math.min(1, 1 - remainingMs / (duration * 60_000))) : 0;
  const circumference = 2 * Math.PI * 92;
  const strokeOffset = circumference * (1 - progress);
  const title = timer.mode === "break" ? "Tiempo para respirar" : timer.mode === "focus" ? "Enfoque en curso" : "Un paso a la vez";
  const helper = timer.mode === "break"
    ? "Soltá los hombros. Volvemos en un rato."
    : timer.mode === "focus"
      ? selectedTask?.title ?? "Tu tarea seleccionada"
      : selectedTask
        ? `Si completás el ciclo, sumás tiempo a ${selectedTask.title}.`
        : "Elegí una tarea de tu lista para empezar.";

  return (
    <section className={`timer-panel panel timer-mode-${timer.mode}`} aria-labelledby="timer-title">
      <div className="timer-header">
        <div>
          <p className="eyebrow">{timer.mode === "break" ? "PAUSA" : "POMODORO"}</p>
          <h2 id="timer-title">{title}</h2>
        </div>
        <span className={`timer-state-pill ${active ? "timer-state-active" : ""}`}>
          <span className="status-dot" />
          {timer.mode === "focus" ? "En marcha" : timer.mode === "break" ? "Descanso" : "Listo"}
        </span>
      </div>

      <div className="timer-face" aria-label={`Tiempo restante ${formatClock(remainingSeconds)}`}>
        <svg className="timer-ring" viewBox="0 0 220 220" aria-hidden="true">
          <circle className="timer-ring-track" cx="110" cy="110" r="92" />
          <circle
            className="timer-ring-progress"
            cx="110"
            cy="110"
            r="92"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
          />
        </svg>
        <div className="timer-digits-wrap">
          <span className="timer-mode-label">{timer.mode === "break" ? "DESCANSO" : "FOCO"}</span>
          <strong className="timer-digits" aria-live="off">{formatClock(remainingSeconds)}</strong>
          <span className="timer-caption">{timer.mode === "idle" ? `${timer.focusMinutes} min por ciclo` : helper}</span>
        </div>
      </div>

      {timer.mode === "idle" ? (
        <>
          <p className="timer-helper">{helper}</p>
          <div className="timer-actions">
            <button className="button button-primary timer-start" type="button" onClick={onStartFocus} disabled={!selectedTask}>
              <Play size={16} fill="currentColor" aria-hidden="true" />
              Iniciar enfoque
            </button>
            <button className="button button-quiet" type="button" onClick={onStartBreak}>
              <Coffee size={16} aria-hidden="true" />
              Descanso
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="timer-helper">{helper}</p>
          <div className="timer-actions">
            <button className="button button-secondary timer-start" type="button" onClick={onInterrupt}>
              <Pause size={16} aria-hidden="true" />
              {timer.mode === "break" ? "Omitir descanso" : "Interrumpir ciclo"}
            </button>
          </div>
        </>
      )}

      <div className="timer-note">
        <Sparkles size={14} aria-hidden="true" />
        <span>Solo los ciclos de enfoque terminados acreditan tiempo.</span>
      </div>
    </section>
  );
}

