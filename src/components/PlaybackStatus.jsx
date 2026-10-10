import { useEffect, useRef, useState } from "react";
import { watchPlayer } from "../utils/watchPlayer.mjs";
import { getNextNonAsyncSource, PLAYER_SOURCES } from "../utils/playerSources.mjs";

export default function PlaybackStatus({ webviewRef, sourceKey, sourceId, mediaType,
  contentKey, active, onLoading, onNextSource }) {
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const controller = useRef(null);
  const recovery = useRef({ key: contentKey, failed: new Set(), notice: null });
  const nextSource = useRef(onNextSource);
  nextSource.current = onNextSource;
  useEffect(() => {
    if (recovery.current.key !== contentKey)
      recovery.current = { key: contentKey, failed: new Set(), notice: null };
    setError(null);
    setNotice(recovery.current.notice);
    if (!active || !webviewRef.current) return;
    const view = webviewRef.current;
    const watcher = watchPlayer(view, state => {
      setError(state.error);
      onLoading(state.loading);
      setNotice(state.notice || recovery.current.notice);
      if (state.kind === "verification-failed") {
        recovery.current.failed.add(sourceId);
        const next = getNextNonAsyncSource(sourceId, mediaType, [...recovery.current.failed]);
        if (next) {
          const label = id => PLAYER_SOURCES.find(s => s.id === id)?.label || id;
          recovery.current.notice = `${label(sourceId)} verification failed. Switched to ${label(next)}.`;
          nextSource.current(next);
        }
      }
    }, { inspect: () => window.electron?.queryPlayerHealth(view.getWebContentsId()) });
    controller.current = watcher;
    return () => { watcher.dispose(); if (controller.current === watcher) controller.current = null; };
  }, [active, sourceKey, sourceId, mediaType, contentKey, webviewRef, onLoading]);
  if (!active) return null;
  const next = getNextNonAsyncSource(sourceId, mediaType);
  const retry = () => {
    recovery.current.failed.clear(); recovery.current.notice = null;
    setNotice(null); controller.current?.retry();
  };
  const openInBrowser = () => {
    try {
      const url = webviewRef.current.getURL();
      if (/^https?:\/\//.test(url)) window.electron?.openExternal(url);
    } catch {}
  };
  const actions = <>
    <button className="btn btn-secondary" onClick={retry}>Retry player</button>
    {next && <button className="btn btn-primary" onClick={() => nextSource.current(next)}>Try another source</button>}
    <button className="btn btn-secondary" onClick={openInBrowser}>Open in browser</button>
  </>;
  return error ? (
    <div className="playback-error" role="alert">
      <strong>Playback unavailable</strong>
      <span>{error}</span>
      {!next && <span>No other source supports this content in this build.</span>}
      <div>{actions}</div>
    </div>
  ) : (
    <>
      {notice && <div className="playback-notice" role="status">{notice}</div>}
      <div className="playback-recovery">{actions}</div>
    </>
  );
}
