import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const interactionRoot = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "adapter",
  "in",
  "http",
  "interaction",
);
const authorization = resolve(
  __dirname,
  "..",
  "agent-interaction-authorization.service.ts",
);
const bootstrap = resolve(
  __dirname,
  "..",
  "agent-interaction-bootstrap.service.ts",
);
const replayProjector = resolve(
  __dirname,
  "..",
  "interaction-replay-projector.ts",
);

describe("interaction input seam", () => {
  it("exposes direct authenticated interaction contracts without gateway credentials", () => {
    const authorizationPort = readFileSync(
      resolve(
        __dirname,
        "..",
        "..",
        "..",
        "port",
        "in",
        "interaction",
        "agent-interaction-authorization.port.ts",
      ),
      "utf8",
    );
    const bootstrapPort = readFileSync(
      resolve(
        __dirname,
        "..",
        "..",
        "..",
        "port",
        "in",
        "interaction",
        "agent-interaction-bootstrap.port.ts",
      ),
      "utf8",
    );
    const livePort = readFileSync(
      resolve(
        __dirname,
        "..",
        "..",
        "..",
        "port",
        "in",
        "interaction",
        "agent-interaction-live-events.port.ts",
      ),
      "utf8",
    );
    for (const source of [authorizationPort, bootstrapPort, livePort]) {
      expect(source).not.toMatch(
        /runIntent|liveJoinToken|principalKey|HMAC|opaque replay/i,
      );
    }
    expect(authorizationPort).toContain("organizationId: string");
    expect(authorizationPort).toContain("userId: string");
    expect(authorizationPort).toContain("afterSequence?: string | null");
    expect(livePort).toContain("coordinate: AuthorizedLiveJoin");
    expect(readFileSync(authorization, "utf8")).not.toContain(
      "bootstrap(input",
    );
  });

  it("makes bootstrap a listing capability and keeps one replay mapping capability-local", () => {
    const source = readFileSync(bootstrap, "utf8");
    const authorizationSource = readFileSync(authorization, "utf8");

    expect(source).not.toContain("AgentInteractionAuthorizationService");
    expect(authorizationSource).not.toContain(
      "AgentInteractionBootstrapService",
    );
    expect(source).not.toContain("resolvePrincipal(");
    expect(source).not.toContain("prepareRunIntent(");
    expect(readFileSync(replayProjector, "utf8")).not.toContain(
      "TEXT_MESSAGE_CHUNK",
    );
    expect(() => readFileSync(replayProjector, "utf8")).not.toThrow();
  });
});
