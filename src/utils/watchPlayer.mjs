// Keep navigation failures distinct from successful document loading.
export function watchPlayer(webview, report, { timeout = 30000, inspect, pollInterval = 1000 } = {}) {
  let timer;
  let pollTimer;
  let generation = 0;
  let disposed = false;
  let failedNavigation = false;
  const publish = state => { if (!disposed) report(state); };
  const currentUrl = () => {
    try { return webview.getURL(); } catch { return ""; }
  };
  const fail = (message, kind) => {
    failedNavigation = true; clearTimeout(timer); clearTimeout(pollTimer);
    publish({ loading: false, error: message, ...(kind ? { kind } : {}) });
  };
  const checkHealth = async () => {
    if (!inspect || disposed || failedNavigation) return;
    const currentGeneration = generation;
    try {
      const health = await inspect();
      if (disposed || currentGeneration !== generation || failedNavigation) return;
      if (health?.state === "verification-failed") {
        fail("This source's verification failed. Retry, open it in your browser, or choose another source.", "verification-failed");
        return;
      }
      if (health?.state === "media-error") {
        fail(`This source could not play its video (media error ${health.code ?? "unknown"}).`, "media-error");
        return;
      }
      publish({ loading: false, error: null, ...(health?.state === "verification-required"
        ? { notice: "Complete this source's verification in the player. You can also open it in your browser." } : {}) });
    } catch {}
    if (!disposed && currentGeneration === generation && !failedNavigation)
      pollTimer = setTimeout(checkHealth, pollInterval);
  };
  const start = () => {
    generation++;
    failedNavigation = false;
    clearTimeout(timer);
    clearTimeout(pollTimer);
    publish({ loading: true, error: null });
    timer = setTimeout(() => fail("The player did not respond within 30 seconds. Retry or choose another source."), timeout);
  };
  const ready = () => {
    if (failedNavigation) return;
    if (!currentUrl() || currentUrl() === "about:blank") return;
    clearTimeout(timer);
    publish({ loading: false, error: null });
    clearTimeout(pollTimer);
    pollTimer = setTimeout(checkHealth, 0);
  };
  const navigation = event => {
    if (event.isMainFrame !== false && !event.isInPlace && event.url !== "about:blank") start();
  };
  const failed = event => {
    // ERR_ABORTED is normal when switching source. Ad/subframe failures are not page failures.
    if (event.errorCode === -3 || event.isMainFrame === false || event.validatedURL === "about:blank") return;
    fail(`Unable to load this source: ${event.errorDescription || "network error"} (${event.errorCode ?? "unknown"}).`);
  };
  const gone = event => fail(`The player stopped unexpectedly (${event.reason || "renderer closed"}). Please retry.`);
  const listeners = { "did-start-navigation": navigation, "dom-ready": ready,
    "did-fail-load": failed, "render-process-gone": gone };
  for (const [name, handler] of Object.entries(listeners)) webview.addEventListener(name, handler);
  start();
  // A fast cached document may have reached dom-ready before React attached listeners.
  try {
    Promise.resolve(webview.executeJavaScript("document.readyState"))
      .then(state => { if (!disposed && ["interactive", "complete"].includes(state)) ready(); })
      .catch(() => {});
  } catch {}
  return {
    retry() {
      start();
      try { webview.reload(); } catch { fail("Unable to restart this player. Choose another source."); }
    },
    dispose() {
      disposed = true;
      generation++;
      clearTimeout(timer);
      clearTimeout(pollTimer);
      for (const [name, handler] of Object.entries(listeners)) webview.removeEventListener(name, handler);
    },
  };
}
