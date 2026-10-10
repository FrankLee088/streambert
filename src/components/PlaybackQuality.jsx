import { useEffect, useState } from "react";

export const QUALITY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1080", label: "Full HD (1080p)" },
  { value: "1440", label: "2K (1440p)" },
  { value: "2160", label: "4K (2160p)" },
];
export const normalizeQuality = value => QUALITY_OPTIONS.some(o => o.value === value) ? value : "auto";

export default function PlaybackQuality({ webviewRef, pipIdRef, pipOpen, defaultQuality, sourceKey }) {
  const [quality, setQuality] = useState(() => normalizeQuality(defaultQuality));
  const [status, setStatus] = useState(null);
  useEffect(() => setQuality(normalizeQuality(defaultQuality)), [defaultQuality]);
  useEffect(() => {
    let stopped = false;
    let timer;
    setStatus(null);
    const update = async () => {
      try {
        const id = pipOpen ? pipIdRef.current : webviewRef.current?.getWebContentsId();
        const result = id ? await window.electron?.controlPlaybackQuality?.(id, quality) : null;
        if (!stopped) setStatus(result || null);
      } catch {
        if (!stopped) setStatus(null);
      }
      if (!stopped) timer = setTimeout(update, 2000);
    };
    update();
    return () => { stopped = true; clearTimeout(timer); };
  }, [quality, sourceKey, pipOpen, webviewRef, pipIdRef]);
  const message = !status ? "Checking source quality…"
    : !status.supported ? "This source does not expose quality controls. Use its player menu."
    : !status.available ? "Requested quality unavailable; current playback is unchanged."
    : "Quality preference applied.";
  return <div className="playback-quality">
    <label>
      <select aria-label="Playback quality" className="player-overlay-btn" value={quality} onChange={e => setQuality(e.target.value)}>
        {QUALITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
    <div className="playback-quality-status" role="status">
      {message}{status?.actualHeight > 0 && ` Current: ${status.actualHeight}p.`}
    </div>
  </div>;
}
