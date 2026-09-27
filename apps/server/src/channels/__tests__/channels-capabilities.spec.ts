import { describe, expect, it } from "vitest";
import { CHANNELS_CAPABILITIES } from "../domain/capability/channels.capabilities";

describe("Channels final capability definitions", () => {
  /** KID-364: the capabilities that wrote the retired registration execution table are gone until KID-372. */
  it("publishes no capability that starts a mall write", () => {
    expect(CHANNELS_CAPABILITIES.map((capability) => capability.key)).toEqual([]);
  });
});
