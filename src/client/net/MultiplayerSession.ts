import { io, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  PlayerLeftPayload,
  PlayerSession,
  PlayerState,
  PlayerUpdatedPayload,
  ServerToClientEvents,
  SessionReadyPayload
} from "../../shared/protocol";

type MultiplayerCallbacks = {
  onDisconnected: (reason: string) => void;
  onReconnectedSession: (payload: SessionReadyPayload) => void;
  onPlayerJoined: (player: PlayerSession) => void;
  onPlayerUpdated: (payload: PlayerUpdatedPayload) => void;
  onPlayerLeft: (payload: PlayerLeftPayload) => void;
  onConnectionIssue: (message: string) => void;
};

export class MultiplayerSession {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private readonly callbacks: MultiplayerCallbacks;
  private pilotName = "";
  private initialResolve: ((payload: SessionReadyPayload) => void) | null = null;
  private initialReject: ((reason?: unknown) => void) | null = null;
  private initialPending = false;
  private connectedAtLeastOnce = false;
  private destroyed = false;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(pilotName: string): Promise<SessionReadyPayload> {
    this.pilotName = pilotName;
    this.initialPending = true;
    this.destroyed = false;

    this.socket = io({
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
      timeout: 20_000
    });

    this.attachSocket(this.socket);

    const readyPromise = new Promise<SessionReadyPayload>((resolve, reject) => {
      this.initialResolve = resolve;
      this.initialReject = reject;
    });

    this.socket.connect();
    return readyPromise;
  }

  sendState(state: PlayerState): void {
    if (!this.socket?.connected || !this.connectedAtLeastOnce) {
      return;
    }

    this.socket.emit("player:state", state);
  }

  retry(): void {
    if (!this.socket || this.destroyed) {
      return;
    }

    if (this.socket.connected) {
      this.socket.disconnect();
    }

    this.socket.connect();
  }

  destroy(): void {
    this.destroyed = true;
    this.connectedAtLeastOnce = false;
    this.initialPending = false;

    if (this.initialReject) {
      this.initialReject(new Error("Connection closed"));
      this.initialReject = null;
      this.initialResolve = null;
    }

    if (!this.socket) {
      return;
    }

    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }

  private attachSocket(socket: Socket<ServerToClientEvents, ClientToServerEvents>): void {
    socket.on("connect", () => {
      if (this.destroyed) {
        return;
      }

      socket.emit("player:join", { name: this.pilotName });
    });

    socket.on("session:ready", (payload) => {
      if (this.destroyed) {
        return;
      }

      this.connectedAtLeastOnce = true;

      if (this.initialPending && this.initialResolve) {
        this.initialPending = false;
        this.initialResolve(payload);
        this.initialResolve = null;
        this.initialReject = null;
        return;
      }

      this.callbacks.onReconnectedSession(payload);
    });

    socket.on("player:joined", (player) => {
      this.callbacks.onPlayerJoined(player);
    });

    socket.on("player:updated", (payload) => {
      this.callbacks.onPlayerUpdated(payload);
    });

    socket.on("player:left", (payload) => {
      this.callbacks.onPlayerLeft(payload);
    });

    socket.on("session:error", (payload) => {
      if (this.initialPending && this.initialReject) {
        this.initialPending = false;
        this.initialReject(new Error(payload.message));
        this.initialResolve = null;
        this.initialReject = null;
        return;
      }

      this.callbacks.onConnectionIssue(payload.message);
    });

    socket.on("connect_error", (error) => {
      if (this.destroyed) {
        return;
      }

      this.callbacks.onConnectionIssue(error.message);
    });

    socket.on("disconnect", (reason) => {
      if (this.destroyed || !this.connectedAtLeastOnce) {
        return;
      }

      this.callbacks.onDisconnected(reason);
    });
  }
}
