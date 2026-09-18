import type { GitHubClient } from "./github";
import type { AttachedIssue, LinearClient, PrLabel } from "./linear";
import { errorMessage } from "./log";
import {
  completedIssueIds,
  labelDescription,
  prLabelPrefix,
  pullRequestUrl,
  shortTitle,
  type PullRequest,
} from "./pull-request";

export interface ReconcileJob {
  prNumber: number;
  /** Canonical PR URL, as the GitHub integration attaches it. */
  prUrl: string;
  /** Attachment webhook action that triggered the run. */
  action: "create" | "update";
  /** Issue (UUID) whose attachment triggered the run. */
  issueId: string;
  /** `Linear-Delivery` header, for logs. */
  delivery?: string;
}

export interface ReconcileDeps {
  linear: LinearClient;
  github: GitHubClient;
  teamKey: string;
  /** `owner/name` of the repository whose PR URLs the labels point at. */
  repo: string;
}

export type ReconcileOutcome =
  | "nothing-to-do"
  | "pr-closed-unmerged"
  | "no-completed-issues"
  | "labelled";

export interface ReconcileResult {
  outcome: ReconcileOutcome;
  label?: string;
  createdLabel?: boolean;
  /** A label this run created but did not use, because an older one appeared meanwhile. */
  orphanedLabel?: string;
  added: string[];
  replaced: string[];
  /** Issues that keep the label of a PR linked to them after this one. */
  keptNewerPr: string[];
  /** Issues the PR names that were already completed or canceled before it opened. */
  closedBeforePr: string[];
  failed: Array<{ issue: string; message: string }>;
}

/**
 * Brings every issue attached to the pull request in line with the rule
 * "each issue a PR completes carries the label of the PR linked to it last":
 * - an issue that already has this PR's `#<number> ` label is left alone;
 * - an issue without any PR label gets this PR's label;
 * - an issue with another PR's label is switched only when this PR was
 *   attached to it after that PR;
 * - an issue that was completed or canceled before this PR opened is only a
 *   reference and keeps its labels.
 * A run reads the current state and does not depend on which delivery started
 * it, so late, retried and replayed deliveries all settle on the same labels.
 */
export async function reconcilePullRequest(
  job: ReconcileJob,
  deps: ReconcileDeps,
): Promise<ReconcileResult> {
  const teamKey = deps.teamKey.toUpperCase();
  const prefix = prLabelPrefix(job.prNumber);
  const attached = (await deps.linear.attachedIssues(job.prUrl)).filter(
    (issue) => issue.teamKey === teamKey,
  );

  const candidates: AttachedIssue[] = [];
  const keptNewerPr: string[] = [];
  const failed: ReconcileResult["failed"] = [];
  for (const issue of attached) {
    if (issue.prLabels.some((label) => label.name.startsWith(prefix))) continue;
    try {
      if (await linkedAfterCurrentLabels(issue, deps)) candidates.push(issue);
      else keptNewerPr.push(issue.identifier);
    } catch (error) {
      failed.push({ issue: issue.identifier, message: errorMessage(error) });
    }
  }
  const partial = { keptNewerPr, failed };
  if (candidates.length === 0) return { ...result("nothing-to-do"), ...partial };

  const pr = await deps.github.getPullRequest(job.prNumber);
  if (pr.state === "closed" && !pr.merged) return { ...result("pr-closed-unmerged"), ...partial };

  const completed = completedIssueIds(pr, teamKey);
  const openedAt = Date.parse(pr.createdAt);
  const named = candidates.filter((issue) => completed.has(issue.identifier));
  const isReference = (issue: AttachedIssue) =>
    issue.closedAt !== null && Date.parse(issue.closedAt) < openedAt;
  const closedBeforePr = named.filter(isReference).map((issue) => issue.identifier);
  const targets = named.filter((issue) => !isReference(issue));
  if (targets.length === 0) {
    return { ...result("no-completed-issues"), ...partial, closedBeforePr };
  }

  const { label, created, orphaned } = await findOrCreateLabel(prefix, pr, deps);
  const added: string[] = [];
  const replaced: string[] = [];
  for (const issue of targets) {
    const staleIds = issue.prLabels.map((l) => l.id);
    try {
      await deps.linear.updateIssueLabels(issue.id, [label.id], staleIds);
    } catch (error) {
      failed.push({ issue: issue.identifier, message: errorMessage(error) });
      continue;
    }
    (staleIds.length > 0 ? replaced : added).push(issue.identifier);
  }
  return {
    outcome: "labelled",
    label: label.name,
    createdLabel: created,
    ...(orphaned ? { orphanedLabel: orphaned } : {}),
    added,
    replaced,
    keptNewerPr,
    closedBeforePr,
    failed,
  };
}

function result(outcome: ReconcileOutcome): ReconcileResult {
  return { outcome, added: [], replaced: [], keptNewerPr: [], closedBeforePr: [], failed: [] };
}

/** True when this PR was attached after every PR whose label the issue carries. */
async function linkedAfterCurrentLabels(issue: AttachedIssue, deps: ReconcileDeps): Promise<boolean> {
  const ours = Date.parse(issue.linkedAt);
  for (const label of issue.prLabels) {
    const other = /^#(\d+) /.exec(label.name)?.[1];
    // A PR-group label without a number (an old "Planned:" label) belongs to no PR.
    if (!other) continue;
    const otherLinkedAt = await deps.linear.linkedAt(issue.id, pullRequestUrl(deps.repo, Number(other)));
    if (otherLinkedAt !== null && Date.parse(otherLinkedAt) >= ours) return false;
  }
  return true;
}

async function findOrCreateLabel(
  prefix: string,
  pr: PullRequest,
  deps: ReconcileDeps,
): Promise<{ label: PrLabel; created: boolean; orphaned?: string }> {
  const existing = await deps.linear.findPrLabels(prefix);
  if (existing.length > 0) return { label: oldest(existing), created: false };
  let label: PrLabel;
  try {
    label = await deps.linear.createPrLabel({
      name: `${prefix}${shortTitle(pr, deps.teamKey)}`,
      description: labelDescription(pr),
    });
  } catch (error) {
    // Someone may have created one in the meantime (for example a session by hand).
    const again = await deps.linear.findPrLabels(prefix);
    if (again.length > 0) return { label: oldest(again), created: false };
    throw error;
  }
  // A session may have created its own label while ours was being made; the
  // oldest one wins so every issue of the PR ends up with the same label.
  const all = await deps.linear.findPrLabels(prefix);
  const winner = all.length > 0 ? oldest(all) : label;
  if (winner.id === label.id) return { label, created: true };
  return { label: winner, created: false, orphaned: label.name };
}

function oldest(labels: PrLabel[]): PrLabel {
  return [...labels].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}
