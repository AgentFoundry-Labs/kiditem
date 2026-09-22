// Linear scores each query before running it and rejects anything above
// 10,000 points: 0.1 per property, 1 per object, and a connection multiplies
// its children by its page size (default 50). The fakes cannot score queries,
// so this estimates the Worker's own documents.
import { describe, expect, it } from "vitest";
import {
  ATTACHED_ISSUES_QUERY,
  CREATE_LABEL_MUTATION,
  ISSUE_LINKED_AT_QUERY,
  PR_LABELS_QUERY,
  UPDATE_ISSUE_LABELS_MUTATION,
} from "../src/linear";

const LINEAR_MAX_COMPLEXITY = 10_000;

interface Selection {
  cost: number;
  fields: string[];
  end: number;
}

function complexity(document: string): number {
  const { cost } = parseSelection(document, document.indexOf("{"));
  return Math.round(cost * 10) / 10;
}

function parseSelection(src: string, open: number): Selection {
  let i = open + 1;
  let cost = 0;
  const fields: string[] = [];
  for (;;) {
    i = skipSpace(src, i);
    if (src[i] === "}") return { cost, fields, end: i + 1 };
    const name = /^[A-Za-z_]\w*/.exec(src.slice(i))?.[0];
    if (!name) throw new Error(`cannot parse near: ${src.slice(i, i + 30)}`);
    fields.push(name);
    i = skipSpace(src, i + name.length);
    let first: number | undefined;
    if (src[i] === "(") {
      const close = matchingParen(src, i);
      const pageSize = /\bfirst:\s*(\d+)/.exec(src.slice(i, close))?.[1];
      if (pageSize) first = Number(pageSize);
      i = skipSpace(src, close + 1);
    }
    if (src[i] === "{") {
      const child = parseSelection(src, i);
      const multiplier = first ?? (child.fields.includes("nodes") ? 50 : 1);
      cost += 1 + multiplier * child.cost;
      i = child.end;
    } else {
      cost += 0.1;
    }
  }
}

function matchingParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth += 1;
    if (src[i] === ")" && --depth === 0) return i;
  }
  throw new Error("unbalanced parentheses");
}

function skipSpace(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i])) i += 1;
  return i;
}

describe("Linear query complexity", () => {
  it("scores the first version of the attachments query over Linear's limit, as the review found", () => {
    const firstVersion = `
      query AttachedIssues($url: String!) {
        attachmentsForURL(url: $url, first: 50) {
          nodes { issue { id identifier team { key } labels(first: 100) { nodes { id name parent { id } } } } }
        }
      }`;
    expect(complexity(firstVersion)).toBeGreaterThan(LINEAR_MAX_COMPLEXITY);
  });

  it.each([
    ["AttachedIssues", ATTACHED_ISSUES_QUERY, 806],
    ["IssueLinkedAt", ISSUE_LINKED_AT_QUERY, 7.5],
    ["PrLabels", PR_LABELS_QUERY, 51],
    ["CreatePrLabel", CREATE_LABEL_MUTATION, 2.4],
    ["UpdateIssueLabels", UPDATE_ISSUE_LABELS_MUTATION, 1.1],
  ])("keeps %s far below the limit", (_name, document, expected) => {
    expect(complexity(document)).toBe(expected);
    expect(complexity(document)).toBeLessThan(LINEAR_MAX_COMPLEXITY / 5);
  });
});
