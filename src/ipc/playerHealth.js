// Read-only inspection. Never clicks, completes or suppresses site verification.
function inspectPlayerDocument() {
  const videos = [...document.querySelectorAll("video")];
  if (videos.some(v => v.readyState >= 2 && v.videoWidth > 0 && !v.error))
    return { state: "ready" };
  // innerText excludes scripts/hidden text; narrow terminal messages avoid
  // mistaking a challenge that the user can still complete for a failure.
  const text = document.body?.innerText || "";
  if (/(?:^|\n)\s*(?:verification failed\.?\s*(?:please reload\.?)?|human verification failed\.?)\s*(?:$|\n)/i.test(text))
    return { state: "verification-failed" };
  if (/(?:verify (?:that )?you are human|verifying you are human|checking your browser)/i.test(text))
    return { state: "verification-required" };
  const error = videos.find(v => v.error)?.error;
  if (error) return { state: "media-error", code: error.code };
  return { state: "waiting" };
}

async function queryPlayerHealth(wc) {
  const script = `(${inspectPlayerDocument.toString()})()`;
  const results = await Promise.all((wc.mainFrame?.framesInSubtree || []).map(async frame => {
    let timer;
    try {
      return await Promise.race([
        frame.executeJavaScript(script),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), 1500); }),
      ]);
    } catch { return null; } finally { clearTimeout(timer); }
  }));
  // An active video wins over an unrelated ad-frame message.
  for (const state of ["ready", "verification-failed", "verification-required", "media-error", "waiting"]) {
    const result = results.find(r => r?.state === state);
    if (result) return result;
  }
  return null;
}

module.exports = { inspectPlayerDocument, queryPlayerHealth };
