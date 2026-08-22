import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MAX_AGENT_SESSION_ARTIFACT_BYTES } from "../../../port/out/runtime/agent-durable-runtime.port";
import { AgentSessionArtifactWriterService } from "../agent-session-artifact-writer.service";

const organizationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const executionId = "44444444-4444-4444-8444-444444444444";
const operationRunId = "55555555-5555-4555-8555-555555555555";
const artifactId = "66666666-6666-4666-8666-666666666666";
const sha256 =
  "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";

function materializeInput() {
  return {
    signal: new AbortController().signal,
    organizationId,
    sessionId,
    taskId,
    executionId,
    operationRunId,
    attemptToken: "attempt-token",
    externalArtifactId: "runtime-artifact-1",
    artifactType: "report",
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "application/octet-stream",
    sha256,
    label: "Result report",
    navigationActionId: "77777777-7777-4777-8777-777777777777",
    metadata: {},
  };
}

function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function harness() {
  const transactions = {
    prepare: vi.fn().mockResolvedValue({ artifactId }),
    bindUpload: vi.fn().mockResolvedValue(undefined),
    activate: vi.fn().mockResolvedValue(undefined),
  };
  const storage = {
    materializationCapability: vi.fn().mockReturnValue("supported"),
    openMultipart: vi.fn().mockResolvedValue({ uploadId: "upload-1" }),
    uploadAndComplete: vi.fn().mockResolvedValue(undefined),
    verifyCompleted: vi.fn().mockResolvedValue(undefined),
    abortEraseAndConfirm: vi.fn().mockResolvedValue({ state: "erased" }),
    inspect: vi.fn().mockResolvedValue("erased"),
  };
  return {
    writer: new AgentSessionArtifactWriterService(
      transactions as never,
      storage as never,
    ),
    transactions,
    storage,
  };
}

describe("AgentSessionArtifactWriterService", () => {
  it("publishes only an artifact id after active materialization", async () => {
    const { writer } = harness();

    const event = await writer.materialize(materializeInput());

    expect(event).toEqual({
      kind: "artifact",
      artifactId,
      payload: {
        artifactType: "report",
        label: "Result report",
        sha256,
        navigationActionId: "77777777-7777-4777-8777-777777777777",
      },
    });
    expect(JSON.stringify(event)).not.toMatch(
      /storageReference|agent-artifacts\//,
    );
  });

  it("rejects an oversized candidate before preparing a materialization row", async () => {
    const { writer, transactions } = harness();
    const bytes = new Uint8Array(MAX_AGENT_SESSION_ARTIFACT_BYTES + 1);

    await expect(
      writer.materialize({
        ...materializeInput(),
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    ).rejects.toThrow("AGENT_SESSION_ARTIFACT_TOO_LARGE");
    expect(transactions.prepare).not.toHaveBeenCalled();
  });

  it("rejects materialization before prepare when the provider cannot safely clean a materializing upload", async () => {
    const { writer, transactions, storage } = harness();
    storage.materializationCapability = vi.fn().mockReturnValue("unsupported");

    await expect(writer.materialize(materializeInput())).rejects.toThrow(
      "AGENT_SESSION_ARTIFACT_MATERIALIZATION_UNSUPPORTED",
    );
    expect(transactions.prepare).not.toHaveBeenCalled();
    expect(storage.openMultipart).not.toHaveBeenCalled();
  });

  it("never reports fenced while an aborted put promise is unresolved", async () => {
    const { writer, storage } = harness();
    storage.uploadAndComplete.mockReturnValue(neverSettles());

    const materialize = writer.materialize(materializeInput());
    await vi.waitFor(() =>
      expect(storage.uploadAndComplete).toHaveBeenCalledOnce(),
    );
    await writer.beginFence({
      organizationId,
      sessionId,
      operationRunIds: [operationRunId],
    });

    await expect(
      writer.confirmFenced({
        organizationId,
        sessionId,
        operationRunIds: [operationRunId],
      }),
    ).resolves.toEqual({
      state: "unknown",
      code: "ARTIFACT_WRITER_NOT_FENCED",
    });
    await expect(
      Promise.race([
        materialize.then(() => "settled"),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 0),
        ),
      ]),
    ).resolves.toBe("pending");
  });

  it("binds the multipart upload before sending bytes", async () => {
    const { writer, transactions, storage } = harness();
    transactions.bindUpload.mockImplementation(async () => {
      expect(storage.uploadAndComplete).not.toHaveBeenCalled();
    });

    await writer.materialize(materializeInput());

    expect(transactions.bindUpload).toHaveBeenCalledBefore(
      storage.uploadAndComplete,
    );
  });

  it("binds the upload to the exact task execution before bytes can be sent", async () => {
    const { writer, transactions } = harness();

    await writer.materialize(materializeInput());

    expect(transactions.bindUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId,
        executionId,
        operationRunId,
      }),
    );
  });

  it("does not open multipart storage when prepare aborts the input before resolving", async () => {
    const { writer, transactions, storage } = harness();
    const controller = new AbortController();
    transactions.prepare.mockImplementationOnce(async () => {
      controller.abort(new Error("prepare_aborted"));
      return { artifactId, lifecycle: "materializing" as const };
    });

    await expect(
      writer.materialize({
        ...materializeInput(),
        signal: controller.signal,
      }),
    ).rejects.toThrow("prepare_aborted");
    expect(storage.openMultipart).not.toHaveBeenCalled();
    expect(storage.uploadAndComplete).not.toHaveBeenCalled();
    expect(transactions.activate).not.toHaveBeenCalled();
  });

  it("erases a corrupt completed object and never activates its artifact row", async () => {
    const { writer, storage, transactions } = harness();
    storage.verifyCompleted.mockRejectedValueOnce(
      new Error("STORAGE_OBJECT_SHA256_MISMATCH"),
    );

    await expect(writer.materialize(materializeInput())).rejects.toThrow(
      "STORAGE_OBJECT_SHA256_MISMATCH",
    );
    expect(transactions.activate).not.toHaveBeenCalled();
    expect(storage.abortEraseAndConfirm).toHaveBeenCalledOnce();
  });

  it("leaves an open-before-bind multipart orphan for exact-key discovery after a bind crash", async () => {
    const { writer, transactions, storage } = harness();
    transactions.bindUpload.mockRejectedValueOnce(new Error("bind_crash"));

    await expect(writer.materialize(materializeInput())).rejects.toThrow(
      "bind_crash",
    );

    expect(storage.uploadAndComplete).not.toHaveBeenCalled();
    expect(storage.abortEraseAndConfirm).not.toHaveBeenCalled();
  });

  it("rejects the 129th active put before preparing another materialization row", async () => {
    const { writer, transactions, storage } = harness();
    let nextArtifact = 0;
    transactions.prepare.mockImplementation(async () => ({
      artifactId: `artifact-${nextArtifact++}`,
      lifecycle: "materializing" as const,
    }));
    storage.uploadAndComplete.mockReturnValue(neverSettles());

    for (let index = 0; index < 128; index += 1) {
      void writer.materialize({
        ...materializeInput(),
        externalArtifactId: `runtime-artifact-${index}`,
      });
    }
    await vi.waitFor(() =>
      expect(storage.uploadAndComplete).toHaveBeenCalledTimes(128),
    );

    await expect(
      writer.materialize({
        ...materializeInput(),
        externalArtifactId: "runtime-artifact-over-capacity",
      }),
    ).rejects.toThrow("AGENT_SESSION_ARTIFACT_PUT_CAPACITY_EXCEEDED");
    expect(transactions.prepare).toHaveBeenCalledTimes(128);
  });

  it("reserves writer capacity synchronously before deferred prepares can begin", async () => {
    const { writer, transactions } = harness();
    let releasePrepares!: () => void;
    const prepares = new Promise<void>((resolve) => {
      releasePrepares = resolve;
    });
    transactions.prepare.mockImplementation(async (_input: unknown) => {
      await prepares;
      return {
        artifactId: crypto.randomUUID(),
        lifecycle: "materializing" as const,
      };
    });

    const materializations = Array.from({ length: 129 }, (_, index) =>
      writer.materialize({
        ...materializeInput(),
        externalArtifactId: `deferred-admission-${index}`,
      }),
    );
    let lastAdmissionError: unknown = "pending";
    void materializations[128]!.catch((error) => {
      lastAdmissionError = error;
    });
    await Promise.resolve();

    expect(transactions.prepare).toHaveBeenCalledTimes(128);
    expect(lastAdmissionError).toMatchObject({
      message: "AGENT_SESSION_ARTIFACT_PUT_CAPACITY_EXCEEDED",
    });

    releasePrepares();
  });
});
