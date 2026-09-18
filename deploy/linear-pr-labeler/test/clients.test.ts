import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "../src/github";
import { createLinearClient, LinearApiError } from "../src/linear";

interface Captured {
  url: string;
  init: RequestInit;
  body: { query: string; variables: Record<string, unknown> };
}

interface FakeResponse {
  status?: number;
  json: unknown;
  headers?: Record<string, string>;
}

function fakeFetch(responses: FakeResponse[]) {
  const captured: Captured[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    captured.push({
      url: String(input),
      init: init ?? {},
      body: init?.body ? JSON.parse(String(init.body)) : { query: "", variables: {} },
    });
    return new Response(JSON.stringify(next.json), {
      status: next.status ?? 200,
      headers: { "Content-Type": "application/json", ...next.headers },
    });
  }) as typeof fetch;
  return { fn, captured };
}

const GROUP = "group-pr";

function linearWith(responses: FakeResponse[]) {
  const { fn, captured } = fakeFetch(responses);
  const client = createLinearClient({
    apiUrl: "https://linear.test/graphql",
    apiKey: "lin_api_test_key",
    prLabelGroupId: GROUP,
    prLabelColor: "#5e6ad2",
    fetch: fn,
  });
  return { client, captured };
}

function issueNode(overrides: Record<string, unknown>) {
  return {
    id: "i1",
    identifier: "KID-1",
    completedAt: null,
    canceledAt: null,
    team: { key: "KID" },
    labels: { nodes: [] },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Linear client", () => {
  it("sends the personal API key as-is and reads attached issues with their PR labels", async () => {
    const { client, captured } = linearWith([
      {
        json: {
          data: {
            attachmentsForURL: {
              nodes: [
                {
                  createdAt: "2026-09-17T12:05:00.000Z",
                  issue: issueNode({
                    identifier: "kid-1",
                    team: { key: "kid" },
                    completedAt: "2026-09-17T13:00:00.000Z",
                    labels: {
                      nodes: [
                        { id: "l1", name: "#9 Old", parent: { id: GROUP } },
                        { id: "l3", name: "Bug", parent: { id: "category" } },
                      ],
                    },
                  }),
                },
                { createdAt: "2026-09-17T12:01:00.000Z", issue: issueNode({ id: "i1" }) },
                {
                  createdAt: "2026-09-17T12:02:00.000Z",
                  issue: issueNode({ id: "i2", identifier: "KID-2", canceledAt: "2026-09-10T00:00:00.000Z" }),
                },
                { createdAt: "2026-09-17T12:03:00.000Z", issue: null },
              ],
            },
          },
        },
      },
    ]);

    const issues = await client.attachedIssues("https://github.com/o/r/pull/9");

    expect(issues).toEqual([
      {
        id: "i1",
        identifier: "KID-1",
        teamKey: "KID",
        closedAt: "2026-09-17T13:00:00.000Z",
        linkedAt: "2026-09-17T12:01:00.000Z",
        prLabels: [{ id: "l1", name: "#9 Old" }],
      },
      {
        id: "i2",
        identifier: "KID-2",
        teamKey: "KID",
        closedAt: "2026-09-10T00:00:00.000Z",
        linkedAt: "2026-09-17T12:02:00.000Z",
        prLabels: [],
      },
    ]);
    expect(captured[0].url).toBe("https://linear.test/graphql");
    expect(new Headers(captured[0].init.headers).get("authorization")).toBe("lin_api_test_key");
    expect(captured[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(captured[0].body.query).toContain("labels(first: 5, filter: { parent: { id: { eq: $groupId } } })");
    expect(captured[0].body.variables).toEqual({ url: "https://github.com/o/r/pull/9", groupId: GROUP });
  });

  it("reads when a URL was first attached to an issue", async () => {
    const { client, captured } = linearWith([
      {
        json: {
          data: {
            issue: {
              attachments: {
                nodes: [{ createdAt: "2026-09-17T12:09:00.000Z" }, { createdAt: "2026-09-17T12:04:00.000Z" }],
              },
            },
          },
        },
      },
      { json: { data: { issue: { attachments: { nodes: [] } } } } },
    ]);

    await expect(client.linkedAt("i1", "https://github.com/o/r/pull/8")).resolves.toBe("2026-09-17T12:04:00.000Z");
    await expect(client.linkedAt("i1", "https://github.com/o/r/pull/7")).resolves.toBeNull();
    expect(captured[0].body.query).toContain("attachments(first: 5, filter: { url: { eq: $url } })");
    expect(captured[0].body.variables).toEqual({ id: "i1", url: "https://github.com/o/r/pull/8" });
  });

  it("filters PR labels to active children of the group that start with the prefix", async () => {
    const { client, captured } = linearWith([
      {
        json: {
          data: {
            issueLabels: {
              nodes: [
                { id: "a", name: "#9 Keep", createdAt: "2026-09-17T00:00:00Z", retiredAt: null, parent: { id: GROUP } },
                { id: "b", name: "#9 Retired", createdAt: "2026-09-16T00:00:00Z", retiredAt: "2026-09-17T00:00:00Z", parent: { id: GROUP } },
                { id: "c", name: "#9 Elsewhere", createdAt: "2026-09-16T00:00:00Z", retiredAt: null, parent: { id: "x" } },
                { id: "d", name: "#99 Other", createdAt: "2026-09-16T00:00:00Z", retiredAt: null, parent: { id: GROUP } },
              ],
            },
          },
        },
      },
    ]);

    await expect(client.findPrLabels("#9 ")).resolves.toEqual([
      { id: "a", name: "#9 Keep", createdAt: "2026-09-17T00:00:00Z" },
    ]);
    expect(captured[0].body.variables).toEqual({ groupId: GROUP, prefix: "#9 " });
  });

  it("creates the label under the workspace PR group without a team", async () => {
    const { client, captured } = linearWith([
      {
        json: {
          data: {
            issueLabelCreate: { success: true, issueLabel: { id: "n", name: "#9 New", createdAt: "2026-09-17T00:00:00Z" } },
          },
        },
      },
    ]);

    await expect(client.createPrLabel({ name: "#9 New", description: "d" })).resolves.toEqual({
      id: "n",
      name: "#9 New",
      createdAt: "2026-09-17T00:00:00Z",
    });
    expect(captured[0].body.variables).toEqual({
      input: { name: "#9 New", description: "d", color: "#5e6ad2", parentId: GROUP },
    });
  });

  it("adds labels and removes stale ones only when there are any", async () => {
    const { client, captured } = linearWith([
      { json: { data: { issueUpdate: { success: true } } } },
      { json: { data: { issueUpdate: { success: true } } } },
    ]);

    await client.updateIssueLabels("i1", ["new"], []);
    await client.updateIssueLabels("i1", ["new"], ["old"]);

    expect(captured[0].body.variables).toEqual({ id: "i1", input: { addedLabelIds: ["new"] } });
    expect(captured[1].body.variables).toEqual({ id: "i1", input: { addedLabelIds: ["new"], removedLabelIds: ["old"] } });
  });

  it("turns GraphQL errors and HTTP failures into errors that never echo the key", async () => {
    const { client } = linearWith([
      { json: { errors: [{ message: "Entity not found" }] } },
      { status: 401, json: { errors: [{ message: "Authentication required" }] } },
      { json: { data: { issueUpdate: { success: false } } } },
    ]);

    await expect(client.attachedIssues("u")).rejects.toThrow(new LinearApiError("Linear API HTTP 200: Entity not found"));
    const failure = client.findPrLabels("#1 ").catch((e: Error) => e.message);
    await expect(failure).resolves.toBe("Linear API HTTP 401: Authentication required");
    await expect(failure).resolves.not.toContain("lin_api_test_key");
    await expect(client.updateIssueLabels("i", ["l"], [])).rejects.toThrow(/success=false/);
  });

  it("warns when a query is expensive or the hourly request budget runs low", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = linearWith([
      { json: { data: { issueUpdate: { success: true } } }, headers: { "X-Complexity": "2500" } },
      { json: { data: { issueUpdate: { success: true } } }, headers: { "X-RateLimit-Requests-Remaining": "40" } },
      { json: { data: { issueUpdate: { success: true } } }, headers: { "X-Complexity": "12", "X-RateLimit-Requests-Remaining": "2400" } },
    ]);

    await client.updateIssueLabels("i", ["l"], []);
    await client.updateIssueLabels("i", ["l"], []);
    await client.updateIssueLabels("i", ["l"], []);

    expect(warn.mock.calls.map((call) => JSON.parse(String(call[0])))).toEqual([
      { event: "linear_complexity_high", complexity: 2500 },
      { event: "linear_requests_low", remaining: 40 },
    ]);
  });
});

describe("GitHub client", () => {
  it("reads a pull request with a bearer token and maps the fields", async () => {
    const { fn, captured } = fakeFetch([
      {
        json: {
          number: 544,
          title: "refactor(KID-250): registry",
          body: null,
          state: "closed",
          created_at: "2026-09-17T12:00:00Z",
          merged_at: "2026-09-17T13:57:00Z",
          html_url: "https://github.com/AgentFoundry-Labs/kiditem/pull/544",
          head: { ref: "kid-250-channel-registry" },
          user: { login: "yhc125" },
        },
      },
    ]);
    const client = createGitHubClient({
      apiUrl: "https://github.test",
      repo: "AgentFoundry-Labs/kiditem",
      token: "github_pat_test",
      fetch: fn,
    });

    await expect(client.getPullRequest(544)).resolves.toEqual({
      number: 544,
      title: "refactor(KID-250): registry",
      body: "",
      branch: "kid-250-channel-registry",
      url: "https://github.com/AgentFoundry-Labs/kiditem/pull/544",
      author: "yhc125",
      state: "closed",
      merged: true,
      createdAt: "2026-09-17T12:00:00Z",
    });
    const headers = new Headers(captured[0].init.headers);
    expect(captured[0].url).toBe("https://github.test/repos/AgentFoundry-Labs/kiditem/pulls/544");
    expect(headers.get("authorization")).toBe("Bearer github_pat_test");
    expect(headers.get("user-agent")).toBe("linear-pr-labeler");
    expect(headers.get("accept")).toBe("application/vnd.github+json");
    expect(captured[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails with the HTTP status and without the token", async () => {
    const { fn } = fakeFetch([{ status: 403, json: { message: "Resource not accessible by personal access token" } }]);
    const client = createGitHubClient({ apiUrl: "https://github.test", repo: "o/r", token: "github_pat_test", fetch: fn });

    const message = await client.getPullRequest(1).catch((e: Error) => e.message);
    expect(message).toBe("GitHub GET pulls/1 failed with HTTP 403");
  });
});
