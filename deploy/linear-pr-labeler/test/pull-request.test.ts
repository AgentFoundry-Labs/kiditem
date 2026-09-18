import { describe, expect, it } from "vitest";
import {
  CLOSING_WORDS,
  completedIssueIds,
  CONTRIBUTING_WORDS,
  labelDescription,
  parsePullRequestUrl,
  prLabelPrefix,
  RELATION_WORDS,
  shortTitle,
} from "../src/pull-request";
import { pullRequest, REPO } from "./fakes";

describe("parsePullRequestUrl", () => {
  it("reads the number of a pull request in the configured repository", () => {
    expect(parsePullRequestUrl("https://github.com/AgentFoundry-Labs/kiditem/pull/544", REPO)).toBe(544);
    expect(parsePullRequestUrl("https://github.com/agentfoundry-labs/KIDITEM/pull/7/files", REPO)).toBe(7);
    expect(parsePullRequestUrl("https://github.com/AgentFoundry-Labs/kiditem/pull/8#discussion", REPO)).toBe(8);
  });

  it("ignores other repositories, other GitHub pages and non-strings", () => {
    expect(parsePullRequestUrl("https://github.com/AgentFoundry-Labs/other/pull/1", REPO)).toBeNull();
    expect(parsePullRequestUrl("https://github.com/AgentFoundry-Labs/kiditem-fork/pull/1", REPO)).toBeNull();
    expect(parsePullRequestUrl("https://github.com/AgentFoundry-Labs/kiditem/issues/1", REPO)).toBeNull();
    expect(parsePullRequestUrl("https://github.com/AgentFoundry-Labs/kiditem/commit/abc", REPO)).toBeNull();
    expect(parsePullRequestUrl("http://github.com/AgentFoundry-Labs/kiditem/pull/1", REPO)).toBeNull();
    expect(parsePullRequestUrl("https://github.com.evil.test/AgentFoundry-Labs/kiditem/pull/1", REPO)).toBeNull();
    expect(parsePullRequestUrl("https://github.com/AgentFoundry-Labs/kiditem/pull/0", REPO)).toBeNull();
    expect(parsePullRequestUrl(undefined, REPO)).toBeNull();
    expect(parsePullRequestUrl(42, REPO)).toBeNull();
  });
});

describe("prLabelPrefix", () => {
  it("ends with a space so #54 never matches #544", () => {
    expect(prLabelPrefix(54)).toBe("#54 ");
    expect("#544 Channel registry".startsWith(prLabelPrefix(54))).toBe(false);
  });
});

describe("completedIssueIds", () => {
  const ids = (overrides: Omit<Parameters<typeof pullRequest>[0], "number">) =>
    [...completedIssueIds(pullRequest({ number: 1, branch: "feature", title: "chore: tidy", ...overrides }), "KID")].sort();

  it.each(CLOSING_WORDS)("completes an issue after the closing word %j", (word) => {
    expect(ids({ body: `${word} KID-10` })).toEqual(["KID-10"]);
    expect(ids({ body: `${word.toUpperCase()}: KID-11` })).toEqual(["KID-11"]);
  });

  it.each([...CONTRIBUTING_WORDS, ...RELATION_WORDS])(
    "does not complete an issue after %j, even when the branch names it",
    (word) => {
      expect(ids({ body: `${word} KID-20` })).toEqual([]);
      expect(ids({ branch: "kid-20-work", body: `${word} KID-20` })).toEqual([]);
    },
  );

  it("keeps the documented word lists", () => {
    expect(CLOSING_WORDS).toHaveLength(21);
    expect(CONTRIBUTING_WORDS).toEqual(["ref", "refs", "references", "part of", "contributes to", "toward", "towards"]);
    expect(RELATION_WORDS).toEqual(["relates to", "related to"]);
  });

  it("reads lists after one magic word, including Linear's Oxford-comma example", () => {
    expect(ids({ body: "Fixes KID-123, KID-5, and KID-256" })).toEqual(["KID-123", "KID-256", "KID-5"]);
    expect(ids({ body: "Fixes KID-1, KID-2 & KID-3 and [KID-4]" })).toEqual(["KID-1", "KID-2", "KID-3", "KID-4"]);
    expect(ids({ body: "Fixes ENG-9, KID-30 and DES-2, KID-31" })).toEqual(["KID-30", "KID-31"]);
  });

  it("accepts markdown around the word and the identifiers", () => {
    expect(ids({ body: "**Fixes** KID-40" })).toEqual(["KID-40"]);
    expect(ids({ body: "Fixes **KID-41** and `KID-42`" })).toEqual(["KID-41", "KID-42"]);
    expect(ids({ branch: "kid-43-x", body: "Refs **KID-43**" })).toEqual([]);
  });

  it("reads magic words in the title as well as the body", () => {
    expect(ids({ title: "docs: part of KID-32" })).toEqual([]);
    expect(ids({ title: "Fixes KID-33: stop the crash" })).toEqual(["KID-33"]);
    expect(ids({ title: "fix(KID-34): relates to KID-35" })).toEqual(["KID-34"]);
  });

  it("does not treat plain mentions or longer words as magic words", () => {
    expect(ids({ body: "see KID-50\nHotfixes KID-51\nprefixes KID-52\nsuffix_fixes KID-53" })).toEqual([]);
  });

  it("adds issues named in the branch or title", () => {
    expect(ids({ branch: "kid-60-channel-registry", title: "refactor(KID-61): registry" })).toEqual([
      "KID-60",
      "KID-61",
    ]);
    expect(ids({ branch: "yhc125g/kid-62-채널-목록" })).toEqual(["KID-62"]);
  });

  it("lets a closing word win when the same issue is also named after another word", () => {
    expect(ids({ body: "Fixes KID-70\nRefs KID-70" })).toEqual(["KID-70"]);
  });

  it("stops a list at the next magic word", () => {
    expect(ids({ body: "Fixes KID-80 and refs KID-81" })).toEqual(["KID-80"]);
  });

  it("reads the title and the body separately", () => {
    expect(ids({ branch: "kid-28-note", title: "chore: tidy refs", body: "KID-28 note" })).toEqual(["KID-28"]);
  });

  it("accepts a colon inside the emphasis", () => {
    expect(ids({ body: "**Fixes:** KID-90" })).toEqual(["KID-90"]);
  });

  it("ignores magic words inside HTML comments", () => {
    expect(ids({ body: "<!-- Fixes KID-91 -->\nFixes KID-92\n<!-- unterminated Fixes KID-93" })).toEqual(["KID-92"]);
  });

  it("only reads complete identifiers of the configured team", () => {
    expect(ids({ title: "fix(KID-238·239·241): bundle", body: "Fixes ENG-1\nFixes KID-0007" })).toEqual([
      "KID-238",
      "KID-7",
    ]);
    expect(ids({ branch: "kid-5000x" })).toEqual([]);
    expect(ids({ branch: "foo_kid-12-x" })).toEqual([]);
  });
});

describe("shortTitle", () => {
  const title = (branch: string, prTitle = "chore: fallback title") =>
    shortTitle(pullRequest({ number: 1, branch, title: prTitle }), "KID");

  it("turns the kid-<n>-<desc> branch into words", () => {
    expect(title("kid-250-channel-registry")).toBe("Channel registry");
    expect(title("codex/kid-147-on-develop")).toBe("On develop");
    expect(title("kid-12-2fa-login")).toBe("2fa login");
    expect(title("kid-12-3-tier")).toBe("3 tier");
  });

  it("falls back to the PR title when the branch has no kid-<n>-<desc> description", () => {
    expect(title("kid-5", "fix(KID-5)!: handle empty reports")).toBe("Handle empty reports");
    expect(title("dependabot/npm_and_yarn/next-16.3.5", "chore(deps): bump next to 16.3.5")).toBe(
      "Bump next to 16.3.5",
    );
    expect(title("develop", "Promote develop to main")).toBe("Promote develop to main");
  });

  it("clips long titles at a word boundary", () => {
    const clipped = title("kid-9-make-the-ledger-reader-pure-and-move-http-errors-out");
    expect(clipped).toBe("Make the ledger reader pure and move");
    expect([...clipped].length).toBeLessThanOrEqual(40);
  });

  it("keeps Korean branch words", () => {
    expect(title("yhc125g/kid-250-채널-목록키-철자능력-판정이-10곳에-복사돼-서로")).toBe(
      "채널 목록키 철자능력 판정이 10곳에 복사돼 서로",
    );
  });
});

describe("labelDescription", () => {
  it("names the PR URL, its title and its author", () => {
    expect(labelDescription(pullRequest({ number: 544, title: "refactor(KID-250): registry", author: "yhc125" }))).toBe(
      "https://github.com/AgentFoundry-Labs/kiditem/pull/544 — refactor(KID-250): registry · yhc125",
    );
  });

  it("clips a long PR title", () => {
    const description = labelDescription(pullRequest({ number: 2, title: "word ".repeat(60).trim(), author: "a" }));
    expect(description.length).toBeLessThan(200);
    expect(description).toMatch(/word… · a$/);
  });
});
