import { useEffect, useState, type FormEvent } from "react";
import { BellRing, Database, Moon, Sun } from "lucide-react";
import type { AppSettings } from "../domain/types";

interface SettingsViewProps {
  settings: AppSettings;
  darkMode: boolean;
  onSave: (settings: AppSettings) => Promise<void>;
  onToggleTheme: () => void;
}

export function SettingsView({ settings, darkMode, onSave, onToggleTheme }: SettingsViewProps) {
  const [focusMinutes, setFocusMinutes] = useState(String(settings.focusMinutes));
  const [breakMinutes, setBreakMinutes] = useState(String(settings.breakMinutes));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFocusMinutes(String(settings.focusMinutes));
    setBreakMinutes(String(settings.breakMinutes));
  }, [settings]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave({ focusMinutes: Number(focusMinutes), breakMinutes: Number(breakMinutes) });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="view-stack settings-view">
      <div className="page-heading">
        <div>
          <p className="eyebrow">A TU RITMO</p>
          <h1>Preferencias</h1>
          <p className="page-description">Ajustá tus ciclos sin perder de vista lo importante: empezar.</p>
        </div>
      </div>

      <section className="settings-panel panel" aria-labelledby="pomodoro-settings-title">
        <div className="settings-section-heading">
          <div className="settings-icon"><BellRing size={18} /></div>
          <div>
            <h2 id="pomodoro-settings-title">Ciclos de enfoque</h2>
            <p>El tiempo se acredita cuando termina un ciclo completo.</p>
          </div>
        </div>
        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="settings-grid">
            <label className="settings-field" htmlFor="focus-duration">
              <span>Enfoque</span>
              <div className="input-with-suffix">
                <input id="focus-duration" className="text-input" type="number" min="1" max="120" step="1" value={focusMinutes} onChange={(event) => setFocusMinutes(event.currentTarget.value)} />
                <span>minutos</span>
              </div>
              <small>Entre 1 y 120 minutos</small>
            </label>
            <label className="settings-field" htmlFor="break-duration">
              <span>Descanso</span>
              <div className="input-with-suffix">
                <input id="break-duration" className="text-input" type="number" min="1" max="30" step="1" value={breakMinutes} onChange={(event) => setBreakMinutes(event.currentTarget.value)} />
                <span>minutos</span>
              </div>
              <small>Entre 1 y 30 minutos</small>
            </label>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar preferencias"}
          </button>
        </form>
      </section>

      <section className="settings-panel panel" aria-labelledby="appearance-title">
        <div className="settings-section-heading">
          <div className="settings-icon"><Moon size={18} /></div>
          <div>
            <h2 id="appearance-title">Apariencia</h2>
            <p>Una interfaz tranquila, con contraste y sin ruido visual.</p>
          </div>
        </div>
        <div className="preference-row">
          <div>
            <strong>{darkMode ? "Modo oscuro" : "Modo claro"}</strong>
            <span>La preferencia se guarda en este dispositivo.</span>
          </div>
          <button className="button button-secondary theme-toggle" type="button" onClick={onToggleTheme}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            {darkMode ? "Usar modo claro" : "Usar modo oscuro"}
          </button>
        </div>
      </section>

      <section className="settings-panel panel" aria-labelledby="privacy-title">
        <div className="settings-section-heading">
          <div className="settings-icon"><Database size={18} /></div>
          <div>
            <h2 id="privacy-title">Tus datos</h2>
            <p>Las tareas y las sesiones se guardan localmente en este dispositivo.</p>
          </div>
        </div>
        <div className="privacy-note">
          <span className="privacy-indicator" />
          <span>Las notificaciones se solicitan cuando termina un ciclo. Si no las habilitás, vas a ver el aviso dentro de la app.</span>
        </div>
      </section>
    </div>
  );
}

