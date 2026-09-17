import { log } from "./log";

export const LINEAR_TIMEOUT_MS = 10_000;
// Linear rejects a single query above 10,000 complexity points.
const COMPLEXITY_WARNING = 2_000;
const REQUESTS_REMAINING_WARNING = 100;

export interface IssueLabelRef {
  id: string;
  name: string;
}

export interface AttachedIssue {
  id: string;
  identifier: string;
  teamKey: string;
  /** When the issue was completed or canceled; null while it is open. */
  closedAt: string | null;
  /** When this URL was attached to the issue. */
  linkedAt: string;
  /** Labels on the issue that belong to the PR label group. */
  prLabels: IssueLabelRef[];
}

export interface PrLabel extends IssueLabelRef {
  createdAt: string;
}

export interface LinearClient {
  /** Issues that carry an attachment with exactly this URL. */
  attachedIssues(url: string): Promise<AttachedIssue[]>;
  /** When `url` was attached to the issue, or null if it is not attached. */
  linkedAt(issueId: string, url: string): Promise<string | null>;
  /** Active (not archived, not retired) PR-group labels whose name starts with `prefix`. */
  findPrLabels(prefix: string): Promise<PrLabel[]>;
  createPrLabel(input: { name: string; description: string }): Promise<PrLabel>;
  updateIssueLabels(issueId: string, addIds: string[], removeIds: string[]): Promise<void>;
}

export interface LinearClientOptions {
  apiUrl: string;
  apiKey: string;
  prLabelGroupId: string;
  prLabelColor: string;
  fetch?: typeof fetch;
}

// Page sizes multiply complexity: 50 attachments × 5 labels scores about 800.
export const ATTACHED_ISSUES_QUERY = /* GraphQL */ `
  query AttachedIssues($url: String!, $groupId: ID!) {
    attachmentsForURL(url: $url, first: 50) {
      nodes {
        createdAt
        issue {
          id
          identifier
          completedAt
          canceledAt
          team { key }
          labels(first: 5, filter: { parent: { id: { eq: $groupId } } }) {
            nodes { id name parent { id } }
          }
        }
      }
    }
  }
`;

export const ISSUE_LINKED_AT_QUERY = /* GraphQL */ `
  query IssueLinkedAt($id: String!, $url: String!) {
    issue(id: $id) {
      attachments(first: 5, filter: { url: { eq: $url } }) {
        nodes { createdAt }
      }
    }
  }
`;

export const PR_LABELS_QUERY = /* GraphQL */ `
  query PrLabels($groupId: ID!, $prefix: String!) {
    issueLabels(first: 20, filter: { parent: { id: { eq: $groupId } }, name: { startsWith: $prefix } }) {
      nodes { id name createdAt retiredAt parent { id } }
    }
  }
`;

export const CREATE_LABEL_MUTATION = /* GraphQL */ `
  mutation CreatePrLabel($input: IssueLabelCreateInput!) {
    issueLabelCreate(input: $input) {
      success
      issueLabel { id name createdAt }
    }
  }
`;

export const UPDATE_ISSUE_LABELS_MUTATION = /* GraphQL */ `
  mutation UpdateIssueLabels($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) { success }
  }
`;

interface AttachedIssuesData {
  attachmentsForURL: {
    nodes: Array<{
      createdAt: string;
      issue: {
        id: string;
        identifier: string;
        completedAt: string | null;
        canceledAt: string | null;
        team: { key: string };
        labels: { nodes: Array<{ id: string; name: string; parent: { id: string } | null }> };
      } | null;
    }>;
  };
}

interface IssueLinkedAtData {
  issue: { attachments: { nodes: Array<{ createdAt: string }> } };
}

interface PrLabelsData {
  issueLabels: {
    nodes: Array<{
      id: string;
      name: string;
      createdAt: string;
      retiredAt: string | null;
      parent: { id: string } | null;
    }>;
  };
}

interface CreateLabelData {
  issueLabelCreate: { success: boolean; issueLabel: { id: string; name: string; createdAt: string } };
}

interface UpdateIssueData {
  issueUpdate: { success: boolean };
}

export class LinearApiError extends Error {}

export function createLinearClient(options: LinearClientOptions): LinearClient {
  const doFetch = options.fetch ?? fetch;

  async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await doFetch(options.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: options.apiKey,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(LINEAR_TIMEOUT_MS),
    });
    warnOnBudget(response.headers);
    const text = await response.text();
    let payload: { data?: T; errors?: Array<{ message?: string }> } = {};
    try {
      payload = JSON.parse(text);
    } catch {
      // fall through to the status check
    }
    if (!response.ok || payload.errors?.length || !payload.data) {
      const messages = payload.errors?.map((e) => e.message).filter(Boolean).join("; ");
      throw new LinearApiError(`Linear API HTTP ${response.status}${messages ? `: ${messages}` : ""}`);
    }
    return payload.data;
  }

  return {
    async attachedIssues(url) {
      const data = await graphql<AttachedIssuesData>(ATTACHED_ISSUES_QUERY, {
        url,
        groupId: options.prLabelGroupId,
      });
      const byId = new Map<string, AttachedIssue>();
      for (const node of data.attachmentsForURL.nodes) {
        const issue = node.issue;
        if (!issue) continue;
        const seen = byId.get(issue.id);
        if (seen) {
          // The same URL attached twice: the first link counts.
          if (node.createdAt < seen.linkedAt) seen.linkedAt = node.createdAt;
          continue;
        }
        byId.set(issue.id, {
          id: issue.id,
          identifier: issue.identifier.toUpperCase(),
          teamKey: issue.team.key.toUpperCase(),
          closedAt: issue.completedAt ?? issue.canceledAt ?? null,
          linkedAt: node.createdAt,
          prLabels: issue.labels.nodes
            .filter((label) => label.parent?.id === options.prLabelGroupId)
            .map(({ id, name }) => ({ id, name })),
        });
      }
      return [...byId.values()];
    },

    async linkedAt(issueId, url) {
      const data = await graphql<IssueLinkedAtData>(ISSUE_LINKED_AT_QUERY, { id: issueId, url });
      const times = data.issue.attachments.nodes.map((node) => node.createdAt).sort();
      return times[0] ?? null;
    },

    async findPrLabels(prefix) {
      const data = await graphql<PrLabelsData>(PR_LABELS_QUERY, {
        groupId: options.prLabelGroupId,
        prefix,
      });
      return data.issueLabels.nodes
        .filter(
          (label) =>
            label.retiredAt === null &&
            label.parent?.id === options.prLabelGroupId &&
            label.name.startsWith(prefix),
        )
        .map(({ id, name, createdAt }) => ({ id, name, createdAt }));
    },

    async createPrLabel({ name, description }) {
      // The PR group is a workspace label, so the child carries no teamId.
      const data = await graphql<CreateLabelData>(CREATE_LABEL_MUTATION, {
        input: {
          name,
          description,
          color: options.prLabelColor,
          parentId: options.prLabelGroupId,
        },
      });
      if (!data.issueLabelCreate.success) throw new LinearApiError("issueLabelCreate returned success=false");
      return data.issueLabelCreate.issueLabel;
    },

    async updateIssueLabels(issueId, addIds, removeIds) {
      const input: Record<string, string[]> = { addedLabelIds: addIds };
      if (removeIds.length > 0) input.removedLabelIds = removeIds;
      const data = await graphql<UpdateIssueData>(UPDATE_ISSUE_LABELS_MUTATION, { id: issueId, input });
      if (!data.issueUpdate.success) throw new LinearApiError("issueUpdate returned success=false");
    },
  };
}

function warnOnBudget(headers: Headers): void {
  const complexity = Number(headers.get("x-complexity"));
  if (complexity > COMPLEXITY_WARNING) log("warn", { event: "linear_complexity_high", complexity });
  const remaining = headers.get("x-ratelimit-requests-remaining");
  if (remaining !== null && Number(remaining) < REQUESTS_REMAINING_WARNING) {
    log("warn", { event: "linear_requests_low", remaining: Number(remaining) });
  }
}
