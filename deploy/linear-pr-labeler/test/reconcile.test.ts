import { beforeEach, describe, expect, it } from "vitest";
import { reconcilePullRequest, type ReconcileJob } from "../src/reconcile";
import { FakeGitHub, FakeLinear, prUrl, pullRequest, REPO } from "./fakes";

let linear: FakeLinear;
let github: FakeGitHub;

beforeEach(() => {
  linear = new FakeLinear();
  github = new FakeGitHub();
});

function run(job: Partial<ReconcileJob> & { prNumber: number; issueId: string }) {
  return reconcilePullRequest(
    { prUrl: prUrl(job.prNumber), action: "create", ...job },
    { linear, github, teamKey: "KID", repo: REPO },
  );
}

describe("reconcilePullRequest", () => {
  it("creates the PR label from the branch and applies it to the issue the PR completes", async () => {
    const issue = linear.addIssue("KID-250");
    linear.attach(prUrl(544), issue);
    github.add(
      pullRequest({
        number: 544,
        branch: "kid-250-channel-registry",
        title: "refactor(KID-250): one channel registry",
        body: "## Reference\n- Fixes KID-250",
        author: "yhc125",
      }),
    );

    const result = await run({ prNumber: 544, issueId: issue });

    expect(result).toEqual({
      outcome: "labelled",
      label: "#544 Channel registry",
      createdLabel: true,
      added: ["KID-250"],
      replaced: [],
      keptNewerPr: [],
      closedBeforePr: [],
      failed: [],
    });
    expect(linear.labelsOf("KID-250")).toEqual(["#544 Channel registry"]);
    expect(linear.labels[0].description).toBe(
      "https://github.com/AgentFoundry-Labs/kiditem/pull/544 — refactor(KID-250): one channel registry · yhc125",
    );
  });

  it("labels every completed issue of the PR in one run and leaves link-only issues alone", async () => {
    const ids = ["KID-1", "KID-2", "KID-3", "KID-4"].map((key) => linear.addIssue(key));
    for (const id of ids) linear.attach(prUrl(10), id);
    github.add(
      pullRequest({
        number: 10,
        branch: "kid-1-bundle",
        title: "fix(KID-1): bundle",
        body: "Fixes KID-1\nFixes KID-2\nRefs KID-3\nRelated to KID-4",
      }),
    );

    const result = await run({ prNumber: 10, issueId: ids[0], action: "update" });

    expect(result.added.sort()).toEqual(["KID-1", "KID-2"]);
    expect(linear.labelsOf("KID-1")).toEqual(["#10 Bundle"]);
    expect(linear.labelsOf("KID-2")).toEqual(["#10 Bundle"]);
    expect(linear.labelsOf("KID-3")).toEqual([]);
    expect(linear.labelsOf("KID-4")).toEqual([]);
    expect(linear.count("createPrLabel")).toBe(1);
  });

  it("reuses a label a session already made for the PR, choosing the oldest active one", async () => {
    linear.addLabel("#545 Retired copy", { retired: true });
    linear.addLabel("#545 원장 리더 순수화");
    linear.addLabel("#545 Ledger reader purity");
    linear.addLabel("#54 Another PR");
    const issue = linear.addIssue("KID-127");
    linear.attach(prUrl(545), issue);
    github.add(pullRequest({ number: 545, branch: "kid-127-ledger-reader-purity", body: "Fixes KID-127" }));

    const result = await run({ prNumber: 545, issueId: issue });

    expect(result).toMatchObject({ outcome: "labelled", label: "#545 원장 리더 순수화", createdLabel: false });
    expect(linear.count("createPrLabel")).toBe(0);
    expect(linear.labelsOf("KID-127")).toEqual(["#545 원장 리더 순수화"]);
  });

  it("does nothing, without calling GitHub, when every attached issue has this PR's or a newer PR's label", async () => {
    const own = linear.addIssue("KID-1", { labels: ["#20 Own"] });
    const other = linear.addIssue("KID-2");
    linear.attach(prUrl(20), own);
    linear.attach(prUrl(20), other);
    linear.attach(prUrl(21), other);
    linear.addLabel("#21 Newer");
    await linear.updateIssueLabels(other, [linear.labels.find((l) => l.name === "#21 Newer")!.id], []);

    const result = await run({ prNumber: 20, issueId: other, action: "update" });

    expect(result).toMatchObject({ outcome: "nothing-to-do", keptNewerPr: ["KID-2"] });
    expect(github.calls).toBe(0);
    expect(linear.labelsOf("KID-2")).toEqual(["#21 Newer"]);
  });

  describe("when the issue carries another PR's label", () => {
    function issueLinkedTo(first: number, second: number, labelOf: number) {
      const id = linear.addIssue("KID-238", { labels: [`#${labelOf} Other`] });
      linear.attach(prUrl(first), id);
      linear.attach(prUrl(second), id);
      github.add(pullRequest({ number: first, branch: "kid-238-first", body: "Fixes KID-238" }));
      github.add(pullRequest({ number: second, branch: "kid-238-second", body: "Fixes KID-238" }));
      return id;
    }

    it.each(["create", "update"] as const)(
      "switches it to this PR when this PR was linked later (%s event)",
      async (action) => {
        const issue = issueLinkedTo(537, 538, 537);

        const result = await run({ prNumber: 538, issueId: issue, action });

        expect(result).toMatchObject({ outcome: "labelled", replaced: ["KID-238"], added: [] });
        expect(linear.labelsOf("KID-238")).toEqual(["#538 Second"]);
      },
    );

    it("keeps it when that PR was linked later, even for a late create of this PR", async () => {
      const issue = issueLinkedTo(565, 566, 566);

      const result = await run({ prNumber: 565, issueId: issue, action: "create" });

      expect(result).toMatchObject({ outcome: "nothing-to-do", keptNewerPr: ["KID-238"] });
      expect(linear.labelsOf("KID-238")).toEqual(["#566 Other"]);
      expect(github.calls).toBe(0);
    });

    it("never flips back after an older PR's failed run is retried", async () => {
      const issue = linear.addIssue("KID-310");
      linear.attach(prUrl(562), issue);
      linear.attach(prUrl(563), issue);
      github.add(pullRequest({ number: 562, branch: "kid-310-older", body: "Fixes KID-310" }));
      github.add(pullRequest({ number: 563, branch: "kid-310-newer", body: "Fixes KID-310" }));

      github.failures = 1;
      await expect(run({ prNumber: 562, issueId: issue, action: "create" })).rejects.toThrow(/HTTP 502/);
      await run({ prNumber: 563, issueId: issue, action: "create" });
      const retry = await run({ prNumber: 562, issueId: issue, action: "update" });

      expect(retry).toMatchObject({ outcome: "nothing-to-do", keptNewerPr: ["KID-310"] });
      expect(linear.labelsOf("KID-310")).toEqual(["#563 Newer"]);
    });

    it("keeps it when both PRs were linked at the same moment", async () => {
      const issue = linear.addIssue("KID-11", { labels: ["#70 First"] });
      linear.attach(prUrl(70), issue, "2026-09-17T12:30:00.000Z");
      linear.attach(prUrl(71), issue, "2026-09-17T12:30:00.000Z");
      github.add(pullRequest({ number: 71, body: "Fixes KID-11" }));

      await expect(run({ prNumber: 71, issueId: issue })).resolves.toMatchObject({ keptNewerPr: ["KID-11"] });
    });

    it("switches it when that PR is no longer attached to the issue", async () => {
      const issue = linear.addIssue("KID-12", { labels: ["#72 Unlinked"] });
      linear.attach(prUrl(73), issue);
      github.add(pullRequest({ number: 73, branch: "kid-12-linked", body: "Fixes KID-12" }));

      await expect(run({ prNumber: 73, issueId: issue })).resolves.toMatchObject({ replaced: ["KID-12"] });
      expect(linear.labelsOf("KID-12")).toEqual(["#73 Linked"]);
    });

    it("treats a PR-group label without a number as belonging to no PR", async () => {
      const issue = linear.addIssue("KID-13", { labels: ["Planned: Collection start"] });
      linear.attach(prUrl(74), issue);
      github.add(pullRequest({ number: 74, branch: "kid-13-collection-start", body: "Fixes KID-13" }));

      await expect(run({ prNumber: 74, issueId: issue })).resolves.toMatchObject({ replaced: ["KID-13"] });
      expect(linear.count("linkedAt")).toBe(0);
    });
  });

  it("retries a failed label change on the next delivery", async () => {
    const issue = linear.addIssue("KID-15", { labels: ["#80 Old"] });
    linear.attach(prUrl(80), issue);
    linear.attach(prUrl(81), issue);
    github.add(pullRequest({ number: 81, branch: "kid-15-new", body: "Fixes KID-15" }));
    linear.updateFailures.set("KID-15", 1);

    const first = await run({ prNumber: 81, issueId: issue, action: "create" });
    expect(first.failed).toEqual([{ issue: "KID-15", message: "Linear API HTTP 503" }]);
    expect(linear.labelsOf("KID-15")).toEqual(["#80 Old"]);

    const second = await run({ prNumber: 81, issueId: issue, action: "update" });
    expect(second).toMatchObject({ outcome: "labelled", replaced: ["KID-15"], failed: [] });
    expect(linear.labelsOf("KID-15")).toEqual(["#81 New"]);
  });

  it("labels the other issues when one issue fails, and reports the failure", async () => {
    const broken = linear.addIssue("KID-17");
    const fine = linear.addIssue("KID-18");
    linear.attach(prUrl(84), broken);
    linear.attach(prUrl(84), fine);
    github.add(pullRequest({ number: 84, branch: "kid-17-pair", body: "Fixes KID-17, KID-18" }));
    linear.updateFailures.set("KID-17", 5);

    const result = await run({ prNumber: 84, issueId: fine });

    expect(result).toMatchObject({
      outcome: "labelled",
      added: ["KID-18"],
      failed: [{ issue: "KID-17", message: "Linear API HTTP 503" }],
    });
    expect(linear.labelsOf("KID-18")).toEqual(["#84 Pair"]);
  });

  it("fills a missing label on an update event, for example after the body changed from Refs to Fixes", async () => {
    const issue = linear.addIssue("KID-6");
    linear.attach(prUrl(32), issue);
    github.add(pullRequest({ number: 32, branch: "kid-7-other", title: "chore: other", body: "Fixes KID-6" }));

    const result = await run({ prNumber: 32, issueId: issue, action: "update" });

    expect(result).toMatchObject({ outcome: "labelled", added: ["KID-6"] });
  });

  it("leaves issues that were already closed before the PR opened, even when the PR names them", async () => {
    const reference = linear.addIssue("KID-107", {
      labels: ["#501 Mall operations"],
      closedAt: "2026-09-10T00:00:00.000Z",
    });
    const unlabelledOld = linear.addIssue("KID-100", { closedAt: "2026-09-01T00:00:00.000Z" });
    const completedByThisPr = linear.addIssue("KID-171", { closedAt: "2026-09-17T13:00:00.000Z" });
    linear.attach(prUrl(501), reference, "2026-09-01T00:00:00.000Z");
    for (const id of [reference, unlabelledOld, completedByThisPr]) linear.attach(prUrl(535), id);
    github.add(
      pullRequest({
        number: 535,
        branch: "kid-171-mall-operations",
        title: "feat(KID-171): KID-107 결정대로 올린다 (KID-100 후속)",
        state: "closed",
        merged: true,
      }),
    );

    const result = await run({ prNumber: 535, issueId: reference, action: "create" });

    expect(result).toMatchObject({ outcome: "labelled", added: ["KID-171"], replaced: [] });
    expect(result.closedBeforePr.sort()).toEqual(["KID-100", "KID-107"]);
    expect(linear.labelsOf("KID-107")).toEqual(["#501 Mall operations"]);
    expect(linear.labelsOf("KID-100")).toEqual([]);
  });

  it("skips pull requests closed without merging", async () => {
    const closed = linear.addIssue("KID-8");
    linear.attach(prUrl(40), closed);
    github.add(pullRequest({ number: 40, body: "Fixes KID-8", state: "closed", merged: false }));

    await expect(run({ prNumber: 40, issueId: closed })).resolves.toMatchObject({ outcome: "pr-closed-unmerged" });
    expect(linear.labelsOf("KID-8")).toEqual([]);
  });

  it("still labels merged pull requests", async () => {
    const merged = linear.addIssue("KID-9");
    linear.attach(prUrl(41), merged);
    github.add(pullRequest({ number: 41, body: "Fixes KID-9", state: "closed", merged: true }));

    await expect(run({ prNumber: 41, issueId: merged })).resolves.toMatchObject({ outcome: "labelled" });
    expect(linear.labelsOf("KID-9")).toEqual(["#41 Pull request 41"]);
  });

  it("reports when the PR completes none of its attached issues", async () => {
    const issue = linear.addIssue("KID-10");
    linear.attach(prUrl(50), issue);
    github.add(pullRequest({ number: 50, branch: "kid-11-x", title: "chore: x", body: "Refs KID-10" }));

    await expect(run({ prNumber: 50, issueId: issue })).resolves.toMatchObject({ outcome: "no-completed-issues" });
    expect(linear.count("findPrLabels")).toBe(0);
  });

  it("ignores issues from other teams", async () => {
    const foreign = linear.addIssue("ENG-1", { teamKey: "ENG" });
    linear.attach(prUrl(60), foreign);

    await expect(run({ prNumber: 60, issueId: foreign })).resolves.toMatchObject({ outcome: "nothing-to-do" });
    expect(github.calls).toBe(0);
  });

  it("uses a label created concurrently by someone else when its own create fails", async () => {
    const issue = linear.addIssue("KID-19");
    linear.attach(prUrl(90), issue);
    github.add(pullRequest({ number: 90, body: "Fixes KID-19" }));
    linear.createFailures = 1;
    linear.beforeCreate = () => linear.addLabel("#90 Made by a session");

    const result = await run({ prNumber: 90, issueId: issue });

    expect(result).toMatchObject({ outcome: "labelled", label: "#90 Made by a session", createdLabel: false });
    expect(result.orphanedLabel).toBeUndefined();
  });

  it("prefers an older label a session made while its own create succeeded, and reports its own as orphaned", async () => {
    const issue = linear.addIssue("KID-20");
    linear.attach(prUrl(546), issue);
    github.add(pullRequest({ number: 546, branch: "kid-20-worker-name", body: "Fixes KID-20" }));
    linear.beforeCreate = () => linear.addLabel("#546 Session name");

    const result = await run({ prNumber: 546, issueId: issue });

    expect(result).toMatchObject({
      outcome: "labelled",
      label: "#546 Session name",
      createdLabel: false,
      orphanedLabel: "#546 Worker name",
    });
    expect(linear.labelsOf("KID-20")).toEqual(["#546 Session name"]);
  });

  it("surfaces the error when the create fails and no label exists", async () => {
    const issue = linear.addIssue("KID-21");
    linear.attach(prUrl(91), issue);
    github.add(pullRequest({ number: 91, body: "Fixes KID-21" }));
    linear.createFailures = 1;

    await expect(run({ prNumber: 91, issueId: issue })).rejects.toThrow(/already exists/);
    expect(linear.labelsOf("KID-21")).toEqual([]);
  });
});
