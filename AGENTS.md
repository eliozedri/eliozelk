<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:runtime-ui-verification -->
## Runtime UI Verification Protocol

**Applies to every session.** Any change involving sidebar links, navigation items, new routes, permission-gated UI, role-based visibility, DB-driven access control (allowed_tabs, action_permissions), or feature flags requires runtime verification before the feature is reported as complete.

**Static success is not enough.** Code correct + TypeScript passing + build passing + commit existing + route file present ≠ feature visible to the user.

**Before reporting any in-scope feature as complete, verify ALL of the following:**

1. `git branch --show-current` — confirm correct branch
2. `git log --oneline -3` — confirm latest commit includes the change
3. `lsof -ti :3000` — confirm dev server is running
4. `lsof -p <PID> | grep cwd` — confirm server is running from the correct directory
5. Server was started AFTER the relevant code changes — restart if uncertain
6. `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/<route>` — confirm route returns expected status
7. UI element is actually rendered in the running app — navigate to the parent page and confirm
8. Role/permission check passes at runtime for the target user (especially master/admin roles)
9. If feature uses `allowed_tabs` or `action_permissions`: verify the live Supabase `profiles` row, not only code-level bypasses
10. Instruct user to hard refresh (`Cmd+Shift+R`) after any server restart

**When code is correct but UI does not reflect it, suspect in order:** stale dev server (started before the fix) → stale HMR (partial hot update) → stale browser cache → wrong branch → DB-driven permission mismatch → wrong deployment.

**Restart procedure when stale runtime detected:**
```bash
kill $(lsof -ti :3000); sleep 1; npm run dev &
# wait for ✓ Ready, then instruct user: Cmd+Shift+R
```

**Completion report must include:**
- Branch, latest commit hash, server PID/port
- Whether server was restarted
- Route HTTP status
- Feature visible in active UI: yes (verified) / no (reason)
- Permissions verified at runtime: yes/no

Do not write "should be visible", "it appears", or "the code supports this" in place of verified runtime confirmation.

Full spec: `docs/superpowers/specs/2026-05-19-runtime-ui-verification-protocol.md`
<!-- END:runtime-ui-verification -->
