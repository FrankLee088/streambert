// Self-contained: serialized and executed in the embedded player's main world.
function controlQuality(requested) {
  if (!["auto", "1080", "1440", "2160"].includes(requested)) return null;
  const video = document.querySelector("video");
  const actualHeight = video?.videoHeight || 0;
  let adapter;
  // Only public, exposed player instances are supported. Never rewrite stream URLs.
  const hls = [window.hls, window.hlsInstance, video?.hls].find(
    candidate => candidate?.levels?.length && "currentLevel" in candidate,
  );
  if (hls?.levels?.length && "currentLevel" in hls) {
    adapter = {
      instance: hls,
      autoIndex: -1,
      levels: hls.levels.map((l, index) => ({ height: l.height, index })),
      select: (index) => { hls.currentLevel = index; },
    };
  }
  if (!adapter && typeof window.jwplayer === "function") {
    try {
      const player = window.jwplayer();
      const levels = player.getQualityLevels();
      if (levels?.length) adapter = {
        instance: player,
        levels: levels.map((l, index) => ({
          height: l.height || Number(String(l.label).match(/(\d{3,4})p/i)?.[1]) || (/4k/i.test(l.label) ? 2160 : /2k/i.test(l.label) ? 1440 : 0),
          index,
          auto: /^auto$/i.test(l.label),
        })),
        select: (index) => player.setCurrentQuality(index),
      };
    } catch {}
  }
  if (!adapter && typeof window.videojs?.getPlayers === "function") {
    for (const player of Object.values(window.videojs.getPlayers())) {
      if (!player || !player.el()?.contains(video) || typeof player.qualityLevels !== "function") continue;
      const levels = player.qualityLevels();
      if (!levels.length) continue;
      adapter = {
        instance: player,
        autoIndex: -1,
        levels: Array.from(levels, (level, index) => ({ height: level.height, index })),
        select: (index) => {
          // Enable the requested rendition before disabling the others.
          for (let i = 0; i < levels.length; i++) {
            if (index === -1 || i === index) levels[i].enabled = true;
          }
          if (index !== -1) {
            for (let i = 0; i < levels.length; i++) if (i !== index) levels[i].enabled = false;
          }
        },
      };
      break;
    }
  }
  if (!adapter) return { supported: false, heights: [], actualHeight };
  const heights = [...new Set(adapter.levels.map(l => l.height).filter(h => h > 0))].sort((a,b) => a-b);
  const target = requested === "auto"
    ? (adapter.autoIndex != null ? { index: adapter.autoIndex } : adapter.levels.find(l => l.auto))
    : adapter.levels.find(l => l.height === Number(requested));
  const available = Boolean(target);
  if (available) {
    const signature = JSON.stringify([requested, adapter.levels]);
    const previous = window.__streambertQualitySelection;
    if (previous?.instance !== adapter.instance || previous?.signature !== signature) {
      adapter.select(target.index);
      window.__streambertQualitySelection = { instance: adapter.instance, signature };
    }
  }
  return { supported: true, heights, available, actualHeight };
}

module.exports = { controlQuality };
