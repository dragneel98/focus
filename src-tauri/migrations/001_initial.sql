CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  estimate_minutes INTEGER NOT NULL CHECK (estimate_minutes > 0),
  color_key TEXT NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'daily' CHECK (recurrence = 'daily'),
  archived_at_utc TEXT,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS task_instances (
  id TEXT PRIMARY KEY NOT NULL,
  template_id TEXT NOT NULL REFERENCES task_templates(id),
  local_date TEXT NOT NULL,
  timezone_id TEXT NOT NULL,
  title_snapshot TEXT NOT NULL,
  estimate_minutes INTEGER NOT NULL CHECK (estimate_minutes > 0),
  credited_minutes INTEGER NOT NULL DEFAULT 0 CHECK (credited_minutes >= 0),
  color_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  completed_at_local_date TEXT,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(template_id, local_date)
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  task_instance_id TEXT NOT NULL REFERENCES task_instances(id),
  task_template_id TEXT NOT NULL REFERENCES task_templates(id),
  task_title_snapshot TEXT NOT NULL,
  color_key TEXT NOT NULL,
  local_date TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  ended_at_ms INTEGER,
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
  credited_minutes INTEGER NOT NULL DEFAULT 0 CHECK (credited_minutes >= 0),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'interrupted'))
);

CREATE INDEX IF NOT EXISTS idx_task_instances_date ON task_instances(local_date, status);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_date ON focus_sessions(local_date, status);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_task ON focus_sessions(task_template_id, local_date);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  focus_minutes INTEGER NOT NULL DEFAULT 30 CHECK (focus_minutes BETWEEN 1 AND 120),
  break_minutes INTEGER NOT NULL DEFAULT 5 CHECK (break_minutes BETWEEN 1 AND 30),
  updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT OR IGNORE INTO app_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS timer_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'idle' CHECK (mode IN ('idle', 'focus', 'break')),
  focus_session_id TEXT,
  task_instance_id TEXT REFERENCES task_instances(id),
  started_at_ms INTEGER,
  ends_at_ms INTEGER,
  focus_minutes INTEGER NOT NULL DEFAULT 30,
  break_minutes INTEGER NOT NULL DEFAULT 5,
  updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT OR IGNORE INTO timer_state (id) VALUES (1);
