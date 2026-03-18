export type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type RotationState = {
  yaw: number;
  pitchX: number;
  pitchZ: number;
};

export type PlayerState = {
  position: Vector3;
  rotation: RotationState;
};

export type PlayerSession = {
  id: string;
  name: string;
  state: PlayerState;
};

export type SessionReadyPayload = {
  selfId: string;
  players: PlayerSession[];
};

export type PlayerUpdatedPayload = {
  id: string;
  state: PlayerState;
};

export type PlayerLeftPayload = {
  id: string;
};

export type SessionErrorPayload = {
  message: string;
};

export type JoinPayload = {
  name: string;
};

export type ClientToServerEvents = {
  "player:join": (payload: JoinPayload) => void;
  "player:state": (payload: PlayerState) => void;
};

export type ServerToClientEvents = {
  "session:ready": (payload: SessionReadyPayload) => void;
  "player:joined": (payload: PlayerSession) => void;
  "player:updated": (payload: PlayerUpdatedPayload) => void;
  "player:left": (payload: PlayerLeftPayload) => void;
  "session:error": (payload: SessionErrorPayload) => void;
};

export const INITIAL_PLAYER_STATE: PlayerState = {
  position: { x: 0, y: 48, z: 0 },
  rotation: { yaw: 0, pitchX: 0, pitchZ: 0 }
};

export function createDefaultPlayerState(): PlayerState {
  return {
    position: { ...INITIAL_PLAYER_STATE.position },
    rotation: { ...INITIAL_PLAYER_STATE.rotation }
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isVector3(value: unknown): value is Vector3 {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    isFiniteNumber(record.x) &&
    isFiniteNumber(record.y) &&
    isFiniteNumber(record.z)
  );
}

export function isRotationState(value: unknown): value is RotationState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    isFiniteNumber(record.yaw) &&
    isFiniteNumber(record.pitchX) &&
    isFiniteNumber(record.pitchZ)
  );
}

export function isPlayerState(value: unknown): value is PlayerState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    isVector3(record.position) &&
    isRotationState(record.rotation)
  );
}

export function sanitizePlayerName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 24);
}
