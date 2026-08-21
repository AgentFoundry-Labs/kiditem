import { createHmac, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  AgentSessionTombstoneHash,
  AgentSessionTombstoneHasherPort,
} from "../../../application/port/out/crypto/agent-session-tombstone-hasher.port";

@Injectable()
export class HmacAgentSessionTombstoneHasher
  implements AgentSessionTombstoneHasherPort
{
  constructor(
    private readonly key: Buffer,
    private readonly hashKeyVersion: string,
  ) {
    if (key.byteLength < 32)
      throw new Error("INTERACTION_LIFECYCLE_HMAC_KEY_INVALID");
    if (!/^v[1-9][0-9]*$/.test(hashKeyVersion))
      throw new Error("INTERACTION_LIFECYCLE_HMAC_KEY_VERSION_INVALID");
  }

  hash(input: {
    domain: "organization" | "copilot_thread" | "idempotency" | "request_fingerprint";
    value: string;
  }): AgentSessionTombstoneHash {
    if (!input.value) throw new Error("INTERACTION_LIFECYCLE_HASH_INPUT_INVALID");
    return {
      hash: createHmac("sha256", this.key)
        .update(`${input.domain}\u0000${input.value}`, "utf8")
        .digest("hex"),
      hashKeyVersion: this.hashKeyVersion,
    };
  }

  matches(
    left: AgentSessionTombstoneHash,
    right: AgentSessionTombstoneHash,
  ): boolean {
    if (left.hashKeyVersion !== right.hashKeyVersion) return false;
    const leftBytes = Buffer.from(left.hash, "hex");
    const rightBytes = Buffer.from(right.hash, "hex");
    return (
      leftBytes.byteLength === 32 &&
      rightBytes.byteLength === 32 &&
      timingSafeEqual(leftBytes, rightBytes)
    );
  }
}
