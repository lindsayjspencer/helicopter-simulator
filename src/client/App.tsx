import { useCallback, useEffect, useRef, useState } from "react";

import { MultiplayerSession } from "./net/MultiplayerSession";
import { getConnectionCopy, type ConnectionCopy } from "./net/connectionStage";
import type { SessionReadyPayload } from "../shared/protocol";
import type { GameController, HudState } from "./game/GameController";

type AppViewState =
  | "join"
  | "connecting"
  | "booting"
  | "ready"
  | "reconnecting"
  | "connection_failed";

const DEFAULT_CONNECTION_COPY: ConnectionCopy = getConnectionCopy(0, false);
const DEFAULT_HUD: HudState = {
  thrust: 0,
  altitude: 0,
  groundSpeed: 0,
  positionLabel: "0, 0",
  connectedPlayers: 0
};

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "The multiplayer server could not be reached.";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export default function App() {
  const [viewState, setViewState] = useState<AppViewState>("join");
  const [pilotName, setPilotName] = useState("New Pilot");
  const [formError, setFormError] = useState("");
  const [connectionCopy, setConnectionCopy] = useState<ConnectionCopy>(DEFAULT_CONNECTION_COPY);
  const [connectionError, setConnectionError] = useState("");
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD);
  const [bootProgressLabel, setBootProgressLabel] = useState("Stand by");
  const [bootProgressValue, setBootProgressValue] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(true);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<GameController | null>(null);
  const controllerPromiseRef = useRef<Promise<GameController> | null>(null);
  const sessionRef = useRef<MultiplayerSession | null>(null);
  const bootPromiseRef = useRef<Promise<void> | null>(null);
  const activeAttemptRef = useRef(0);
  const connectionStartedAtRef = useRef<number | null>(null);
  const currentPilotNameRef = useRef(pilotName);

  const ensureController = useCallback(async () => {
    if (controllerRef.current) {
      return controllerRef.current;
    }

    if (!controllerPromiseRef.current) {
      controllerPromiseRef.current = import("./game/GameController")
        .then(({ GameController }) => {
          if (!hostRef.current) {
            throw new Error("Game canvas host is not available.");
          }

          const controller = new GameController(hostRef.current, {
            onBootProgress: ({ label, value }) => {
              setBootProgressLabel(label);
              setBootProgressValue(value);
            },
            onHudChange: setHud,
            onLocalState: (state) => {
              sessionRef.current?.sendState(state);
            }
          });

          controllerRef.current = controller;
          return controller;
        })
        .catch((error) => {
          controllerPromiseRef.current = null;
          throw error;
        });
    }

    return controllerPromiseRef.current;
  }, []);

  const ensureBooted = useCallback(async () => {
    const controller = await ensureController();
    if (!bootPromiseRef.current) {
      bootPromiseRef.current = controller.boot().catch((error) => {
        bootPromiseRef.current = null;
        throw error;
      });
    }

    await bootPromiseRef.current;
  }, [ensureController]);

  const goToJoinScreen = useCallback(() => {
    activeAttemptRef.current += 1;
    connectionStartedAtRef.current = null;
    setConnectionError("");
    setConnectionCopy(DEFAULT_CONNECTION_COPY);
    setFormError("");
    setViewState("join");

    sessionRef.current?.destroy();
    sessionRef.current = null;
    controllerRef.current?.leaveSession();
  }, []);

  const startSession = useCallback(
    async (requestedName?: string) => {
      const sanitized = (requestedName ?? pilotName).trim();
      if (!sanitized) {
        setFormError("Enter a pilot name before joining.");
        return;
      }

      setPilotName(sanitized);
      currentPilotNameRef.current = sanitized;
      setFormError("");
      setConnectionError("");
      setConnectionCopy(DEFAULT_CONNECTION_COPY);
      setViewState("connecting");
      connectionStartedAtRef.current = Date.now();
      activeAttemptRef.current += 1;

      const attemptId = activeAttemptRef.current;
      sessionRef.current?.destroy();
      sessionRef.current = null;

      const controller = await ensureController();
      controller.leaveSession();

      let bootReady = false;
      const bootTask = ensureBooted().then(() => {
        bootReady = true;
      });

      const session = new MultiplayerSession({
        onDisconnected: () => {
          controllerRef.current?.setPaused(true);
          connectionStartedAtRef.current = Date.now();
          setConnectionError("");
          setConnectionCopy(getConnectionCopy(0, true));
          setViewState("reconnecting");
        },
        onReconnectedSession: (payload: SessionReadyPayload) => {
          controllerRef.current?.resumeSession(payload);
          connectionStartedAtRef.current = null;
          setConnectionError("");
          setViewState("ready");
        },
        onPlayerJoined: (player) => {
          controllerRef.current?.handlePlayerJoined(player);
        },
        onPlayerUpdated: (payload) => {
          controllerRef.current?.handlePlayerUpdated(payload);
        },
        onPlayerLeft: (payload) => {
          controllerRef.current?.handlePlayerLeft(payload);
        },
        onConnectionIssue: (message) => {
          setConnectionError(message);
        }
      });

      sessionRef.current = session;

      try {
        const sessionTask = withTimeout(
          session.connect(sanitized).then((payload) => {
            if (!bootReady && activeAttemptRef.current === attemptId) {
              setViewState("booting");
            }

            return payload;
          }),
          65_000,
          "Timed out waiting for the server to wake up."
        );

        const [sessionReady] = await Promise.all([sessionTask, bootTask]);

        if (activeAttemptRef.current !== attemptId) {
          return;
        }

        controller.startSession(sessionReady);
        connectionStartedAtRef.current = null;
        setConnectionError("");
        setViewState("ready");
      } catch (error) {
        session.destroy();
        if (sessionRef.current === session) {
          sessionRef.current = null;
        }

        if (activeAttemptRef.current !== attemptId) {
          return;
        }

        controller.leaveSession();
        connectionStartedAtRef.current = null;
        setConnectionError(extractErrorMessage(error));
        setViewState("connection_failed");
      }
    },
    [ensureBooted, ensureController, pilotName]
  );

  useEffect(() => {
    if (viewState !== "connecting" && viewState !== "reconnecting") {
      return;
    }

    const tick = () => {
      const startedAt = connectionStartedAtRef.current ?? Date.now();
      setConnectionCopy(
        getConnectionCopy(Date.now() - startedAt, viewState === "reconnecting")
      );
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => {
      window.clearInterval(interval);
    };
  }, [viewState]);

  useEffect(() => {
    return () => {
      sessionRef.current?.destroy();
      controllerRef.current?.destroy();
    };
  }, []);

  const isOverlayVisible = viewState !== "ready";
  const showRetryActions =
    (viewState === "connecting" || viewState === "reconnecting") && connectionCopy.showManualActions;
  const bootPercent = Math.round(bootProgressValue * 100);

  return (
    <div className="app-shell">
      <div ref={hostRef} className="game-host" />

      <header className="hud hud-top">
        <div className="hud-card">
          <span className="hud-label">Position</span>
          <strong>{hud.positionLabel}</strong>
        </div>
        <div className="hud-card">
          <span className="hud-label">Ground Speed</span>
          <strong>{hud.groundSpeed.toFixed(1)} m/s</strong>
        </div>
        <div className="hud-card">
          <span className="hud-label">Altitude</span>
          <strong>{hud.altitude.toFixed(1)} m</strong>
        </div>
        <div className="hud-card hud-card--compact">
          <span className="hud-label">Pilots</span>
          <strong>{hud.connectedPlayers}</strong>
        </div>
      </header>

      <aside className={`controls-panel ${controlsOpen ? "is-open" : ""}`}>
        <div className="controls-panel__header">
          <span>Flight Controls</span>
          <button type="button" className="ghost-button" onClick={() => setControlsOpen((open) => !open)}>
            {controlsOpen ? "Hide" : "Show"}
          </button>
        </div>
        {controlsOpen ? (
          <div className="controls-list">
            <div><span>Lift</span><strong>Space / hold button</strong></div>
            <div><span>Yaw left</span><strong>A</strong></div>
            <div><span>Yaw right</span><strong>D</strong></div>
            <div><span>Bank and pitch</span><strong>Arrow keys</strong></div>
          </div>
        ) : null}
      </aside>

      <div className="thrust-meter">
        <span>Rotor Thrust</span>
        <div className="thrust-meter__bar">
          <div
            className="thrust-meter__fill"
            style={{ width: `${Math.round(hud.thrust * 100)}%` }}
          />
        </div>
      </div>

      {viewState === "ready" ? (
        <button
          type="button"
          className="touch-lift"
          onPointerDown={() => controllerRef.current?.setTouchLift(true)}
          onPointerUp={() => controllerRef.current?.setTouchLift(false)}
          onPointerCancel={() => controllerRef.current?.setTouchLift(false)}
          onPointerLeave={() => controllerRef.current?.setTouchLift(false)}
        >
          Hold to Lift
        </button>
      ) : null}

      {isOverlayVisible ? (
        <div className="overlay">
          {viewState === "join" ? (
            <form
              className="panel join-panel"
              onSubmit={(event) => {
                event.preventDefault();
                void startSession();
              }}
            >
              <p className="eyebrow">Render-hosted multiplayer flight</p>
              <h1>Helicopter Simulator</h1>
              <p className="panel-copy">
                Join only begins once a live Socket.IO session and the local flight systems are both ready.
              </p>

              <label className="field-label" htmlFor="pilot-name">
                Pilot name
              </label>
              <input
                id="pilot-name"
                className="text-input"
                value={pilotName}
                maxLength={24}
                onChange={(event) => setPilotName(event.target.value)}
                placeholder="Pilot name"
              />
              {formError ? <p className="panel-error">{formError}</p> : null}

              <button type="submit" className="primary-button">
                Connect and Start
              </button>
            </form>
          ) : null}

          {viewState === "connecting" || viewState === "reconnecting" ? (
            <div className="panel status-panel">
              <p className="eyebrow">{viewState === "reconnecting" ? "Connection lost" : "Session handshake"}</p>
              <h2>{connectionCopy.title}</h2>
              <p className="panel-copy">{connectionCopy.detail}</p>
              {connectionError ? <p className="panel-error">{connectionError}</p> : null}
              {bootProgressValue > 0 ? (
                <div className="mini-progress">
                  <div className="mini-progress__track">
                    <div
                      className="mini-progress__fill"
                      style={{ width: `${Math.max(8, bootPercent)}%` }}
                    />
                  </div>
                  <span>{bootProgressLabel}</span>
                </div>
              ) : null}
              {showRetryActions ? (
                <div className="action-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      connectionStartedAtRef.current = Date.now();
                      if (viewState === "reconnecting") {
                        sessionRef.current?.retry();
                      } else {
                        void startSession(currentPilotNameRef.current);
                      }
                    }}
                  >
                    Retry
                  </button>
                  <button type="button" className="ghost-button" onClick={goToJoinScreen}>
                    Back
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {viewState === "booting" ? (
            <div className="panel status-panel">
              <p className="eyebrow">Client boot</p>
              <h2>Preparing flight systems...</h2>
              <p className="panel-copy">
                The multiplayer session is live. The game will begin once the local renderer and physics world finish booting.
              </p>
              <div className="boot-progress">
                <div className="boot-progress__track">
                  <div className="boot-progress__fill" style={{ width: `${bootPercent}%` }} />
                </div>
                <div className="boot-progress__meta">
                  <span>{bootProgressLabel}</span>
                  <strong>{bootPercent}%</strong>
                </div>
              </div>
            </div>
          ) : null}

          {viewState === "connection_failed" ? (
            <div className="panel status-panel">
              <p className="eyebrow">Unable to start</p>
              <h2>Couldn&apos;t reach the server</h2>
              <p className="panel-copy">
                The game stays locked until it has an active realtime session. Retry when the server is available.
              </p>
              {connectionError ? <p className="panel-error">{connectionError}</p> : null}
              <div className="action-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    void startSession(currentPilotNameRef.current);
                  }}
                >
                  Retry
                </button>
                <button type="button" className="ghost-button" onClick={goToJoinScreen}>
                  Back
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
