const http = require("node:http");
const https = require("node:https");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");

function mediaUrl(value, base) {
  const url = new URL(value, base);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Unsupported media URL");
  return url;
}

function rewritePlaylist(text, base, proxyPath) {
  const proxy = value => `${proxyPath}?url=${encodeURIComponent(mediaUrl(value, base).href)}`;
  return text.split(/\r?\n/).map(line => {
    if (!line.trim()) return line;
    if (line.startsWith("#"))
      return line.replace(/\bURI="([^"]+)"/g, (_, uri) => `URI="${proxy(uri)}"`);
    return proxy(line.trim());
  }).join("\n");
}

function buildPlayerHtml(config, prefix) {
  const src = `${prefix}/proxy?url=${encodeURIComponent(config.url)}`;
  // Serialize values instead of interpolating remote URLs into executable code.
  const data = JSON.stringify({ src, startTime: config.startTime, isHls: config.isHls })
    .replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;width:100%;height:100%;background:#000;color:white;font:16px system-ui}video{width:100%;height:100%;object-fit:contain}#error{position:absolute;inset:35% 10%;text-align:center;white-space:pre-wrap;pointer-events:none}</style>
</head><body><video id="v" controls playsinline autoplay></video><div id="error" role="alert" hidden></div>
<script>
const config=${data};
const video=document.getElementById('v');
const error=document.getElementById('error');
function fail(message){error.textContent=message;error.hidden=false;}
video.addEventListener('error',()=>fail('Video playback failed (code '+(video.error?.code||'unknown')+'). Try another source or retry.'));
video.addEventListener('playing',()=>{error.hidden=true;});
video.addEventListener('loadedmetadata',()=>{
  if(config.startTime>0) video.currentTime=config.startTime;
  video.play().catch(()=>{});
},{once:true});
if(!config.isHls){video.src=config.src;}
else {
  const script=document.createElement('script');
  script.src='${prefix}/hls.js';
  const timer=setTimeout(()=>fail('The video player could not load. Retry or reinstall Streambert.'),15000);
  script.onerror=()=>{clearTimeout(timer);fail('The video player could not load. Retry or reinstall Streambert.');};
  script.onload=()=>{
    clearTimeout(timer);
    if(!window.Hls?.isSupported()){
      if(video.canPlayType('application/vnd.apple.mpegurl')) video.src=config.src;
      else fail('HLS playback is not supported on this device.');
      return;
    }
    error.hidden=true;
    const hls=window.hls=new Hls();
    // Manifests, segments and encryption keys all use the same-origin proxy.
    hls.loadSource(config.src);hls.attachMedia(video);
    hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)fail('Stream failed: '+data.details+'. Retry or choose another source.');});
    window.addEventListener('pagehide',()=>hls.destroy(),{once:true});
  };
  document.head.appendChild(script);
}
</script></body></html>`;
}

function createPlaybackServer({ timeout = 20000 } = {}) {
  const videos = new Map();
  let starting;
  const server = http.createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const requestUrl = new URL(req.url, "http://127.0.0.1");
    const [, token, route] = requestUrl.pathname.split("/");
    const config = videos.get(token);
    if (!config) { res.writeHead(404); res.end(); return; }
    const prefix = `/${token}`;
    if (route === "hls.js") {
      try {
        res.setHeader("Content-Type", "application/javascript");
        const stream = fs.createReadStream(require.resolve("hls.js/dist/hls.min.js"));
        stream.on("error", () => { if (!res.headersSent) res.writeHead(500); res.end(); });
        res.on("close", () => stream.destroy());
        if (req.method === "HEAD") { stream.destroy(); res.end(); }
        else stream.pipe(res);
      } catch { res.writeHead(500); res.end(); }
      return;
    }
    if (route === "player") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(req.method === "HEAD" ? undefined : buildPlayerHtml(config, prefix));
      return;
    }
    if (route !== "proxy") { res.writeHead(404); res.end(); return; }

    let activeRequest;
    let activeResponse;
    let deadline;
    const fail = (code, message) => {
      clearTimeout(deadline);
      if (!res.destroyed && !res.writableEnded) {
        if (res.headersSent) res.destroy();
        else { res.writeHead(code); res.end(message); }
      }
    };
    res.on("close", () => {
      clearTimeout(deadline);
      activeRequest?.destroy();
      activeResponse?.destroy();
    });
    const forward = (target, redirects = 0) => {
      if (res.destroyed) return;
      let url;
      try { url = mediaUrl(target); }
      catch { fail(400, "Invalid media URL"); return; }
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
        Referer: config.referer, Accept: "*/*", "Accept-Encoding": "identity",
      };
      if (req.headers.range) headers.Range = req.headers.range;
      if (req.headers["if-range"]) headers["If-Range"] = req.headers["if-range"];
      const transport = url.protocol === "https:" ? https : http;
      // Pass the complete URL, including non-default ports and query strings.
      activeRequest = transport.request(url, { method: req.method, headers }, upstream => {
        activeResponse = upstream;
        upstream.on("error", () => fail(502, "Media connection failed"));
        if ([301, 302, 303, 307, 308].includes(upstream.statusCode)) {
          const location = upstream.headers.location;
          upstream.resume();
          if (!location || redirects >= 5) { fail(502, "Invalid or excessive media redirects"); return; }
          try { forward(mediaUrl(location, url).href, redirects + 1); }
          catch { fail(502, "Invalid media redirect"); }
          return;
        }
        const isPlaylist = /\.m3u8$/i.test(url.pathname) || /mpegurl/i.test(upstream.headers["content-type"] || "");
        if (isPlaylist && upstream.statusCode === 200 && req.method !== "HEAD") {
          const chunks = [];
          let size = 0;
          upstream.on("data", chunk => {
            size += chunk.length;
            if (size > 4 * 1024 * 1024) { fail(502, "Playlist too large"); upstream.destroy(); }
            else chunks.push(chunk);
          });
          upstream.on("end", () => {
            if (res.destroyed || res.writableEnded) return;
            try {
              const body = rewritePlaylist(Buffer.concat(chunks).toString("utf8"), url, `${prefix}/proxy`);
              res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
              res.end(body);
            } catch { fail(502, "Invalid media playlist"); }
          });
          return;
        }
        const pass = {};
        for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"])
          if (upstream.headers[name]) pass[name] = upstream.headers[name];
        res.writeHead(upstream.statusCode || 502, pass);
        // Once bytes arrive, use the socket inactivity timeout for long movies.
        clearTimeout(deadline);
        upstream.pipe(res);
      });
      activeRequest.setTimeout(timeout, () => { fail(504, "Media request timed out"); activeRequest.destroy(); });
      activeRequest.on("error", () => fail(502, "Media request failed"));
      activeRequest.end();
    };
    deadline = setTimeout(() => { fail(504, "Media request timed out"); activeRequest?.destroy(); }, timeout);
    forward(requestUrl.searchParams.get("url"));
  });
  return {
    async open({ url, referer = "https://allmanga.to", startTime = 0, isHls }) {
      const target = mediaUrl(url);
      const origin = mediaUrl(referer);
      if (!starting) starting = new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      }).catch(error => { starting = null; throw error; });
      await starting;
      const token = randomUUID();
      videos.set(token, { url: target.href, referer: origin.href,
        startTime: Number.isFinite(startTime) && startTime > 0 ? startTime : 0,
        isHls: isHls ?? /\.m3u8$/i.test(target.pathname) });
      // Keep recent players usable for pop-out windows without sharing mutable media state.
      if (videos.size > 20) videos.delete(videos.keys().next().value);
      return { playerUrl: `http://127.0.0.1:${server.address().port}/${token}/player` };
    },
    close() { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); },
  };
}

module.exports = { createPlaybackServer, rewritePlaylist, buildPlayerHtml };
