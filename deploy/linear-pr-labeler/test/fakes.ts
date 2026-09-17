import type { GitHubClient } from "../src/github";
import type { AttachedIssue, LinearClient, PrLabel } from "../src/linear";
import type { PullRequest } from "../src/pull-request";

export const PR_GROUP_ID = "group-pr";
export const REPO = "AgentFoundry-Labs/kiditem";
export const PR_OPENED_AT = "2026-09-17T12:00:00.000Z";

export function prUrl(number: number): string {
  return `https://github.com/${REPO}/pull/${number}`;
}

export function pullRequest(overrides: Partial<PullRequest> & { number: number }): PullRequest {
  return {
    title: `feat(KID-1): pull request ${overrides.number}`,
    body: "",
    branch: `kid-1-pull-request-${overrides.number}`,
    url: prUrl(overrides.number),
    author: "yhc125",
    state: "open",
    merged: false,
    createdAt: PR_OPENED_AT,
    ...overrides,
  };
}

interface FakeLabel extends PrLabel {
  description: string;
  retired: boolean;
}

interface FakeIssue {
  id: string;
  identifier: string;
  teamKey: string;
  closedAt: string | null;
  labelIds: string[];
}

/**
 * In-memory Linear workspace holding PR-group labels, issues and PR
 * attachments. Like Linear, the PR group is single-select: adding a second PR
 * label to an issue fails. Labels and attachments get increasing timestamps
 * in the order they are made.
 */
export class FakeLinear implements LinearClient {
  readonly labels: FakeLabel[] = [];
  readonly issues = new Map<string, FakeIssue>();
  readonly attachments: Array<{ url: string; issueId: string; createdAt: string }> = [];
  readonly calls: string[] = [];
  /** Number of `createPrLabel` calls that fail before one succeeds. */
  createFailures = 0;
  /** Remaining `updateIssueLabels` failures per issue identifier. */
  readonly updateFailures = new Map<string, number>();
  /** Runs inside `createPrLabel` before the label is made, to simulate a concurrent writer. */
  beforeCreate?: () => void;
  private clock = 0;

  addIssue(
    identifier: string,
    options: { teamKey?: string; labels?: string[]; closedAt?: string | null } = {},
  ): string {
    const id = `uuid-${identifier}`;
    this.issues.set(id, {
      id,
      identifier,
      teamKey: options.teamKey ?? "KID",
      closedAt: options.closedAt ?? null,
      labelIds: (options.labels ?? []).map((name) => this.labelNamed(name).id),
    });
    return id;
  }

  addLabel(name: string, options: { retired?: boolean } = {}): FakeLabel {
    const label: FakeLabel = {
      id: `label-${this.labels.length + 1}`,
      name,
      description: "",
      createdAt: this.tick(),
      retired: options.retired ?? false,
    };
    this.labels.push(label);
    return label;
  }

  /** Links the PR URL to the issue now, or at `createdAt`. */
  attach(url: string, issueId: string, createdAt = this.tick()): void {
    this.attachments.push({ url, issueId, createdAt });
  }

  labelsOf(identifier: string): string[] {
    return this.issueNamed(identifier).labelIds.map((id) => this.labels.find((l) => l.id === id)!.name);
  }

  count(call: string): number {
    return this.calls.filter((c) => c === call).length;
  }

  async attachedIssues(url: string): Promise<AttachedIssue[]> {
    this.calls.push("attachedIssues");
    return this.attachments
      .filter((a) => a.url === url)
      .map((a) => {
        const issue = this.issues.get(a.issueId)!;
        return {
          id: issue.id,
          identifier: issue.identifier,
          teamKey: issue.teamKey,
          closedAt: issue.closedAt,
          linkedAt: a.createdAt,
          prLabels: issue.labelIds.map((id) => {
            const label = this.labels.find((l) => l.id === id)!;
            return { id: label.id, name: label.name };
          }),
        };
      });
  }

  async linkedAt(issueId: string, url: string): Promise<string | null> {
    this.calls.push("linkedAt");
    const times = this.attachments
      .filter((a) => a.issueId === issueId && a.url === url)
      .map((a) => a.createdAt)
      .sort();
    return times[0] ?? null;
  }

  async findPrLabels(prefix: string): Promise<PrLabel[]> {
    this.calls.push("findPrLabels");
    return this.labels
      .filter((l) => !l.retired && l.name.startsWith(prefix))
      .map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  }

  async createPrLabel(input: { name: string; description: string }): Promise<PrLabel> {
    this.calls.push("createPrLabel");
    this.beforeCreate?.();
    if (this.createFailures > 0) {
      this.createFailures -= 1;
      throw new Error("Linear API HTTP 200: label name already exists");
    }
    const label = this.addLabel(input.name);
    label.description = input.description;
    return { id: label.id, name: label.name, createdAt: label.createdAt };
  }

  async updateIssueLabels(issueId: string, addIds: string[], removeIds: string[]): Promise<void> {
    this.calls.push("updateIssueLabels");
    const issue = this.issues.get(issueId);
    if (!issue) throw new Error(`Linear API HTTP 200: Entity not found: ${issueId}`);
    const failures = this.updateFailures.get(issue.identifier) ?? 0;
    if (failures > 0) {
      this.updateFailures.set(issue.identifier, failures - 1);
      throw new Error("Linear API HTTP 503");
    }
    const kept = issue.labelIds.filter((id) => !removeIds.includes(id));
    if (kept.length > 0 && addIds.length > 0) {
      throw new Error("Linear API HTTP 200: issue already has a label from the PR group");
    }
    issue.labelIds = [...kept, ...addIds.filter((id) => !kept.includes(id))];
  }

  private issueNamed(identifier: string): FakeIssue {
    const issue = [...this.issues.values()].find((i) => i.identifier === identifier);
    if (!issue) throw new Error(`no issue ${identifier}`);
    return issue;
  }

  private tick(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 8, 17, 12, 0, this.clock)).toISOString();
  }

  private labelNamed(name: string): FakeLabel {
    return this.labels.find((l) => l.name === name) ?? this.addLabel(name);
  }
}

export class FakeGitHub implements GitHubClient {
  readonly pulls = new Map<number, PullRequest>();
  calls = 0;
  /** Number of calls that fail before one succeeds. */
  failures = 0;

  add(pr: PullRequest): void {
    this.pulls.set(pr.number, pr);
  }

  async getPullRequest(number: number): Promise<PullRequest> {
    this.calls += 1;
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error(`GitHub GET pulls/${number} failed with HTTP 502`);
    }
    const pr = this.pulls.get(number);
    if (!pr) throw new Error(`GitHub GET pulls/${number} failed with HTTP 404`);
    return pr;
  }
}
