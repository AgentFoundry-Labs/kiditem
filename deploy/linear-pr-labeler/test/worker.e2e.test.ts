// Runs the Worker from wrangler.jsonc in the local Workers runtime, with its
// Durable Object, and points its Linear and GitHub calls at a local HTTP fake.
import { createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import type { PullRequest } from "../src/pull-request";
import { FakeLinear, PR_GROUP_ID, prUrl, pullRequest, REPO } from "./fakes";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = "lin_wh_e2e_secret";
const LINEAR_KEY = "lin_api_e2e";
const GITHUB_TOKEN = "github_pat_e2e";
const LATENCY_MS = 40;

let harness: ReturnType<typeof createTestHarness>;
let fakeApi: Server;
let linear = new FakeLinear();
const pulls = new Map<number, PullRequest>();
const githubCalls = new Map<number, number>();
const githubFailures = new Map<number, number>();
const unexpected: string[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function linearGraphql(req: IncomingMessage, res: ServerResponse) {
  if (req.headers.authorization !== LINEAR_KEY) return send(res, 401, { errors: [{ message: "bad key" }] });
  const { query, variables } = JSON.parse(await readBody(req));
  const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
  await sleep(LATENCY_MS);
  try {
    switch (operation) {
      case "AttachedIssues": {
        if (variables.groupId !== PR_GROUP_ID) throw new Error("wrong group");
        const issues = await linear.attachedIssues(variables.url);
        return send(res, 200, {
          data: {
            attachmentsForURL: {
              nodes: issues.map((issue) => ({
                createdAt: issue.linkedAt,
                issue: {
                  id: issue.id,
                  identifier: issue.identifier,
                  completedAt: issue.closedAt,
                  canceledAt: null,
                  team: { key: issue.teamKey },
                  labels: { nodes: issue.prLabels.map((l) => ({ ...l, parent: { id: PR_GROUP_ID } })) },
                },
              })),
            },
          },
        });
      }
      case "IssueLinkedAt": {
        const at = await linear.linkedAt(variables.id, variables.url);
        return send(res, 200, { data: { issue: { attachments: { nodes: at ? [{ createdAt: at }] : [] } } } });
      }
      case "PrLabels": {
        const labels = await linear.findPrLabels(variables.prefix);
        return send(res, 200, {
          data: {
            issueLabels: { nodes: labels.map((l) => ({ ...l, retiredAt: null, parent: { id: variables.groupId } })) },
          },
        });
      }
      case "CreatePrLabel": {
        if (variables.input.parentId !== PR_GROUP_ID || "teamId" in variables.input) throw new Error("wrong parent");
        const label = await linear.createPrLabel(variables.input);
        return send(res, 200, { data: { issueLabelCreate: { success: true, issueLabel: label } } });
      }
      case "UpdateIssueLabels": {
        await linear.updateIssueLabels(
          variables.id,
          variables.input.addedLabelIds,
          variables.input.removedLabelIds ?? [],
        );
        return send(res, 200, { data: { issueUpdate: { success: true } } });
      }
      default:
        unexpected.push(`graphql ${operation}`);
        return send(res, 200, { errors: [{ message: "unknown operation" }] });
    }
  } catch (error) {
    return send(res, 200, { errors: [{ message: (error as Error).message }] });
  }
}

async function github(req: IncomingMessage, res: ServerResponse, number: number) {
  if (req.headers.authorization !== `Bearer ${GITHUB_TOKEN}`) return send(res, 401, { message: "Bad credentials" });
  githubCalls.set(number, (githubCalls.get(number) ?? 0) + 1);
  await sleep(LATENCY_MS);
  const failures = githubFailures.get(number) ?? 0;
  if (failures > 0) {
    githubFailures.set(number, failures - 1);
    return send(res, 502, { message: "Bad Gateway" });
  }
  const pr = pulls.get(number);
  if (!pr) return send(res, 404, { message: "Not Found" });
  return send(res, 200, {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    created_at: pr.createdAt,
    merged_at: pr.merged ? "2026-09-17T15:00:00Z" : null,
    html_url: pr.url,
    head: { ref: pr.branch },
    user: { login: pr.author },
  });
}

function route(req: IncomingMessage, res: ServerResponse) {
  const path = req.url ?? "";
  if (req.method === "POST" && path === "/graphql") return linearGraphql(req, res);
  const pull = new RegExp(`^/github/repos/${REPO}/pulls/(\\d+)$`).exec(path);
  if (req.method === "GET" && pull) return github(req, res, Number(pull[1]));
  unexpected.push(`${req.method} ${path}`);
  return send(res, 404, { message: "unexpected" });
}

type HarnessRequestInit = Parameters<ReturnType<typeof createTestHarness>["fetch"]>[1];

function signedDelivery(payload: unknown, secret = SECRET): HarnessRequestInit {
  const body = JSON.stringify(payload);
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Linear-Delivery": randomUUID(),
      "Linear-Signature": createHmac("sha256", secret).update(body).digest("hex"),
    },
    body,
  };
}

function attachmentEvent(action: "create" | "update", prNumber: number, issueId: string, sentAt = Date.now()) {
  return {
    action,
    type: "Attachment",
    webhookTimestamp: sentAt,
    data: { id: randomUUID(), url: prUrl(prNumber), issueId, title: `PR ${prNumber}` },
  };
}

async function deliver(action: "create" | "update", prNumber: number, issueId: string, sentAt?: number) {
  const response = await harness.fetch("/linear", signedDelivery(attachmentEvent(action, prNumber, issueId, sentAt)));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("accepted");
}

async function waitFor(check: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the Worker");
    await sleep(25);
  }
}

function logged(event: string, pr: number): Array<Record<string, unknown>> {
  return harness
    .getLogs()
    .map((entry) => entry.message)
    .filter((message) => message.includes(`"event":"${event}"`))
    .map((message) => JSON.parse(message.slice(message.indexOf("{"))) as Record<string, unknown>)
    .filter((entry) => entry.pr === pr);
}

function waitForLog(event: string, pr: number, count = 1) {
  return waitFor(() => logged(event, pr).length >= count);
}

beforeAll(async () => {
  fakeApi = createServer((req, res) => {
    route(req, res)?.catch((error: unknown) => send(res, 500, { message: String(error) }));
  });
  await new Promise<void>((resolve) => fakeApi.listen(0, "127.0.0.1", resolve));
  const { port } = fakeApi.address() as AddressInfo;
  harness = createTestHarness({
    root: ROOT,
    workers: [
      {
        configPath: "./wrangler.jsonc",
        vars: {
          PR_LABEL_GROUP_ID: PR_GROUP_ID,
          LINEAR_API_URL: `http://127.0.0.1:${port}/graphql`,
          GITHUB_API_URL: `http://127.0.0.1:${port}/github`,
        },
        secrets: { LINEAR_WEBHOOK_SECRET: SECRET, LINEAR_API_KEY: LINEAR_KEY, GITHUB_TOKEN },
      },
    ],
  });
  await harness.listen();
});

afterAll(async () => {
  await harness?.close();
  await new Promise((resolve) => fakeApi?.close(resolve));
});

beforeEach(() => {
  linear = new FakeLinear();
  harness.clearLogs();
});

describe("Worker in the local Workers runtime", () => {
  it("labels both issues of a PR with one label when their deliveries arrive together", async () => {
    const first = linear.addIssue("KID-260");
    const second = linear.addIssue("KID-261");
    linear.attach(prUrl(546), first);
    linear.attach(prUrl(546), second);
    pulls.set(
      546,
      pullRequest({
        number: 546,
        branch: "kid-260-linear-pr-labeler",
        title: "feat(KID-260): PR label worker",
        body: "Fixes KID-260\nFixes KID-261",
      }),
    );

    await Promise.all([deliver("create", 546, first), deliver("create", 546, second)]);

    await waitFor(() => linear.labelsOf("KID-260").length > 0 && linear.labelsOf("KID-261").length > 0);
    await sleep(300);
    expect(linear.labels.map((l) => l.name)).toEqual(["#546 Linear pr labeler"]);
    expect(linear.count("createPrLabel")).toBe(1);
    expect(linear.labelsOf("KID-260")).toEqual(["#546 Linear pr labeler"]);
    expect(linear.labelsOf("KID-261")).toEqual(["#546 Linear pr labeler"]);
    expect(unexpected).toEqual([]);
  });

  it("runs the queued delivery after a GitHub failure instead of dropping it", async () => {
    const first = linear.addIssue("KID-270");
    const second = linear.addIssue("KID-271");
    linear.attach(prUrl(548), first);
    linear.attach(prUrl(548), second);
    pulls.set(548, pullRequest({ number: 548, branch: "kid-270-flaky-github", body: "Fixes KID-270, KID-271" }));
    githubFailures.set(548, 1);

    await Promise.all([deliver("create", 548, first), deliver("create", 548, second)]);

    await waitFor(() => linear.labelsOf("KID-270").length > 0 && linear.labelsOf("KID-271").length > 0);
    expect(linear.labelsOf("KID-270")).toEqual(["#548 Flaky github"]);
    expect(linear.labelsOf("KID-271")).toEqual(["#548 Flaky github"]);
    expect(githubCalls.get(548)).toBe(2);
    await waitForLog("reconcile_failed", 548);
    expect(logged("reconcile_failed", 548)[0].message).toBe("GitHub GET pulls/548 failed with HTTP 502");
  });

  it("skips an update right after a clean run but never skips a create", async () => {
    const first = linear.addIssue("KID-300");
    linear.attach(prUrl(560), first);
    pulls.set(560, pullRequest({ number: 560, branch: "kid-300-debounce", body: "Fixes KID-300, KID-301" }));

    await deliver("create", 560, first);
    await waitForLog("reconciled", 560);
    await deliver("update", 560, first);
    await waitForLog("reconcile_skipped", 560);
    expect(logged("reconcile_skipped", 560)[0]).toMatchObject({ reason: "debounced", action: "update" });
    expect(githubCalls.get(560)).toBe(1);

    const second = linear.addIssue("KID-301");
    linear.attach(prUrl(560), second);
    await deliver("create", 560, second);
    await waitFor(() => linear.labelsOf("KID-301").length > 0);
    expect(linear.labelsOf("KID-301")).toEqual(["#560 Debounce"]);
  });

  it("does not skip the update that follows a failed run, even right after a clean run", async () => {
    const clean = linear.addIssue("KID-302");
    linear.attach(prUrl(561), clean);
    pulls.set(561, pullRequest({ number: 561, branch: "kid-302-retry", body: "Fixes KID-302, KID-303" }));
    await deliver("create", 561, clean);
    await waitForLog("reconciled", 561);

    const flaky = linear.addIssue("KID-303", { labels: ["#550 Older"] });
    linear.attach(prUrl(550), flaky, "2026-09-01T00:00:00.000Z");
    linear.attach(prUrl(561), flaky);
    linear.updateFailures.set("KID-303", 1);
    await deliver("create", 561, flaky);
    await waitForLog("reconcile_partial", 561);
    await deliver("update", 561, flaky);

    await waitFor(() => linear.labelsOf("KID-303")[0] === "#561 Retry");
    expect(linear.labelsOf("KID-303")).toEqual(["#561 Retry"]);
    expect(logged("reconcile_skipped", 561)).toEqual([]);
  });

  it("keeps the label of the PR linked last when an older PR's create arrives late", async () => {
    const issue = linear.addIssue("KID-320");
    linear.attach(prUrl(565), issue);
    linear.attach(prUrl(566), issue);
    pulls.set(565, pullRequest({ number: 565, branch: "kid-320-older", body: "Fixes KID-320" }));
    pulls.set(566, pullRequest({ number: 566, branch: "kid-320-newer", body: "Fixes KID-320" }));

    await deliver("create", 566, issue);
    await waitFor(() => linear.labelsOf("KID-320").length > 0);
    await deliver("create", 565, issue, Date.now() - 3_600_000);
    await waitForLog("reconciled", 565);

    expect(logged("reconciled", 565)[0]).toMatchObject({ outcome: "nothing-to-do", keptNewerPr: ["KID-320"] });
    expect(linear.labelsOf("KID-320")).toEqual(["#566 Newer"]);
    expect(harness.getLogs().some((entry) => entry.message.includes('"event":"late_delivery"'))).toBe(true);
  });

  it("rejects a delivery signed with another secret without calling Linear", async () => {
    const response = await harness.fetch(
      "/linear",
      signedDelivery(attachmentEvent("create", 547, "issue"), "not-the-secret"),
    );

    expect(response.status).toBe(401);
    await response.text();
    await sleep(200);
    expect(linear.calls).toEqual([]);
  });
});
