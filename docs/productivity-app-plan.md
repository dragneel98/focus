# Productivity Focus App Plan

## Outcome

Build a local-first Tauri 2 desktop app that turns a daily recurring task into measurable, interruption-resistant focus time. It is for people who plan a small set of daily tasks and want progress measured by completed focus intervals rather than manual checkmarks. The app UI is entirely Spanish; this plan and technical artifacts are English.

### MVP scope

**In scope**

- Create/edit recurring daily task templates with an estimated duration in minutes and a semantic task color.
- Generate one task instance per local calendar day.
- Select one task before starting a focus interval.
- Run exactly one active timer at a time, with user-configurable focus and break durations (30-minute focus and 5-minute break defaults; MVP bounds are 1–120 focus minutes and 1–30 break minutes).
- Credit only a completed focus interval using its configured duration; cap the final credit at the task estimate remaining.
- Complete a task automatically when credited minutes reach its estimate, then play a completion animation.
- Persist local data in SQLite, recover timer state after restart, and show daily/weekly/monthly metrics.
- Send desktop notifications when an interval or break ends, subject to permission.

**Out of scope for MVP**

- Cloud sync, accounts, collaboration, mobile/web clients, calendar integration, AI planning, manual task completion, and arbitrary timer concurrency.
- Editing historical credited sessions or manually changing derived metrics.
- Copying Nothing/Notion branded assets or proprietary interaction patterns.

## Product behavior

| Rule | Required behavior |
|---|---|
| Daily task | A recurring template produces a local-date task instance. |
| Estimate | The user enters estimated minutes; it is the completion threshold. |
| Focus selection | A task must be selected before a focus interval starts. |
| Single timer | Only one focus or break timer can be active. |
| Credit | A completed focus interval credits its configured focus duration to its selected task. |
| Partial final interval | Credit is `min(configured focus duration, remaining estimate)`, never more than the remaining estimate. |
| 60-minute task | With a 30-minute configured focus interval, it completes after two credited cycles. Other durations may require more or fewer cycles. |
| Abandonment | Closing/cancelling an interval before completion credits zero minutes. |
| Breaks | Break duration never credits task time. |
| Completion | Reaching the estimate marks the instance complete and triggers animation. There is no manual completion control. |

Recommended flow: select task → start focus → finish focus → credit session → optionally start break → repeat. A break cannot silently change the selected task.

## Data model and SQLite outline

Store timestamps as UTC instants plus the IANA timezone used to derive a local date. Never infer a business day from the machine's current timezone after the fact.

```sql
TaskTemplate (id TEXT PRIMARY KEY, title TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
  color_key TEXT NOT NULL, recurrence TEXT NOT NULL DEFAULT 'daily',
  is_archived INTEGER NOT NULL DEFAULT 0, created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL);

TaskInstance (id TEXT PRIMARY KEY, template_id TEXT NOT NULL REFERENCES TaskTemplate(id),
  local_date TEXT NOT NULL, timezone_id TEXT NOT NULL, estimated_minutes INTEGER NOT NULL,
  credited_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','in_progress','completed','overdue')),
  completed_at_utc TEXT, UNIQUE(template_id, local_date));

FocusSession (id TEXT PRIMARY KEY, task_instance_id TEXT NOT NULL REFERENCES TaskInstance(id),
  started_at_utc TEXT NOT NULL, ended_at_utc TEXT, planned_minutes INTEGER NOT NULL DEFAULT 30,
  credited_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('running','completed','abandoned')));

TimerState (id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('idle','focus','break')),
  focus_session_id TEXT REFERENCES FocusSession(id), task_instance_id TEXT REFERENCES TaskInstance(id),
  started_at_utc TEXT, ends_at_utc TEXT, updated_at_utc TEXT NOT NULL);
```

On launch and local-day rollover, ensure each active template has exactly one instance for the new `local_date`, initialized with the template's full planned estimate. The prior date remains a separate historical instance and is never carried into or deducted from the new day. Template edits apply to future instances; existing instances retain copied estimate and color. Metrics query `FocusSession.credited_minutes`; `TaskInstance.credited_minutes` is a convenience projection, not the source of truth.

If the app closes or the device suspends during a running interval, mark that interval interrupted. On reopening, do not resume or credit it; preserve the task's credited progress as it stood before that interval.

## Architecture and responsibility boundaries

| Boundary | Responsibility | Must not own |
|---|---|---|
| React + TypeScript frontend | Spanish UI, intent, timer display, accessibility, charts | Durable writes or authoritative elapsed-time decisions |
| Tauri/Rust commands | Validate commands, one-timer invariant, credit, recovery, events | Styling or chart presentation |
| Persistence | SQLite migrations, repositories, transactions, constraints | UI decisions or notification copy |
| Notifications | Permission and interval/break/task delivery | Timer truth or credit |
| Metrics | Derive day/week/month aggregates and color series from credited sessions | Persisted counters |

Metrics are derived from credited `FocusSession` rows, not persisted counters. Rust is authoritative for interval completion and credit.

## Libraries and roles

**Selected integration choices**

- **Tauri 2** — desktop shell and Rust command boundary.
- **`rusqlite` with bundled SQLite** — Rust-owned local persistence and transactions, so focus completion can atomically record a session and update its task.
- **`tauri-plugin-notification` / `@tauri-apps/plugin-notification`** — official notification integration.

**Implementation recommendations:** React + TypeScript + Vite (UI/build); Zustand (client state); Recharts (charts); Tailwind CSS with CSS variables (layout/theme); Lucide React (icons); Motion (completion animation); Vitest (unit tests); React Testing Library (behavior tests); Playwright (user flows); Rust unit/integration tests (authoritative domain and persistence).

**Tradeoff:** Tauri's official SQL plugin was considered, but the implementation uses Rust commands and `rusqlite` directly to keep database writes behind the native boundary and make completion transactional. This adds explicit connection and migration ownership to the Rust layer.

## Visual direction

Use a minimal Nothing/Notion-inspired direction without copying branded assets: restrained monochrome foundations, one accessible semantic task color, an 8px spacing rhythm, generous panels, neutral sans-serif typography, visible numeric timer figures, and shared light/dark CSS tokens. Meet WCAG AA contrast and never rely on color alone. Respect `prefers-reduced-motion` by replacing animation with a static success state. All visible labels, messages, dates, and examples are Spanish (for example, “Iniciar enfoque”, “Descanso”, “Completada”).

## Metrics

Define metrics from sessions where `status = 'completed'` and `credited_minutes > 0`.

- **Day:** credited minutes, completed intervals, completed tasks, and minutes by task color for a local date.
- **Week:** same measures grouped Monday–Sunday in the reporting timezone.
- **Month:** same measures grouped by local calendar month, with daily trend totals.
- **Task-color stacked time series:** x-axis is the period bucket; each stacked series is `color_key`, segment height is credited minutes. Tooltips show Spanish title, minutes, and date. Deleted colors use neutral “Sin color”.

## Notifications and fallback

Request permission only when notifications are first enabled or needed. Notify on focus completion, break completion, and task completion. Denial or delivery failure never stops timer state or credit. The in-app fallback is an accessible Spanish toast/banner plus status indicator: “El enfoque terminó”.

## Phased implementation plan

### Phase 0 — Foundations

Define domain types, timezone policy, migrations, Spanish copy, and deterministic clock injection. **RED/GREEN/REFACTOR applies** to deterministic domain tests; scaffolding uses structural checks.

### Phase 1 — Tasks and daily instances

Implement validated CRUD, idempotent instance generation, and overdue handling. RED tests cover duplicate generation and timezone boundaries; GREEN implements transactions; REFACTOR preserves green tests.

### Phase 2 — Timer and credit engine

Implement the one-timer invariant, completed/abandoned sessions, final cap, automatic completion, and completion event. RED tests cover 60-minute tasks, abandonment, final cap, and competing timers; then GREEN and REFACTOR.

### Phase 3 — Frontend flow and recovery

Implement Spanish task selection, timer/break UI, completion animation, reduced-motion fallback, restart recovery, RTL tests, and end-to-end interruption coverage.

### Phase 4 — Metrics and notifications

Implement day/week/month filters, session-derived stacked chart, permission-denied fallback, and empty/partial/completed data tests.

### Phase 5 — Hardening

Run migration upgrades, accessibility, theme, failure-recovery, and packaged desktop smoke tests. Confirm no manual completion and no persisted metric counters.

## Delegation Contract for a Lower-Capability Subagent

The parent owns product decisions, ordering, and scope. A subagent receives one bounded task at a time.

1. Edit only exact paths under **Allowed edit surfaces**; do not create files elsewhere.
2. Do not assume UI copy, recurrence semantics, durations, recovery, timezone, or notifications.
3. Do not install dependencies, initialize Git, access network/remote services, or change tooling without explicit authorization.
4. Do not make unsupported product decisions; return a concise question to the parent.
5. Read the task document and relevant files before writing and preserve conventions.
6. Report changed files, commands, observed results, failures, and unresolved questions.
7. Work one task at a time and stop after acceptance criteria.

Required envelope: `Task ID`, `Objective`, `Allowed edit surfaces`, `Do-not-assume constraints`, `Acceptance criteria`, `Exact verification commands`, and `Escalation triggers`.

Escalate for conflicting requirements, absent paths, migration/data-loss risk, ambiguous timer recovery, unavailable test runner, or edits outside allowed surfaces. Sample bounded tasks include a Rust credit function plus tests, a Spanish timer component plus RTL test, a metrics query/chart adapter, or one SQLite migration. Each must stop and ask the parent when assumptions are required.

## Risks, edge cases, and non-goals

DST and timezone changes require instants for elapsed time and IANA zones for dates. Sleep, hibernation, clock changes, termination, duplicate launch events, revoked notification permission, archived templates, and partial SQLite writes require conservative recovery and transactions. Accessibility and reduced motion are functional requirements. Non-goals remain sync, manual completion, multi-timer operation, and historical editing.

## Confirmed product decisions

- Pomodoro focus and break durations are configurable; completed focus cycles use the configured duration for task credit.
- Daily recurring tasks reset to their full planned estimate in a distinct instance on each local calendar day.
- A cycle interrupted by app close or device suspension is not credited and does not resume automatically.

## Final next-action checklist

- [x] Obtain and record decisions on Pomodoro configurability, daily reset, and interrupted-cycle recovery.
- [ ] Confirm default focus/break duration values and validation bounds during implementation.
- [ ] Create implementation tasks with stable IDs and exact edit surfaces.
- [ ] Confirm Tauri plugin versions and platform support during setup.
- [ ] Implement Phase 0 contracts and deterministic clock tests.
- [ ] Proceed phase by phase, recording verification evidence and risks.
