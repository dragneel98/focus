use rusqlite::{params, Connection, Transaction};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use tauri::{Manager, State};

const INITIAL_MIGRATION: &str = include_str!("../migrations/001_initial.sql");
const TASK_COLORS: [&str; 6] = ["graphite", "blue", "terracotta", "sage", "violet", "rose"];
type CommandResult<T> = Result<T, String>;

struct AppState { db: Mutex<Connection> }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskInstance {
    id: String, template_id: String, local_date: String, timezone_id: String,
    title: String, estimate_minutes: i64, credited_minutes: i64, color_key: String,
    status: String, completed_at_local_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings { focus_minutes: i64, break_minutes: i64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimerSnapshot {
    mode: String, focus_session_id: Option<String>, task_instance_id: Option<String>,
    started_at_ms: Option<i64>, ends_at_ms: Option<i64>,
    focus_minutes: i64, break_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FocusSessionRecord {
    id: String, local_date: String, task_id: String, task_title: String,
    color_key: String, status: String, credited_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetricsData { sessions: Vec<FocusSessionRecord>, tasks: Vec<TaskInstance> }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompletedCycle {
    session_id: String, credited_minutes: i64, task_completed: bool, timer: TimerSnapshot,
}

fn now_ms() -> CommandResult<i64> {
    let duration = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|error| format!("No se pudo leer el reloj del sistema: {error}"))?;
    Ok(duration.as_millis() as i64)
}

fn create_database(path: PathBuf) -> CommandResult<Connection> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("No se pudo crear el directorio local: {error}"))?;
    }
    let mut connection = Connection::open(path).map_err(|error| format!("No se pudo abrir la base local: {error}"))?;
    connection.busy_timeout(std::time::Duration::from_secs(5)).map_err(|error| error.to_string())?;
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS schema_migrations (
           version INTEGER PRIMARY KEY NOT NULL,
           applied_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         );",
    ).map_err(|error| format!("No se pudo preparar el esquema local: {error}"))?;
    let applied: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = 1)", [], |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    if !applied {
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        transaction.execute_batch(INITIAL_MIGRATION).map_err(|error| format!("Falló la migración inicial: {error}"))?;
        transaction.execute("INSERT INTO schema_migrations (version) VALUES (1)", [])
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
    }
    Ok(connection)
}

fn lock_db(state: &AppState) -> CommandResult<std::sync::MutexGuard<'_, Connection>> {
    state.db.lock().map_err(|_| "La base local quedó bloqueada; reiniciá la aplicación.".to_string())
}

fn new_id(transaction: &Transaction<'_>) -> CommandResult<String> {
    transaction.query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
        .map_err(|error| error.to_string())
}

fn validate_local_date(value: &str) -> CommandResult<()> {
    let valid = value.len() == 10
        && value.as_bytes().get(4) == Some(&b'-')
        && value.as_bytes().get(7) == Some(&b'-')
        && value.chars().enumerate().all(|(index, ch)| index == 4 || index == 7 || ch.is_ascii_digit());
    if valid { Ok(()) } else { Err("La fecha local no tiene el formato esperado.".into()) }
}

fn validate_color(color_key: &str) -> CommandResult<()> {
    if TASK_COLORS.contains(&color_key) { Ok(()) } else { Err("El color elegido no está disponible.".into()) }
}

fn update_task_template_on_connection(
    connection: &mut Connection, template_id: &str, title: &str, estimate_minutes: i64, color_key: &str,
) -> CommandResult<()> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() || trimmed_title.chars().count() > 80 {
        return Err("El nombre debe tener entre 1 y 80 caracteres.".into());
    }
    if !(1..=24 * 60).contains(&estimate_minutes) {
        return Err("La estimación debe estar entre 1 minuto y 24 horas.".into());
    }
    validate_color(color_key)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let changed = transaction.execute(
        "UPDATE task_templates SET title = ?1, estimate_minutes = ?2, color_key = ?3,
           updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?4 AND archived_at_utc IS NULL",
        params![trimmed_title, estimate_minutes, color_key, template_id],
    ).map_err(|error| error.to_string())?;
    if changed == 0 { return Err("No se encontró la tarea para editar.".into()); }
    transaction.execute(
        "UPDATE task_instances SET color_key = ?1
         WHERE id = (
           SELECT id FROM task_instances WHERE template_id = ?2 ORDER BY local_date DESC LIMIT 1
         )",
        params![color_key, template_id],
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn read_settings(connection: &Connection) -> CommandResult<AppSettings> {
    connection.query_row(
        "SELECT focus_minutes, break_minutes FROM app_settings WHERE id = 1",
        [], |row| Ok(AppSettings { focus_minutes: row.get(0)?, break_minutes: row.get(1)? }),
    ).map_err(|error| error.to_string())
}

fn timer_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TimerSnapshot> {
    Ok(TimerSnapshot {
        mode: row.get(0)?, focus_session_id: row.get(1)?, task_instance_id: row.get(2)?,
        started_at_ms: row.get(3)?, ends_at_ms: row.get(4)?,
        focus_minutes: row.get(5)?, break_minutes: row.get(6)?,
    })
}

fn read_timer(connection: &Connection) -> CommandResult<TimerSnapshot> {
    connection.query_row(
        "SELECT mode, focus_session_id, task_instance_id, started_at_ms, ends_at_ms, focus_minutes, break_minutes
         FROM timer_state WHERE id = 1",
        [], timer_from_row,
    ).map_err(|error| error.to_string())
}

fn task_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskInstance> {
    Ok(TaskInstance {
        id: row.get(0)?, template_id: row.get(1)?, local_date: row.get(2)?, timezone_id: row.get(3)?,
        title: row.get(4)?, estimate_minutes: row.get(5)?, credited_minutes: row.get(6)?,
        color_key: row.get(7)?, status: row.get(8)?, completed_at_local_date: row.get(9)?,
    })
}

fn read_tasks(connection: &Connection, local_date: &str) -> CommandResult<Vec<TaskInstance>> {
    let mut statement = connection.prepare(
        "SELECT id, template_id, local_date, timezone_id, title_snapshot, estimate_minutes,
                credited_minutes, color_key, status, completed_at_local_date
         FROM task_instances WHERE local_date = ?1 ORDER BY created_at_utc, title_snapshot",
    ).map_err(|error| error.to_string())?;
    let rows = statement.query_map([local_date], task_from_row).map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

fn read_task(connection: &Connection, id: &str) -> CommandResult<TaskInstance> {
    connection.query_row(
        "SELECT id, template_id, local_date, timezone_id, title_snapshot, estimate_minutes,
                credited_minutes, color_key, status, completed_at_local_date
         FROM task_instances WHERE id = ?1",
        [id], task_from_row,
    ).map_err(|error| error.to_string())
}

fn recover_running_timer(connection: &mut Connection) -> CommandResult<()> {
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let timer = read_timer(&transaction)?;
    if timer.mode == "focus" {
        if let Some(session_id) = timer.focus_session_id {
            transaction.execute(
                "UPDATE focus_sessions SET status = 'interrupted', ended_at_ms = ?1, credited_minutes = 0
                 WHERE id = ?2 AND status = 'running'",
                params![now_ms()?, session_id],
            ).map_err(|error| error.to_string())?;
        }
    }
    if timer.mode != "idle" {
        transaction.execute(
            "UPDATE timer_state SET mode = 'idle', focus_session_id = NULL, task_instance_id = NULL,
               started_at_ms = NULL, ends_at_ms = NULL,
               updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1",
            [],
        ).map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
fn ensure_daily_tasks(state: State<'_, AppState>, local_date: String, timezone_id: String) -> CommandResult<Vec<TaskInstance>> {
    validate_local_date(&local_date)?;
    if timezone_id.trim().is_empty() { return Err("No se pudo detectar la zona horaria local.".into()); }
    let mut connection = lock_db(&state)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    transaction.execute(
        "UPDATE task_instances SET status = 'overdue'
         WHERE local_date < ?1 AND status IN ('pending', 'in_progress')",
        [&local_date],
    ).map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT OR IGNORE INTO task_instances
           (id, template_id, local_date, timezone_id, title_snapshot, estimate_minutes, color_key)
         SELECT lower(hex(randomblob(16))), id, ?1, ?2, title, estimate_minutes, color_key
         FROM task_templates WHERE archived_at_utc IS NULL AND recurrence = 'daily'",
        params![local_date, timezone_id],
    ).map_err(|error| error.to_string())?;
    let tasks = read_tasks(&transaction, &local_date)?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(tasks)
}

#[tauri::command]
fn create_task(
    state: State<'_, AppState>, title: String, estimate_minutes: i64, color_key: String,
    local_date: String, timezone_id: String,
) -> CommandResult<TaskInstance> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() || trimmed_title.chars().count() > 80 {
        return Err("El nombre debe tener entre 1 y 80 caracteres.".into());
    }
    if !(1..=24 * 60).contains(&estimate_minutes) {
        return Err("La estimación debe estar entre 1 minuto y 24 horas.".into());
    }
    validate_color(&color_key)?;
    validate_local_date(&local_date)?;
    if timezone_id.trim().is_empty() { return Err("No se pudo detectar la zona horaria local.".into()); }

    let mut connection = lock_db(&state)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let template_id = new_id(&transaction)?;
    transaction.execute(
        "INSERT INTO task_templates (id, title, estimate_minutes, color_key) VALUES (?1, ?2, ?3, ?4)",
        params![template_id, trimmed_title, estimate_minutes, color_key],
    ).map_err(|error| error.to_string())?;
    let instance_id = new_id(&transaction)?;
    transaction.execute(
        "INSERT INTO task_instances (id, template_id, local_date, timezone_id, title_snapshot, estimate_minutes, color_key)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![instance_id, template_id, local_date, timezone_id, trimmed_title, estimate_minutes, color_key],
    ).map_err(|error| error.to_string())?;
    let task = read_task(&transaction, &instance_id)?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(task)
}

#[tauri::command]
fn update_task_template(
    state: State<'_, AppState>, template_id: String, title: String,
    estimate_minutes: i64, color_key: String,
) -> CommandResult<()> {
    let mut connection = lock_db(&state)?;
    update_task_template_on_connection(&mut connection, &template_id, &title, estimate_minutes, &color_key)
}

#[tauri::command]
fn archive_task_template(state: State<'_, AppState>, template_id: String) -> CommandResult<()> {
    let connection = lock_db(&state)?;
    connection.execute(
        "UPDATE task_templates SET archived_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1 AND archived_at_utc IS NULL",
        [template_id],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> CommandResult<AppSettings> {
    let connection = lock_db(&state)?;
    read_settings(&connection)
}

#[tauri::command]
fn update_settings(state: State<'_, AppState>, focus_minutes: i64, break_minutes: i64) -> CommandResult<AppSettings> {
    if !(1..=120).contains(&focus_minutes) { return Err("El enfoque debe durar entre 1 y 120 minutos.".into()); }
    if !(1..=30).contains(&break_minutes) { return Err("El descanso debe durar entre 1 y 30 minutos.".into()); }
    let connection = lock_db(&state)?;
    connection.execute(
        "UPDATE app_settings SET focus_minutes = ?1, break_minutes = ?2,
           updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1",
        params![focus_minutes, break_minutes],
    ).map_err(|error| error.to_string())?;
    read_settings(&connection)
}

#[tauri::command]
fn get_timer_snapshot(state: State<'_, AppState>) -> CommandResult<TimerSnapshot> {
    let connection = lock_db(&state)?;
    read_timer(&connection)
}

fn start_focus_on_connection(connection: &mut Connection, task_instance_id: &str, started_at_ms: i64) -> CommandResult<TimerSnapshot> {
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let timer = read_timer(&transaction)?;
    if timer.mode != "idle" { return Err("Ya hay un temporizador activo.".into()); }
    let task: (String, String, String, String, i64, i64) = transaction.query_row(
        "SELECT template_id, title_snapshot, color_key, local_date, estimate_minutes, credited_minutes
         FROM task_instances WHERE id = ?1",
        [task_instance_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
    ).map_err(|_| "Elegí una tarea del día antes de iniciar el enfoque.".to_string())?;
    let settings = read_settings(&transaction)?;
    let session_id = new_id(&transaction)?;
    let ends_at_ms = started_at_ms + settings.focus_minutes * 60_000;
    transaction.execute(
        "INSERT INTO focus_sessions (id, task_instance_id, task_template_id, task_title_snapshot,
           color_key, local_date, started_at_ms, planned_minutes, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'running')",
        params![session_id, task_instance_id, task.0, task.1, task.2, task.3, started_at_ms, settings.focus_minutes],
    ).map_err(|error| error.to_string())?;
    transaction.execute(
        "UPDATE timer_state SET mode = 'focus', focus_session_id = ?1, task_instance_id = ?2,
           started_at_ms = ?3, ends_at_ms = ?4, focus_minutes = ?5, break_minutes = ?6,
           updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 1 AND mode = 'idle'",
        params![session_id, task_instance_id, started_at_ms, ends_at_ms, settings.focus_minutes, settings.break_minutes],
    ).map_err(|error| error.to_string())?;
    transaction.execute(
        "UPDATE task_instances SET status = 'in_progress' WHERE id = ?1 AND status = 'pending'",
        [task_instance_id],
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    read_timer(connection)
}

#[tauri::command]
fn start_focus(state: State<'_, AppState>, task_instance_id: String) -> CommandResult<TimerSnapshot> {
    let mut connection = lock_db(&state)?;
    start_focus_on_connection(&mut connection, &task_instance_id, now_ms()?)
}

#[tauri::command]
fn start_break(state: State<'_, AppState>) -> CommandResult<TimerSnapshot> {
    let mut connection = lock_db(&state)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let timer = read_timer(&transaction)?;
    if timer.mode != "idle" { return Err("Primero terminá o interrumpí el temporizador actual.".into()); }
    let settings = read_settings(&transaction)?;
    let started_at_ms = now_ms()?;
    transaction.execute(
        "UPDATE timer_state SET mode = 'break', focus_session_id = NULL, task_instance_id = NULL,
           started_at_ms = ?1, ends_at_ms = ?2, focus_minutes = ?3, break_minutes = ?4,
           updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1 AND mode = 'idle'",
        params![started_at_ms, started_at_ms + settings.break_minutes * 60_000, settings.focus_minutes, settings.break_minutes],
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    read_timer(&connection)
}

fn interrupt_timer_on_connection(connection: &mut Connection, ended_at_ms: i64) -> CommandResult<TimerSnapshot> {
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let timer = read_timer(&transaction)?;
    if timer.mode == "focus" {
        if let Some(session_id) = timer.focus_session_id {
            transaction.execute(
                "UPDATE focus_sessions SET status = 'interrupted', ended_at_ms = ?1, credited_minutes = 0
                 WHERE id = ?2 AND status = 'running'",
                params![ended_at_ms, session_id],
            ).map_err(|error| error.to_string())?;
        }
    }
    if timer.mode != "idle" {
        transaction.execute(
            "UPDATE timer_state SET mode = 'idle', focus_session_id = NULL, task_instance_id = NULL,
               started_at_ms = NULL, ends_at_ms = NULL,
               updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1",
            [],
        ).map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    read_timer(connection)
}

#[tauri::command]
fn interrupt_timer(state: State<'_, AppState>) -> CommandResult<TimerSnapshot> {
    let mut connection = lock_db(&state)?;
    interrupt_timer_on_connection(&mut connection, now_ms()?)
}

fn complete_focus_on_connection(connection: &mut Connection, completed_at_ms: i64, completed_local_date: &str) -> CommandResult<CompletedCycle> {
    validate_local_date(completed_local_date)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    let timer = read_timer(&transaction)?;
    if timer.mode != "focus" { return Err("No hay un ciclo de enfoque para completar.".into()); }
    let ends_at_ms = timer.ends_at_ms.ok_or_else(|| "El temporizador no tiene una hora de finalización.".to_string())?;
    if completed_at_ms < ends_at_ms { return Err("El ciclo de enfoque todavía no terminó.".into()); }
    let session_id = timer.focus_session_id.ok_or_else(|| "El ciclo activo perdió su identificador.".to_string())?;
    let task_instance_id = timer.task_instance_id.ok_or_else(|| "El ciclo activo perdió su tarea.".to_string())?;
    let (estimate, prior_credit): (i64, i64) = transaction.query_row(
        "SELECT estimate_minutes, credited_minutes FROM task_instances WHERE id = ?1",
        [&task_instance_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|error| error.to_string())?;
    let credit = timer.focus_minutes;
    let total_credit = prior_credit + credit;
    let task_completed = total_credit >= estimate;

    let updated = transaction.execute(
        "UPDATE focus_sessions SET status = 'completed', ended_at_ms = ?1, credited_minutes = ?2
         WHERE id = ?3 AND status = 'running'",
        params![completed_at_ms, credit, session_id],
    ).map_err(|error| error.to_string())?;
    if updated != 1 { return Err("El ciclo ya fue cerrado o interrumpido.".into()); }
    transaction.execute(
        "UPDATE task_instances SET credited_minutes = ?1,
           status = CASE WHEN ?1 >= estimate_minutes THEN 'completed' ELSE 'in_progress' END,
           completed_at_local_date = CASE WHEN ?1 >= estimate_minutes THEN ?2 ELSE NULL END
         WHERE id = ?3",
        params![total_credit, completed_local_date, task_instance_id],
    ).map_err(|error| error.to_string())?;
    transaction.execute(
        "UPDATE timer_state SET mode = 'idle', focus_session_id = NULL, task_instance_id = NULL,
           started_at_ms = NULL, ends_at_ms = NULL,
           updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1",
        [],
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(CompletedCycle {
        session_id, credited_minutes: credit, task_completed, timer: read_timer(connection)?,
    })
}

#[tauri::command]
fn complete_focus(state: State<'_, AppState>, completed_local_date: String) -> CommandResult<CompletedCycle> {
    let mut connection = lock_db(&state)?;
    complete_focus_on_connection(&mut connection, now_ms()?, &completed_local_date)
}

#[tauri::command]
fn complete_break(state: State<'_, AppState>) -> CommandResult<TimerSnapshot> {
    let connection = lock_db(&state)?;
    let timer = read_timer(&connection)?;
    if timer.mode != "break" { return Err("No hay un descanso activo.".into()); }
    if now_ms()? < timer.ends_at_ms.unwrap_or(i64::MAX) { return Err("El descanso todavía no terminó.".into()); }
    connection.execute(
        "UPDATE timer_state SET mode = 'idle', started_at_ms = NULL, ends_at_ms = NULL,
           updated_at_utc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1 AND mode = 'break'",
        [],
    ).map_err(|error| error.to_string())?;
    read_timer(&connection)
}

#[tauri::command]
fn get_metrics_data(state: State<'_, AppState>, start: String, end_exclusive: String) -> CommandResult<MetricsData> {
    validate_local_date(&start)?;
    validate_local_date(&end_exclusive)?;
    if start >= end_exclusive { return Err("El rango de métricas no es válido.".into()); }
    let connection = lock_db(&state)?;
    let mut statement = connection.prepare(
        "SELECT id, local_date, task_template_id, task_title_snapshot, color_key, status, credited_minutes
         FROM focus_sessions WHERE local_date >= ?1 AND local_date < ?2 ORDER BY local_date, started_at_ms",
    ).map_err(|error| error.to_string())?;
    let sessions = statement.query_map(params![start, end_exclusive], |row| {
        Ok(FocusSessionRecord {
            id: row.get(0)?, local_date: row.get(1)?, task_id: row.get(2)?, task_title: row.get(3)?,
            color_key: row.get(4)?, status: row.get(5)?, credited_minutes: row.get(6)?,
        })
    }).map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;

    let mut task_statement = connection.prepare(
        "SELECT id, template_id, local_date, timezone_id, title_snapshot, estimate_minutes,
                credited_minutes, color_key, status, completed_at_local_date
         FROM task_instances
         WHERE (local_date >= ?1 AND local_date < ?2)
            OR (completed_at_local_date >= ?1 AND completed_at_local_date < ?2)
         ORDER BY local_date, created_at_utc",
    ).map_err(|error| error.to_string())?;
    let tasks = task_statement.query_map(params![start, end_exclusive], task_from_row)
        .map_err(|error| error.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    Ok(MetricsData { sessions, tasks })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let database_path = app.path().app_local_data_dir()?.join("productivity.sqlite3");
            let mut db = create_database(database_path).map_err(std::io::Error::other)?;
            recover_running_timer(&mut db).map_err(std::io::Error::other)?;
            app.manage(AppState { db: Mutex::new(db) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ensure_daily_tasks, create_task, update_task_template, archive_task_template,
            get_settings, update_settings, get_timer_snapshot, start_focus, start_break,
            complete_focus, complete_break, interrupt_timer, get_metrics_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running productivity focus app");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_database() -> Connection {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at_utc TEXT NOT NULL DEFAULT 'test');",
        ).expect("create migration tracker");
        connection.execute_batch(INITIAL_MIGRATION).expect("apply initial migration");
        connection
    }

    fn create_daily_task(connection: &mut Connection, estimate_minutes: i64) -> String {
        let transaction = connection.transaction().expect("begin setup transaction");
        let template_id = new_id(&transaction).expect("generate template id");
        let instance_id = new_id(&transaction).expect("generate instance id");
        transaction.execute(
            "INSERT INTO task_templates (id, title, estimate_minutes, color_key) VALUES (?1, 'Estudiar', ?2, 'graphite')",
            params![template_id, estimate_minutes],
        ).expect("insert template");
        transaction.execute(
            "INSERT INTO task_instances (id, template_id, local_date, timezone_id, title_snapshot, estimate_minutes, color_key)
             VALUES (?1, ?2, '2026-10-25', 'America/Argentina/Buenos_Aires', 'Estudiar', ?3, 'graphite')",
            params![instance_id, template_id, estimate_minutes],
        ).expect("insert instance");
        transaction.commit().expect("commit setup");
        instance_id
    }

    fn finish_one_cycle(connection: &mut Connection, task_id: &str, expected_credit: i64) -> CompletedCycle {
        start_focus_on_connection(connection, task_id, 1_000).expect("start focus");
        connection.execute("UPDATE timer_state SET ends_at_ms = 1_000", []).expect("advance deterministic timer");
        let result = complete_focus_on_connection(connection, 1_000, "2026-10-25").expect("finish focus");
        assert_eq!(result.credited_minutes, expected_credit);
        result
    }

    #[test]
    fn completed_cycles_credit_and_complete_a_one_hour_task() {
        let mut connection = memory_database();
        let task_id = create_daily_task(&mut connection, 60);
        assert!(!finish_one_cycle(&mut connection, &task_id, 30).task_completed);
        assert!(finish_one_cycle(&mut connection, &task_id, 30).task_completed);
        let task = read_task(&connection, &task_id).expect("read task");
        assert_eq!(task.credited_minutes, 60);
        assert_eq!(task.status, "completed");
    }

    #[test]
    fn editing_task_color_updates_existing_instances() {
        let mut connection = memory_database();
        let task_id = create_daily_task(&mut connection, 60);
        let template_id: String = connection.query_row(
            "SELECT template_id FROM task_instances WHERE id = ?1", [&task_id], |row| row.get(0),
        ).expect("read template id");

        update_task_template_on_connection(&mut connection, &template_id, "Estudiar", 60, "sage")
            .expect("update task color");

        assert_eq!(read_task(&connection, &task_id).expect("read task").color_key, "sage");
    }

    #[test]
    fn final_cycle_credits_full_duration_past_estimate() {
        let mut connection = memory_database();
        let task_id = create_daily_task(&mut connection, 50);
        finish_one_cycle(&mut connection, &task_id, 30);
        let final_cycle = finish_one_cycle(&mut connection, &task_id, 30);
        assert!(final_cycle.task_completed);
        assert_eq!(read_task(&connection, &task_id).expect("read task").credited_minutes, 60);
    }

    #[test]
    fn completed_task_can_receive_additional_focus_credit() {
        let mut connection = memory_database();
        let task_id = create_daily_task(&mut connection, 60);
        finish_one_cycle(&mut connection, &task_id, 30);
        finish_one_cycle(&mut connection, &task_id, 30);

        let result = finish_one_cycle(&mut connection, &task_id, 30);
        let task = read_task(&connection, &task_id).expect("read completed task");
        assert!(result.task_completed);
        assert_eq!(task.credited_minutes, 90);
        assert_eq!(task.status, "completed");
    }

    #[test]
    fn interrupted_cycle_is_recorded_without_credit() {
        let mut connection = memory_database();
        let task_id = create_daily_task(&mut connection, 60);
        start_focus_on_connection(&mut connection, &task_id, 1_000).expect("start focus");
        interrupt_timer_on_connection(&mut connection, 2_000).expect("interrupt focus");
        let task = read_task(&connection, &task_id).expect("read task");
        let session: (String, i64) = connection.query_row(
            "SELECT status, credited_minutes FROM focus_sessions LIMIT 1", [], |row| Ok((row.get(0)?, row.get(1)?)),
        ).expect("read session");
        assert_eq!(task.credited_minutes, 0);
        assert_eq!(session, ("interrupted".into(), 0));
    }

    #[test]
    fn cannot_complete_a_cycle_before_its_deadline() {
        let mut connection = memory_database();
        let task_id = create_daily_task(&mut connection, 60);
        start_focus_on_connection(&mut connection, &task_id, 1_000).expect("start focus");
        assert!(complete_focus_on_connection(&mut connection, 2_000, "2026-10-25").is_err());
        assert_eq!(read_task(&connection, &task_id).expect("read task").credited_minutes, 0);
    }
}

