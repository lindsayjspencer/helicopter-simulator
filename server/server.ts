import fs from "node:fs";
import path from "node:path";
import { createServer, type Server as HttpServer } from "node:http";

import express, { type Express } from "express";
import { Server as SocketIOServer } from "socket.io";

import {
  type ClientToServerEvents,
  createDefaultPlayerState,
  isPlayerState,
  type PlayerSession,
  sanitizePlayerName,
  type ServerToClientEvents
} from "../src/shared/protocol";

type AppServer = {
  app: Express;
  httpServer: HttpServer;
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  players: Map<string, PlayerSession>;
};

export function createAppServer(clientDist = path.resolve(process.cwd(), "dist")): AppServer {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    pingInterval: 5_000,
    pingTimeout: 10_000
  });

  const players = new Map<string, PlayerSession>();

  app.disable("x-powered-by");

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, players: players.size });
  });

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));

    app.use((req, res, next) => {
      if (req.method !== "GET") {
        next();
        return;
      }

      if (req.path.startsWith("/socket.io")) {
        next();
        return;
      }

      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res
        .status(503)
        .type("text/plain")
        .send("Client bundle not built yet. Run npm run build first.");
    });
  }

  io.on("connection", (socket) => {
    socket.on("player:join", (payload) => {
      const name = sanitizePlayerName(payload?.name);
      if (!name) {
        socket.emit("session:error", { message: "Please enter a valid pilot name." });
        return;
      }

      const existing = players.get(socket.id);
      const player: PlayerSession = {
        id: socket.id,
        name,
        state: existing?.state ?? createDefaultPlayerState()
      };

      const alreadyJoined = players.has(socket.id);
      const snapshot = Array.from(players.values()).filter((candidate) => candidate.id !== socket.id);

      players.set(socket.id, player);
      socket.emit("session:ready", {
        selfId: socket.id,
        players: snapshot
      });

      if (!alreadyJoined) {
        socket.broadcast.emit("player:joined", player);
      }
    });

    socket.on("player:state", (payload) => {
      if (!isPlayerState(payload)) {
        socket.emit("session:error", { message: "Rejected malformed state update." });
        return;
      }

      const current = players.get(socket.id);
      if (!current) {
        socket.emit("session:error", { message: "Join the session before sending updates." });
        return;
      }

      const nextPlayer: PlayerSession = {
        ...current,
        state: payload
      };

      players.set(socket.id, nextPlayer);
      socket.broadcast.emit("player:updated", {
        id: socket.id,
        state: payload
      });
    });

    socket.on("disconnect", () => {
      if (!players.has(socket.id)) {
        return;
      }

      players.delete(socket.id);
      socket.broadcast.emit("player:left", { id: socket.id });
    });
  });

  return { app, httpServer, io, players };
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3001);
  const { httpServer } = createAppServer();

  httpServer.listen(port, () => {
    console.log(`Helicopter simulator server listening on ${port}`);
  });
}
