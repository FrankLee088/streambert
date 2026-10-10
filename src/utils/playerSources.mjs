// ── Player Sources ────────────────────────────────────────────────────────────
// supportsProgress: true = executeJavaScript tracking works for this source
export const PLAYER_SOURCES = [
  {
    id: "vidsrc",
    label: "VidSrc",
    tag: null,
    note: null,
    supportsProgress: true,
    progressViaFrames: true, // video is in a nested iframe, needs main-process frame query
    colorParam: null, // vidsrc doesn't support color param
    langParam: "ds_lang", // ISO 639-1 language code
    params: {},
    movieUrl: (id) => `https://vsembed.su/embed/movie/${id}`,
    tvUrl: (id, season, ep) =>
      `https://vsembed.su/embed/tv/${id}/${season}/${ep}`,
  },
  {
    id: "peachify",
    label: "Peachify",
    tag: null,
    note: "Movies only",
    moviesOnly: true,
    supportsProgress: true,
    colorParam: "accent",
    langParam: "sub",
    params: { autoPlay: "true", pip: "hide", cast: "hide" },
    movieUrl: (id) => `https://peachify.top/embed/movie/${id}`,
  },
  {
    id: "allmanga",
    label: "AllManga",
    tag: "ANIME",
    note: null,
    supportsProgress: true,
    async: true,
    params: {},
    movieUrl: (_id) => "https://allmanga.to",
    tvUrl: (_id, _season, _ep) => "https://allmanga.to",
  },
];
export const getSourceUrl = (
  sourceId,
  type,
  id,
  season,
  ep,
  extraParams = {},
  // Optional: accent hex (with or without #) and subtitle ISO lang code
  accentColor = null,
  subtitleLang = null,
) => {
  const src =
    PLAYER_SOURCES.find((s) => s.id === normalizePlayerSource(sourceId, type));
  const baseUrl =
    type === "movie" ? src.movieUrl(id) : src.tvUrl(id, season, ep);
  const url = new URL(baseUrl);

  Object.entries(src.params || {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  // Inject accent color into the player if the source supports it
  if (accentColor && src.colorParam) {
    url.searchParams.set(src.colorParam, accentColor.replace(/^#/, ""));
  }

  if (subtitleLang && src.langParam) {
    url.searchParams.set(src.langParam, subtitleLang);
  }

  Object.entries(extraParams).forEach(([key, value]) => {
    if (value != null) {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
};

export const sourceSupportsProgress = (sourceId) =>
  PLAYER_SOURCES.find((s) => s.id === sourceId)?.supportsProgress ?? false;

export const sourceProgressViaFrames = (sourceId) =>
  PLAYER_SOURCES.find((s) => s.id === sourceId)?.progressViaFrames ?? false;

export const sourceIsAsync = (sourceId) =>
  PLAYER_SOURCES.find((s) => s.id === sourceId)?.async ?? false;

// Retired/unknown saved sources cannot silently send users to dead hosts.
export function normalizePlayerSource(sourceId, type = "movie") {
  const source = PLAYER_SOURCES.find(s => s.id === sourceId);
  if (source && !(type === "tv" && source.moviesOnly)) return source.id;
  return type === "movie" ? "peachify" : "vidsrc";
}

export function getNextNonAsyncSource(currentId, type = "movie", excluded = []) {
  const sources = PLAYER_SOURCES.filter(s => !s.async && !(type === "tv" && s.moviesOnly));
  const idx = sources.findIndex(s => s.id === currentId);
  for (let offset = 1; offset <= sources.length; offset++) {
    const source = sources[(idx + offset) % sources.length];
    if (source.id !== currentId && !excluded.includes(source.id)) return source.id;
  }
  return null;
}

// Sources that require a transparent webRequest intercept to load properly
export const NEEDS_INTERCEPT = ["vidsrc"];

