import { describe, expect, it } from "vitest";

import { getConnectionCopy } from "../src/client/net/connectionStage";

describe("connection copy", () => {
  it("moves from connecting to waking to still starting", () => {
    expect(getConnectionCopy(0, false).title).toBe("Connecting to server...");
    expect(getConnectionCopy(5_000, false).title).toBe("Waking server...");
    expect(getConnectionCopy(16_000, true).showManualActions).toBe(true);
  });
});
