/**
 * GitHub client contract + PURE in-memory mock. The mock lets tests exercise the issue/repo/PR FLOW
 * (which method is called, under which gate) WITHOUT live credentials or network. The real client
 * (`github.ts`, server-only, fetch) implements the same shape. No secrets anywhere here.
 */

export interface GhOpResult {
  ok: boolean;
  url?: string;
  number?: number;
  reason?: string;
}

export interface GithubClient {
  createIssue(owner: string, repo: string, title: string, body: string, labels?: string[]): Promise<GhOpResult>;
  createIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GhOpResult>;
  createRepo(name: string, isPrivate: boolean): Promise<GhOpResult>;
  getIssueStatus(owner: string, repo: string, num: number): Promise<GhOpResult>;
}

/** In-memory mock for tests — records calls and returns deterministic fake URLs. */
export function makeMockGithubClient() {
  const calls: { method: string; args: unknown[] }[] = [];
  let n = 100;
  const client: GithubClient = {
    async createIssue(owner, repo, title, body, labels) {
      calls.push({ method: "createIssue", args: [owner, repo, title, labels] });
      const num = ++n;
      return { ok: true, number: num, url: `https://github.com/${owner}/${repo}/issues/${num}` };
    },
    async createIssueComment(owner, repo, issueNumber, body) {
      calls.push({ method: "createIssueComment", args: [owner, repo, issueNumber, body.slice(0, 20)] });
      return { ok: true, url: `https://github.com/${owner}/${repo}/issues/${issueNumber}#comment-1` };
    },
    async createRepo(name, isPrivate) {
      calls.push({ method: "createRepo", args: [name, isPrivate] });
      return { ok: true, url: `https://github.com/mock/${name}` };
    },
    async getIssueStatus(owner, repo, num) {
      calls.push({ method: "getIssueStatus", args: [owner, repo, num] });
      return { ok: true, number: num, reason: "open", url: `https://github.com/${owner}/${repo}/issues/${num}` };
    },
  };
  return { client, calls };
}
