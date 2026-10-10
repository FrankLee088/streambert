const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createPlaybackServer, buildPlayerHtml } = require("../src/ipc/playbackServer");

async function fixture(t, handler, options) {
  const upstream = http.createServer(handler);
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const player = createPlaybackServer(options);
  t.after(async () => { await player.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); });
  return { player, base: `http://127.0.0.1:${upstream.address().port}` };
}
function proxy(playerUrl, target) { return playerUrl.replace(/player$/, `proxy?url=${encodeURIComponent(target)}`); }

test("MP4 redirects preserve query, port, range and per-player Referer", async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url === "/redirect") { res.writeHead(302, { Location: "/movie.mp4?signature=abc" }); res.end(); return; }
    assert.equal(req.url, "/movie.mp4?signature=abc");
    assert.equal(req.headers.referer, "https://source.example/movie");
    assert.equal(req.headers.range, "bytes=2-5");
    res.writeHead(206, { "Content-Type": "video/mp4", "Content-Length": "4", "Content-Range": "bytes 2-5/10", "Accept-Ranges": "bytes" }); res.end("2345");
  });
  const { playerUrl } = await f.player.open({ url: f.base + "/redirect", referer: "https://source.example/movie" });
  const response = await fetch(proxy(playerUrl, f.base + "/redirect"), { headers: { Range: "bytes=2-5" } });
  assert.equal(response.status, 206); assert.equal(response.headers.get("content-range"), "bytes 2-5/10"); assert.equal(await response.text(), "2345");
});

test("HLS master, variants, keys and segments stay same-origin after redirect", async t => {
  const seen = [];
  const f = await fixture(t, (req, res) => {
    seen.push(req.url);
    assert.equal(req.headers.referer, "https://allmanga.to/");
    if (req.url === "/start.m3u8") { res.writeHead(302, { Location: "/cdn/master.m3u8" }); res.end(); return; }
    const bodies = {
      "/cdn/master.m3u8": '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvideo/list.m3u8?sig=1\n',
      "/cdn/video/list.m3u8?sig=1": '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../key?id=1"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\nseg.ts?sig=2\n#EXT-X-ENDLIST\n',
    };
    res.setHeader("Content-Type", req.url.includes("m3u8") ? "application/vnd.apple.mpegurl" : "application/octet-stream");
    const body = bodies[req.url] || "fixture bytes";
    res.setHeader("Content-Length", Buffer.byteLength(body)); res.end(body);
  });
  const { playerUrl } = await f.player.open({ url: f.base + "/start.m3u8" });
  const master = await (await fetch(proxy(playerUrl, f.base + "/start.m3u8"))).text();
  const variant = master.split("\n").find(line => line && !line.startsWith("#"));
  const response = await fetch(new URL(variant, playerUrl));
  assert.equal(response.headers.get("content-length"), null, "rewritten content must not use the upstream length");
  const manifest = await response.text();
  const resources = [...manifest.matchAll(/URI="([^"]+)"/g)].map(m => m[1]);
  resources.push(manifest.split("\n").find(line => line && !line.startsWith("#")));
  for (const url of resources) {
    assert.equal(new URL(url, playerUrl).origin, new URL(playerUrl).origin);
    assert.equal(await (await fetch(new URL(url, playerUrl))).text(), "fixture bytes");
  }
  assert.ok(seen.includes("/cdn/video/seg.ts?sig=2"));
  assert.ok(seen.includes("/cdn/key?id=1"));
  assert.ok(seen.includes("/cdn/video/init.mp4"));
});

test("switching episodes produces distinct player URLs and preserves old playback context", async t => {
  const f = await fixture(t, (req, res) => res.end(req.headers.referer));
  const a = await f.player.open({ url: f.base + "/a.mp4", referer: "https://a.example/", startTime: 15 });
  const b = await f.player.open({ url: f.base + "/b.mp4", referer: "https://b.example/" });
  assert.notEqual(a.playerUrl, b.playerUrl);
  assert.match(await (await fetch(a.playerUrl)).text(), /startTime":15/);
  assert.equal(await (await fetch(proxy(a.playerUrl, f.base + "/a.mp4"))).text(), "https://a.example/");
  assert.equal(await (await fetch(proxy(b.playerUrl, f.base + "/b.mp4"))).text(), "https://b.example/");
});

test("redirect loops, stalled upstream and invalid protocols terminate visibly", async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url === "/loop") { res.writeHead(302, { Location: "/loop" }); res.end(); }
  }, { timeout: 100 });
  const { playerUrl } = await f.player.open({ url: f.base + "/loop" });
  assert.equal((await fetch(proxy(playerUrl, f.base + "/loop"))).status, 502);
  assert.equal((await fetch(proxy(playerUrl, f.base + "/stalled"))).status, 504);
  assert.equal((await fetch(proxy(playerUrl, "file:///etc/passwd"))).status, 400);
  await assert.rejects(f.player.open({ url: "javascript:alert(1)" }));
  assert.equal((await fetch(playerUrl.replace(/\/[^/]+\/player$/, "/unknown/player"))).status, 404);
});

test("HLS player uses proxy and exposes load/media failures instead of a blank page", () => {
  const html = buildPlayerHtml({ url: "https://cdn.example/video.m3u8", startTime: 0, isHls: true }, "/token");
  assert.match(html, /token\/proxy/);
  assert.doesNotMatch(html, /setRequestHeader/);
  assert.match(html, /script.onerror/);
  assert.match(html, /window.hls=new Hls/);
});
