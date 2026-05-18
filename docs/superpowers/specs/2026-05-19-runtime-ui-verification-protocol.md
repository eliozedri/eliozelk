# Runtime UI Verification Protocol

**Applies to:** All UI, sidebar, navigation, routing, permission, and role-visibility changes across every session and every feature in this project.

---

## Background

On 2026-05-19, the SAP Business One integration feature (`/integrations`) was reported as complete. Code was correct, TypeScript passed, the route existed, and the commit was made. The user's browser did not show the sidebar entry.

Root cause: the dev server had been running since before the fix was applied. Turbopack HMR did not reliably re-compile the `canAccessTab` module. The master-bypass fix existed on disk but never entered the running bundle. The user's `allowed_tabs` column in Supabase did not contain `"integrations"`, so every render of `canSeeTab("integrations")` returned `false` against the stale in-memory module.

This incident revealed a systematic gap: static verification (code, TypeScript, build, commit) does not confirm runtime visibility.

---

## Core Principle

**Static success ≠ runtime visibility.**

Each of the following passing does NOT mean the feature is usable in the browser:

- Code written and correct
- TypeScript compiles without errors
- Build passes
- Route file exists in the filesystem
- Commit exists in git history
- Static analysis says the component should render

**A feature is complete only when the user can see and use it in the active running system.**

---

## Scope

This protocol is mandatory for every change involving:

- Sidebar or navigation items (new links, removed links, section labels)
- New pages or routes
- Permission-gated UI elements (tabs, buttons, sections)
- Role-based visibility (`canAccessTab`, `canPerformAction`, ROLE_DEFAULTS)
- DB-driven access control (`allowed_tabs`, `action_permissions` columns)
- Feature flags or mode guards (e.g., `SAP_B1_MODE`)
- Any element whose visibility depends on runtime state rather than static props

---

## Pre-Completion Checklist

Run every item before reporting any in-scope feature as complete.

| # | Check | Command / Method |
|---|---|---|
| 1 | Current branch matches expected | `git branch --show-current` |
| 2 | Latest commit includes the change | `git log --oneline -3` |
| 3 | Dev server is running on expected port | `lsof -ti :3000` |
| 4 | Server process is running from correct directory | `lsof -p <PID> \| grep cwd` |
| 5 | Server started AFTER the relevant code changes | Compare PID start time to commit time; restart if uncertain |
| 6 | Route returns expected HTTP status | `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/<route>` |
| 7 | UI element is rendered in the active runtime | Navigate to the parent page; confirm the item is visible |
| 8 | Permission/role check passes at runtime | Verify for the actual target role (especially master/admin) |
| 9 | DB-driven permissions contain required values | If the feature uses `allowed_tabs` or `action_permissions`, query the live `profiles` row |
| 10 | Hard refresh has been done or instructed | `Cmd+Shift+R` (Mac) / `Ctrl+Shift+R` (Windows) |

A feature may only be reported as complete when all applicable items pass.

---

## Stale Runtime Detection

When code is correct but the UI does not reflect it, investigate in this order:

1. **Stale dev server** — process started before the code change; HMR may not have re-compiled all dependent modules, especially shared utilities like `auth.ts`, context providers, or layout components.
2. **Stale HMR** — Next.js/Turbopack emitted a partial hot update; affected module still uses old in-memory code. Symptom: code on disk is correct, TypeScript passes, but runtime behavior is from an older version.
3. **Stale browser cache** — browser is serving a cached JS chunk from a previous session. Fix: hard refresh (`Cmd+Shift+R`).
4. **Wrong branch** — the running process was started from a different branch or working tree checkout.
5. **DB-driven permission mismatch** — a code-level bypass (e.g., `if (role === "master") return true`) exists in source but the server compiled the old version; the DB check is what actually ran.
6. **Wrong deployment** — production or staging is serving a different version than local dev.

---

## Dev Server Restart Procedure

When any stale runtime condition is detected or suspected:

```bash
# 1. Find the running process
lsof -ti :3000

# 2. Kill it
kill <PID>

# 3. Verify it's down
lsof -ti :3000 || echo "down"

# 4. Start fresh
npm run dev &

# 5. Wait for ready signal
# Watch for: ✓ Ready in Xms

# 6. Verify the target route
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/<route>
```

After restart, instruct the user: **hard refresh the browser (`Cmd+Shift+R`)** before testing.

---

## DB Permission Verification

For features gated by `allowed_tabs` or `action_permissions` in the Supabase `profiles` table:

- A code-level role bypass (e.g., `if (profile.role === "master") return true`) is only effective if the RUNNING server has compiled that version.
- Do not assume the bypass is active — verify the server was started after the bypass commit.
- When uncertain, apply both: ensure the code bypass is in the running bundle AND confirm the DB row contains the required value for robustness.

To verify the live DB state, check the user's `profiles` row: confirm `allowed_tabs` contains the tab ID, or `action_permissions` contains the action key.

`ROLE_DEFAULTS` in `src/types/auth.ts` is compile-time documentation only. It is applied at user creation. It does not retroactively update existing DB rows when changed.

---

## Completion Report Format

Every completion report for an in-scope feature must include:

```
Runtime Verification:
- Branch: <branch>
- Latest commit: <hash> — <message>
- Server: PID <pid>, port <port>
- Server started after latest changes: yes / no (restarted: yes/no)
- Route HTTP status: <status>
- Feature visible in active UI: yes (verified) / no (reason: ...)
- Permissions verified at runtime: yes / no
- Hard refresh required: yes / no
```

Do not write "it appears", "should be visible", or "the code supports this" in place of verified runtime confirmation.

---

## What This Protocol Does NOT Replace

- TypeScript type-checking — still required
- Build verification — still required
- Commit hygiene and branch discipline — still required

This protocol is an **additional gate** that runs after static checks pass. Both layers are required.

---

## Enforcement

This protocol is included in `AGENTS.md`, which is auto-loaded via `CLAUDE.md` into every Claude Code session. It applies to all future sessions, all future features, and all project contributors using Claude Code in this repository.

Full incident context: the 2026-05-19 SAP integration session where the stale server root cause was identified.
