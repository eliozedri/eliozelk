# Pilot Finalization Design
**Date:** 2026-05-18  
**Approach:** Hard-gate sequential (A) — each phase must pass before the next begins.  
**Goal:** Finalize the Elkayam ops system as a clean, pilot-ready, multi-user production deployment.

---

## Architecture Invariant (Non-Negotiable)

Supabase is the **only** source of truth for operational business data.  
Browser localStorage is allowed **only** for unsaved UI drafts (`elkayam_order_draft`) and the read-only cost-rates config fallback (`elkayam_cost_rates`).  
No operational table (`work_orders`, `customers`, `work_diaries`, `crews`, `catalog_items`, etc.) may be seeded, restored, or read from any browser storage.

---

## Phase 1 — Verify Repo State
- Report: current branch, git status, latest commit hash, uncommitted changes
- Inspect all untracked files before acting on them
- Add `neural_core_asset_extract_v1/` and `.claude/scheduled_tasks.lock` to `.gitignore` (user-approved)
- Confirm `main` is up to date with `origin/main`
- **Gate:** stop if any unexpected uncommitted change is found

## Phase 2 — Pre-flight Checks
- Run: `npx tsc --noEmit` (typecheck)
- Run: `npx next lint` (lint)
- Run: `npm run build` (build)
- **Gate:** stop and report on any failure; do not proceed to branch/deploy steps until all three pass clean

## Phase 3 — Push Final State to Main
- Verify `main` is at the correct final commit (`e91a280` or later)
- Push to `origin/main` if not already current
- Report final commit hash

## Phase 4 — Create Two Reference Branches
- Check whether `backup-main` and `system-ready-to-go-do-not-touch` already exist locally or remotely
- If they exist: stop and report before overwriting
- If clear: create both from the verified final `main` HEAD
- Push both to `origin`
- Report their commit hashes

## Phase 5 — Old Branch Cleanup
- List all local branches
- List all remote branches
- Classify each: keep / delete / unsure
- For every proposed deletion: report name, last commit hash, merged status, reason
- Only delete branches that are: merged into main, clearly obsolete, and already preserved in main/backup branches
- Stop and ask if any branch has unmerged work

## Phase 6 — Supabase Verification
- Confirm the Supabase project used by local app, Vercel env, cleanup scripts, and migrations is the same
- Verify all migrations applied (check migration files vs. applied state)
- Run row counts for all 22 operational tables — must all be 0
- Run row counts for all master data tables — agents, equipment, catalog_items, cost_rates, profiles, counters
- Verify counters: order=0, diary=0
- **Gate:** if any operational table has rows, delete them and re-verify before continuing

## Phase 7 — Browser / localStorage Safety Verification
- Grep codebase for any remaining `localStorage`/`sessionStorage` reads of operational keys
- Confirm `loadLocal`, `saveLocal`, `readCache`, `warmCache`, `STORAGE_KEY` for operational modules are gone
- Confirm no mock/demo/hardcoded operational data in components
- Confirm `elkayam_order_draft` and `elkayam_cost_rates` are the only remaining localStorage keys in use
- **Gate:** if any new localStorage-to-Supabase seeding path is found, stop and fix before deploying

## Phase 8 — Deploy to Vercel
- Deploy from final `main` commit using `vercel --prod`
- Verify build success and `readyState: READY`
- Verify deployment URL
- Verify Vercel environment variables point to the same Supabase project (check `NEXT_PUBLIC_SUPABASE_URL`)
- Provide browser verification checklist for user

## Phase 9 — Final Readiness Report
Complete report covering: git state, test/build results, Supabase state, localStorage safety, Vercel deployment, pilot readiness, remaining risks, and a clear "safe / not safe" recommendation.

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| main is clean and buildable | ✓ |
| backup-main exists at same commit | ✓ |
| system-ready-to-go-do-not-touch exists at same commit | ✓ |
| All 22 operational tables = 0 rows | ✓ |
| Master data preserved | agents=12, equipment=19, catalog=37, cost_rates=1, profiles=4 |
| Counters | order=0, diary=0 |
| No localStorage seeding paths | ✓ |
| Vercel deployment live | ✓ |
| TypeScript clean | 0 errors |
| Lint clean | 0 errors |
| Build clean | success |
