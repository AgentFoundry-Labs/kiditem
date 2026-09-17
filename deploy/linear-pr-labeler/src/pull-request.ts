// What a pull request says about the Linear issues it completes, and how its
// PR label is named. The word lists follow Linear's GitHub integration
// (https://linear.app/docs/github, checked 2026-09-18).

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  branch: string;
  url: string;
  author: string;
  state: "open" | "closed";
  merged: boolean;
  /** ISO time the PR was opened. */
  createdAt: string;
}

/** Link the issue and complete it when the PR merges. */
export const CLOSING_WORDS = [
  "close", "closes", "closed", "closing",
  "fix", "fixes", "fixed", "fixing",
  "resolve", "resolves", "resolved", "resolving",
  "complete", "completes", "completed", "completing",
  "implement", "implements", "implemented", "implementing",
  "linear issue",
];

/** Link the issue without completing it on merge. */
export const CONTRIBUTING_WORDS = [
  "ref", "refs", "references", "part of", "contributes to", "toward", "towards",
];

/** Mark the PR as related, with no status change. */
export const RELATION_WORDS = ["relates to", "related to"];

const SHORT_TITLE_MAX = 40;
const DESCRIPTION_TITLE_MAX = 120;

// An issue key of any team, standing alone like Linear's `\b` matching.
const ANY_ISSUE_KEY = String.raw`[A-Za-z][A-Za-z0-9]*-\d+(?![A-Za-z0-9_])`;
const LIST_ITEM = String.raw`[*_\x60\[]*` + ANY_ISSUE_KEY + String.raw`[*_\x60\]]*`;
const LIST_SEPARATOR = String.raw`\s*(?:,\s*(?:and\s+)?|&\s*|and\s+)`;
const ISSUE_LIST = `${LIST_ITEM}(?:${LIST_SEPARATOR}${LIST_ITEM})*`;

export function parsePullRequestUrl(url: unknown, repo: string): number | null {
  if (typeof url !== "string") return null;
  const match = /^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(url);
  if (!match || match[1].toLowerCase() !== repo.toLowerCase()) return null;
  const number = Number(match[2]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function prLabelPrefix(prNumber: number): string {
  return `#${prNumber} `;
}

/** The URL the GitHub integration attaches to Linear issues. */
export function pullRequestUrl(repo: string, prNumber: number): string {
  return `https://github.com/${repo}/pull/${prNumber}`;
}

/**
 * Issue identifiers (upper case) the pull request completes on merge. Linear
 * reads magic words in both the title and the body:
 * - an issue after a closing word is completed;
 * - an issue named in the branch or title is completed too, unless a
 *   contributing or relation word names it;
 * - a closing word wins when the same issue is also named after another word.
 * The title and body are read separately, and HTML comments are ignored.
 */
export function completedIssueIds(pr: PullRequest, teamKey: string): Set<string> {
  const texts = [pr.title, pr.body.replace(/<!--[\s\S]*?(?:-->|$)/g, " ")];
  const closing = new Set(texts.flatMap((text) => idsAfterWords(text, CLOSING_WORDS, teamKey)));
  const linkOnly = new Set(
    texts.flatMap((text) => idsAfterWords(text, [...CONTRIBUTING_WORDS, ...RELATION_WORDS], teamKey)),
  );
  const completed = new Set(closing);
  for (const id of [...idsIn(pr.branch, teamKey), ...idsIn(pr.title, teamKey)]) {
    if (!linkOnly.has(id)) completed.add(id);
  }
  return completed;
}

export function shortTitle(pr: PullRequest, teamKey: string): string {
  const lastSegment = pr.branch.split("/").pop() ?? "";
  const issuePrefix = new RegExp(`^${escapeRegExp(teamKey)}-\\d+-?`, "i");
  const branchWords = issuePrefix.test(lastSegment)
    ? lastSegment.replace(issuePrefix, "").split(/[-_]+/).filter(Boolean).join(" ")
    : "";
  const titleWords = pr.title.replace(/^[a-z]+(?:\([^)]*\))?!?:\s*/i, "").trim();
  const words = branchWords || titleWords || `PR ${pr.number}`;
  const clipped = clip(words, SHORT_TITLE_MAX);
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

export function labelDescription(pr: PullRequest): string {
  const title = clip(pr.title, DESCRIPTION_TITLE_MAX);
  return `${pr.url} — ${title === pr.title ? title : `${title}…`} · ${pr.author}`;
}

function idsIn(text: string, teamKey: string): string[] {
  const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(teamKey)}-(\\d+)(?![A-Za-z0-9_])`, "gi");
  return [...text.matchAll(re)].map((m) => `${teamKey.toUpperCase()}-${Number(m[1])}`);
}

function idsAfterWords(text: string, words: string[], teamKey: string): string[] {
  const phrase = words.map((w) => w.split(" ").map(escapeRegExp).join("\\s+")).join("|");
  // `Fixes KID-1`, `Fixes: KID-1`, `**Fixes** KID-1`, `**Fixes:** KID-1`
  const re = new RegExp(`(?<![A-Za-z0-9_])(?:${phrase})[*_]*(?::[*_]*\\s*|\\s+)(${ISSUE_LIST})`, "gi");
  return [...text.matchAll(re)].flatMap((match) => idsIn(match[1], teamKey));
}

function clip(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const cut = chars.slice(0, max).join("");
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
