import type { PullRequest } from "./pull-request";

export const GITHUB_TIMEOUT_MS = 10_000;

export interface GitHubClient {
  getPullRequest(number: number): Promise<PullRequest>;
}

export interface GitHubClientOptions {
  apiUrl: string;
  repo: string;
  token: string;
  fetch?: typeof fetch;
}

interface PullResponse {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  created_at: string;
  merged_at: string | null;
  html_url: string;
  head: { ref: string };
  user: { login: string } | null;
}

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const doFetch = options.fetch ?? fetch;
  return {
    async getPullRequest(number) {
      const response = await doFetch(`${options.apiUrl}/repos/${options.repo}/pulls/${number}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${options.token}`,
          "User-Agent": "linear-pr-labeler",
          "X-GitHub-Api-Version": "2026-03-10",
        },
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`GitHub GET pulls/${number} failed with HTTP ${response.status}`);
      }
      const pull = (await response.json()) as PullResponse;
      return {
        number: pull.number,
        title: pull.title,
        body: pull.body ?? "",
        branch: pull.head.ref,
        url: pull.html_url,
        author: pull.user?.login ?? "unknown",
        state: pull.state,
        merged: pull.merged_at !== null,
        createdAt: pull.created_at,
      };
    },
  };
}
