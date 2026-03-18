import { describe, expect, it } from "vitest";

import {
  createDefaultPlayerState,
  isPlayerState,
  sanitizePlayerName
} from "../src/shared/protocol";

describe("shared protocol helpers", () => {
  it("builds a default player state", () => {
    expect(createDefaultPlayerState()).toEqual({
      position: { x: 0, y: 48, z: 0 },
      rotation: { yaw: 0, pitchX: 0, pitchZ: 0 }
    });
  });

  it("validates player state payloads", () => {
    expect(
      isPlayerState({
        position: { x: 10, y: 20, z: 30 },
        rotation: { yaw: 1.2, pitchX: 0.1, pitchZ: -0.1 }
      })
    ).toBe(true);

    expect(
      isPlayerState({
        position: { x: 10, y: "bad", z: 30 },
        rotation: { yaw: 1.2, pitchX: 0.1, pitchZ: -0.1 }
      })
    ).toBe(false);
  });

  it("sanitizes player names", () => {
    expect(sanitizePlayerName("  Pilot  ")).toBe("Pilot");
    expect(sanitizePlayerName("")).toBeNull();
  });
});
