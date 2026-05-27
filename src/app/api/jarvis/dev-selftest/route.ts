import { NextRequest, NextResponse } from "next/server";
import {
  detectGitHubConfig, githubStatus, loadGithubConfig,
  createIssue, createIssueComment, listWorkflowRuns, getRunJobs, getJobLogsTail,
} from "@/lib/jarvis/skills/development/github";
import { claudeExecutionMode, claudeStatusNote } from "@/lib/jarvis/skills/development/claudeCode";

/**
 * Owner-only DEV self-test (CRON_SECRET bearer — never public). Verifies the live GitHub + Claude
 * Code wiring WITHOUT exposing secrets (the token stays server-side; only status + public URLs are
 * returned). GET = status. POST = a real, non-destructive test: create an issue / comment @claude.
 * It does NOT push to main, deploy, or change config. Safe to delete after verification.
 */

function authed(req: NextRequest): { ok: boolean; status?: number; error?: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: "self-test disabled (no CRON_SECRET)" };
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const a = authed(req);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const cfg = loadGithubConfig();
  const runJobsId = req.nextUrl.searchParams.get("runJobs");
  if (runJobsId) {
    const jobs = await getRunJobs(cfg.owner ?? "", cfg.repo ?? "", Number(runJobsId));
    return NextResponse.json({ runJobs: jobs.ok ? jobs.jobs : { error: jobs.reason } });
  }
  const jobLogsId = req.nextUrl.searchParams.get("jobLogs");
  if (jobLogsId) {
    const logs = await getJobLogsTail(cfg.owner ?? "", cfg.repo ?? "", Number(jobLogsId), 2500);
    return NextResponse.json({ jobLogs: logs.ok ? logs.logTail : { error: logs.reason } });
  }
  const runs = await listWorkflowRuns(cfg.owner ?? "", cfg.repo ?? "", 5);
  return NextResponse.json({
    githubConfig: detectGitHubConfig(),
    githubStatus: githubStatus(),
    claudeMode: claudeExecutionMode(),
    claudeNote: claudeStatusNote(),
    recentWorkflowRuns: runs.ok ? runs.runs : { error: runs.reason },
  });
}

export async function POST(req: NextRequest) {
  const a = authed(req);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const cfg = loadGithubConfig();
  if (!cfg.owner || !cfg.repo) return NextResponse.json({ ok: false, error: "missing GITHUB_OWNER/GITHUB_REPO" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { action?: string; issueNumber?: number; task?: string };

  if (body.action === "create_issue") {
    const res = await createIssue(
      cfg.owner, cfg.repo,
      "[Jarvis self-test] connectivity check",
      "Automated Jarvis self-test issue (safe, read-only intent). You can close this.\n\n" +
      "To test Claude Code: POST action=comment_claude with this issue number.",
      ["jarvis", "self-test"],
    );
    return NextResponse.json({ ok: res.ok, action: "create_issue", issue_url: res.url ?? null, number: res.number ?? null, reason: res.reason ?? null });
  }

  if (body.action === "comment_claude") {
    if (!body.issueNumber) return NextResponse.json({ ok: false, error: "issueNumber required" }, { status: 400 });
    const task = body.task ?? "READ-ONLY: reply in a single comment with a one-line summary of this repository's purpose. Do NOT modify files, do NOT open a PR.";
    const res = await createIssueComment(cfg.owner, cfg.repo, body.issueNumber, `@claude ${task}`);
    return NextResponse.json({ ok: res.ok, action: "comment_claude", comment_url: res.url ?? null, reason: res.reason ?? null });
  }

  return NextResponse.json({ ok: false, error: "unknown action (use create_issue | comment_claude)" }, { status: 400 });
}
