import { describe, expect, it } from "vitest";
import {
  AgentSessionDeletionFailureCodeSchema,
  AgentSessionDeletionStatusSchema,
} from "./deletion";

describe("AgentSession deletion contracts", () => {
  it.each(["deleting", "delete_failed", "finalizing"] as const)(
    "parses %s as a content-free deletion status",
    (state) => {
      expect(
        AgentSessionDeletionStatusSchema.parse({ state, failureCode: null }),
      ).toEqual({ state, failureCode: null });
    },
  );

  it.each(["legalHoldAt", "storageReference"])(
    "rejects retired deletion payload field %s",
    (field) => {
      expect(() =>
        AgentSessionDeletionStatusSchema.parse({
          state: "deleting",
          failureCode: null,
          [field]: "retired-value",
        }),
      ).toThrow();
    },
  );

  it("allows only content-free deletion failure codes", () => {
    expect(
      AgentSessionDeletionFailureCodeSchema.parse("RUNTIME_CLEANUP_UNKNOWN"),
    ).toBe("RUNTIME_CLEANUP_UNKNOWN");
    expect(() =>
      AgentSessionDeletionFailureCodeSchema.parse("s3://secret/path"),
    ).toThrow();
  });
});
