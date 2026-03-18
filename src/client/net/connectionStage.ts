export type ConnectionCopy = {
  title: string;
  detail: string;
  showManualActions: boolean;
};

export function getConnectionCopy(elapsedMs: number, reconnecting: boolean): ConnectionCopy {
  if (elapsedMs < 4_000) {
    return {
      title: reconnecting ? "Reconnecting to server..." : "Connecting to server...",
      detail: reconnecting
        ? "Holding your helicopter in place while the realtime link comes back."
        : "Opening the multiplayer session and verifying your pilot slot.",
      showManualActions: false
    };
  }

  if (elapsedMs < 15_000) {
    return {
      title: "Waking server...",
      detail: "Render free services can sleep after idle periods. This usually resolves on its own.",
      showManualActions: false
    };
  }

  return {
    title: "Still starting...",
    detail: reconnecting
      ? "The server is taking longer than usual. You can keep waiting, force another reconnect, or return to the join screen."
      : "The first connection after idle can take a while. Retry if you want to restart the handshake.",
    showManualActions: true
  };
}
