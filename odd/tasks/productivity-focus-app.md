# Productivity Focus App implementation

Objective: Implement the Spanish-first, local-first Tauri productivity app specified in `docs/productivity-app-plan.md`.
Branch: feat/productivity-focus-app | Delivery: ask-on-risk | Runner: npm scripts, Rust tests when Cargo is available.

## Specs

### S1 — Product scope and Spanish UI
- Authorized scope: build the planned local desktop productivity app; keep all visible app UI in Spanish.
- User request: "quiero crear una aplicacion de productividad que tenga
una parte de lista de tareas con tareas recuerrentes como estudiar todos los dias y a la cual se le puedan asignar una cantidad de horas para su implementacion y que para completarse se deber usar el pomodoro incluido en la app en el cual se debe ejegir una de las aterias de la lista e iniciar el reloj lo cual hace que se reste tiempo en la tarea que se esta realizando por ejemplo si la tarea dura una hora y el pomodoro ya paso los 60 minutos activos con esa tarea seleccionada se debe dar por completada con alguna animacion y en la lista de tareas debe quedar completada
tambien hay un segundo modulo muy importante que es un grafico con metricas dia semana mes que cuente con tareas completadas horas trabajadas y un grafico que muestre las horas trabajadas con un color distinto para cada tarea en la que se trabajo
tambien notificacion para cuando acabe cada pomodoro todo con una estetica minimalista con el estilo de empresas como nothing o notion"
- Acceptance: app shell, task workflow, timer, metrics, notifications, and styling match the authorized scope; no accounts, cloud sync, or manual task completion.
- Checks: structural readback; UI tests for user-visible behavior; runtime test when host toolchain supports Tauri.

### S2 — Completed focus cycles credit task estimates
- User clarification: "si hablamos por ejemplo de una tarea de 1h diaria pero un timer o pomodoro de 30 minutos esos 30 minutos contarian como un ciclo ? en esa caso creo que contar solo ciclos esta bien"
- Acceptance: only a finished focus interval receives credit; breaks and interrupted sessions receive zero. Task completion occurs when credited time reaches its estimate. The final credited interval is capped at remaining task time.
- Checks: deterministic domain tests for 60 minutes with two 30-minute cycles, interruption, and final-interval cap.

### S3 — Configurable Pomodoro duration
- User decision: "Configurable duration"
- Acceptance: users can configure focus and break durations; a completed focus interval credits its configured focus duration, capped by the selected task's remaining estimate.
- Checks: settings validation and timer-credit tests for non-default durations.

### S4 — Daily task instances reset
- User decision: "cada dia la tarea se reinicia nuevamente con su cantidad de horas inicial esto esta pensado para tareas diarias si"
- Acceptance: each recurrence date gets a distinct instance initialized with the template's planned estimate; prior dates are never mutated by a new day's instance.
- Checks: deterministic date-boundary and idempotent-generation tests.

### S5 — Interrupted timer recovery
- User decision: "Interrumpir y no acreditar (Recomendado)"
- Acceptance: closing or suspending the app during an active Pomodoro marks that cycle interrupted and credits no task time after reopening.
- Checks: recovery tests assert zero credited minutes and preserved task estimate.

## Tasks

- [x] T1 — Bootstrap Tauri/React/TypeScript app shell and Spanish minimal visual system (inline; implemented; commit: pending).
- [x] T2 — Implement local task templates and date-scoped recurring instances (inline; implemented; commit: pending).
- [x] T3 — Implement timer settings, single-active timer, durable cycle recording, and task credit/completion (inline; implemented; Rust verification pending; commit: pending).
- [x] T4 — Implement notifications and accessible in-app completion fallback (inline; implemented; commit: pending).
- [x] T5 — Implement day/week/month metrics and task-color chart (inline; implemented; frontend checks passed; native verification pending; commit: pending).

## Log

### L1 — Original implementation request
"implementa el **Productivity Focus App Plan**"

### L2 — Accepted product decisions
- Pomodoro focus and break durations are configurable.
- Daily recurring tasks receive a fresh instance and full initial estimate each local calendar day.
- A Pomodoro interrupted by app close or suspension is not credited.

### L3 — Initial environment evidence
- `docs/productivity-app-plan.md` exists; no source scaffold or Git repository was present.
- `cargo` was not available on PATH at initial inspection. Re-check toolchain before choosing how to verify or launch native Tauri code.
- Engram project resolution returned `productivity-tauri`, but memory read/write calls could not confirm host session identity; Engram mirror is pending.
- RDD was previously reported off for this clone; re-check after initializing the repository, without changing the mode.

### L4 — Implementation setup and verified RED/GREEN
- Created a new Git repository on `feat/productivity-focus-app`; each Git invocation must use the path-scoped `safe.directory` option because the sandbox user differs from the workspace owner. No global Git trust setting was changed.
- Scaffolded Tauri 2 + React + TypeScript + Vite and installed frontend/UI/test dependencies. Rust/Cargo remains missing; the scaffold explicitly reports Rust as a prerequisite.
- Added deterministic task-credit and metrics tests, observed RED because domain modules were absent, then implemented `src/domain/taskRules.ts` and `src/domain/metrics.ts`; `npm test -- --reporter=dot` is GREEN (13 tests).
- Switched local persistence from the plan's SQL plugin recommendation to Rust-owned `rusqlite` with bundled SQLite so cycle completion and task progress can share a native SQLite transaction. This preserves the plan's local SQLite and native-boundary intent.
- Default focus/break values are 30/5 minutes; MVP validation bounds are 1–120 focus minutes and 1–30 break minutes.
- Implemented React/Vite UI, Zustand application state, task/timer/metrics modules, notification adapter, SQLite schema, and Rust Tauri commands. Browser preview uses localStorage and interrupts any in-progress focus cycle on reload.
- Frontend verification: 16 Vitest tests pass; `npm run build` passes TypeScript and Vite production compilation; `git diff --check` passes. Vite reports the generated JS chunk is 764 kB, above its 500 kB advisory threshold.
- Native verification is pending: Cargo/Rust are unavailable in this environment, so Rust tests and a Tauri desktop build could not run. RDD status also returned unavailable because repository identity resolution was denied; it was not changed.
- Source changes affect persisted task/session state and timer concurrency (high-risk items 1 and 4). Native independent verification must be completed before calling this implementation fully verified.

### L5 — Verification gap
- TypeScript caught `StoredSession` extending `FocusSessionRecord` with an incompatible `running` status. Changed it to `Omit<FocusSessionRecord, "status">` before final green checks.
- No repository commit has been created yet; repository started empty, and the feature remains on `feat/productivity-focus-app`.

### L6 — Rust compiler feedback
- User-provided `cargo test/build` output identified five E0308 errors where `?` was applied directly inside references to a `MutexGuard<Connection>`. Bound each guard to a local variable before borrowing it or passing it mutably to the connection helpers.
- Could not independently rerun Rust compilation here because `cargo` remains unavailable in this runtime; the user should rerun `npm run tauri build` to verify.

## Next Steps
- [ ] Run Rust unit tests and Tauri build once Cargo/Rust are available; fix any native compilation issues.
- [ ] Perform required independent verification for persisted state and timer concurrency.
- [ ] Create the conventional work-unit commit after verification; no AI attribution.

## Relevant Files
- `docs/productivity-app-plan.md` — architecture, behavior, test plan, delegation contract, and open assumptions.
- `src-tauri/src/lib.rs` — native SQLite commands and Rust unit tests; not compiled in this environment.
- `src/domain/` — task-credit, recurrence, metrics, and chart logic with deterministic tests.

