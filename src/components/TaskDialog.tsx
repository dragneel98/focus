import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { estimateMinutesFromHours } from "../domain/taskRules";
import type { TaskInput, TaskInstance } from "../domain/types";

interface TaskDialogProps {
  task: TaskInstance | null;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
}

const colors = [
  { key: "graphite", label: "Grafito", className: "task-color-graphite" },
  { key: "blue", label: "Azul", className: "task-color-blue" },
  { key: "terracotta", label: "Terracota", className: "task-color-terracotta" },
  { key: "sage", label: "Salvia", className: "task-color-sage" },
  { key: "violet", label: "Violeta", className: "task-color-violet" },
  { key: "rose", label: "Rosa", className: "task-color-rose" },
];

export function TaskDialog({ task, onClose, onSave }: TaskDialogProps) {
  const [title, setTitle] = useState("");
  const [hours, setHours] = useState("1");
  const [colorKey, setColorKey] = useState("graphite");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setHours(task ? String(task.estimateMinutes / 60) : "1");
    setColorKey(task?.colorKey ?? "graphite");
    setError("");
  }, [task]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const estimateMinutes = estimateMinutesFromHours(Number(hours));
      setSaving(true);
      await onSave({ title: title.trim(), estimateMinutes, colorKey });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la tarea.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{task ? "TAREA DIARIA" : "NUEVA RUTINA"}</p>
            <h2 id="task-dialog-title">{task ? "Editar tarea" : "Agregar tarea"}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="task-title">Nombre de la tarea</label>
          <input
            id="task-title"
            className="text-input"
            maxLength={80}
            autoFocus
            placeholder="Por ejemplo: Estudiar matemática"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
          />

          <div className="field-row">
            <div className="field-grow">
              <label className="field-label" htmlFor="task-estimate">Tiempo por día</label>
              <div className="input-with-suffix">
                <input
                  id="task-estimate"
                  className="text-input"
                  type="number"
                  min="0.25"
                  max="24"
                  step="0.25"
                  value={hours}
                  onChange={(event) => setHours(event.currentTarget.value)}
                  required
                />
                <span>horas</span>
              </div>
            </div>
            <div className="field-grow">
              <span className="field-label">Repetición</span>
              <div className="repeat-chip"><span className="repeat-dot" />Todos los días</div>
            </div>
          </div>

          <fieldset className="color-fieldset">
            <legend className="field-label">Color para las métricas</legend>
            <div className="color-options">
              {colors.map((color) => (
                <label className="color-option" key={color.key} title={color.label}>
                  <input
                    type="radio"
                    name="task-color"
                    value={color.key}
                    checked={colorKey === color.key}
                    onChange={() => setColorKey(color.key)}
                    aria-label={`Color ${color.label.toLowerCase()}`}
                  />
                  <span className={`task-color ${color.className}`} aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>

          {task ? <p className="dialog-note">El color se actualiza en las tareas existentes. El nombre y el tiempo se aplican a próximas jornadas.</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>Cancelar</button>
            <button className="button button-primary" type="submit" disabled={saving || !title.trim()}>
              {saving ? "Guardando…" : task ? "Guardar cambios" : "Crear tarea"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

