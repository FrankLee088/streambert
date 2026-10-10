import { useEffect, useRef, useState } from "react";
import { watchPlayer } from "../utils/watchPlayer.mjs";

export default function PlaybackStatus({ webviewRef, sourceKey, active, onLoading, onNextSource }) {
  const [error, setError] = useState(null);
  const controller = useRef(null);
  useEffect(() => {
    setError(null);
    if (!active || !webviewRef.current) return;
    controller.current = watchPlayer(webviewRef.current, state => {
      setError(state.error);
      onLoading(state.loading);
    });
    return () => { controller.current?.dispose(); controller.current = null; };
  }, [active, sourceKey, webviewRef, onLoading]);
  if (!active) return null;
  return error ? (
    <div className="playback-error" role="alert">
      <strong>Playback unavailable</strong>
      <span>{error}</span>
      <div>
        <button className="btn btn-secondary" onClick={() => controller.current?.retry()}>Retry player</button>
        <button className="btn btn-primary" onClick={onNextSource}>Try another source</button>
      </div>
    </div>
  ) : (
    <div className="playback-recovery">
      <button className="btn btn-secondary" onClick={() => controller.current?.retry()}>Retry player</button>
      <button className="btn btn-secondary" onClick={onNextSource}>Try another source</button>
    </div>
  );
}
