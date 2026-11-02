import { Archive, Check, Clock3, Edit2, Plus, Repeat2 } from "lucide-react";
import { formatMinutes } from "../domain/taskRules";
import type { TaskInstance } from "../domain/types";

interface TaskListProps {
  tasks: TaskInstance[];
  selectedTaskId: string | null;
  timerActive: boolean;
  onSelect: (taskId: string) => void;
  onAdd: () => void;
  onEdit: (task: TaskInstance) => void;
  onArchive: (task: TaskInstance) => void;
  onContinue: (taskId: string) => void;
}

const statusCopy: Record<TaskInstance["status"], string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  overdue: "Vencida",
};

export function TaskList({ tasks, selectedTaskId, timerActive, onSelect, onAdd, onEdit, onArchive, onContinue }: TaskListProps) {
  return (
    <section className="task-panel panel" aria-labelledby="task-list-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PLAN DE HOY</p>
          <h2 id="task-list-title">Tus tareas</h2>
        </div>
        <button className="button button-secondary button-compact" onClick={onAdd} type="button">
          <Plus size={16} aria-hidden="true" />
          <span>Agregar</span>
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Repeat2 size={20} aria-hidden="true" /></div>
          <h3>Tu lista empieza acá</h3>
          <p>Creá una tarea diaria y elegí cuánto tiempo querés dedicarle.</p>
          <button className="button button-primary" onClick={onAdd} type="button">
            <Plus size={16} aria-hidden="true" />
            Crear primera tarea
          </button>
        </div>
      ) : (
        <div className="task-list" role="radiogroup" aria-label="Tareas del día">
          {tasks.map((task) => {
            const selected = task.id === selectedTaskId;
            const disabled = timerActive;
            const progress = Math.min(100, Math.round((task.creditedMinutes / task.estimateMinutes) * 100));
            return (
              <div
                className={`task-row ${selected ? "task-row-selected" : ""} ${task.status === "completed" ? "task-row-completed" : ""}`}
                key={task.id}
              >
                <div
                  className="task-choice"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={disabled}
                  aria-label={`${task.title}, ${statusCopy[task.status]}`}
                  tabIndex={disabled ? -1 : 0}
                  onClick={() => !disabled && onSelect(task.id)}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && !disabled) {
                      event.preventDefault();
                      onSelect(task.id);
                    }
                  }}
                >
                  <span className={`task-color task-color-${task.colorKey}`} aria-hidden="true" />
                  <div className="task-main">
                    <div className="task-title-row">
                      <h3>{task.title}</h3>
                      {task.status === "completed" ? <Check className="completed-check" size={16} aria-label="Completada" /> : null}
                    </div>
                    <div className="task-meta">
                      <span><Clock3 size={13} aria-hidden="true" />{formatMinutes(task.creditedMinutes)} de {formatMinutes(task.estimateMinutes)}{task.status === "completed" ? " objetivo" : ""}</span>
                      <span className={`task-status task-status-${task.status}`}>{statusCopy[task.status]}</span>
                    </div>
                    <div className="progress-track" aria-label={`Progreso de ${task.title}: ${progress}%`}>
                      <span className={`progress-fill progress-${task.colorKey}`} style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <span className={`task-radio-dot ${selected ? "task-radio-dot-selected" : ""}`} aria-hidden="true" />
                </div>
                <div className="task-actions">
                  {task.status === "completed" ? (
                    <button className="button button-quiet task-continue" type="button" onClick={() => onContinue(task.id)} disabled={timerActive}>
                      Seguir trabajando
                    </button>
                  ) : null}
                  <button className="icon-button" type="button" aria-label={`Editar ${task.title}`} onClick={() => onEdit(task)}>
                    <Edit2 size={15} aria-hidden="true" />
                  </button>
                  <button className="icon-button" type="button" aria-label={`Archivar ${task.title}`} onClick={() => onArchive(task)}>
                    <Archive size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {timerActive ? <p className="panel-footnote">El temporizador está activo. La tarea elegida no se puede cambiar durante este ciclo.</p> : null}
    </section>
  );
}

