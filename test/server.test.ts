import { afterEach, describe, expect, it } from "vitest";

import { createAppServer } from "../server/server";

const cleanupTasks: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanupTasks.length > 0) {
    const task = cleanupTasks.pop();
    if (task) {
      await task();
    }
  }
});

describe("app server", () => {
  it("creates the express app, socket server, and player store", async () => {
    const { httpServer, io, players } = createAppServer();

    cleanupTasks.push(async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
    });

    expect(players.size).toBe(0);
    expect(httpServer.listening).toBe(false);
  });
});
