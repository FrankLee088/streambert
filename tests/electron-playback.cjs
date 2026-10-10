// Run with Electron under a desktop session (Linux CI may use Xvfb).
// Fixtures: ffmpeg-generated sample.mp4, sample.m3u8 and its segments.
const { app, BrowserWindow, webContents } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { createPlaybackServer } = require("../src/ipc/playbackServer");
const fixtureDir = process.env.STREAMBERT_FIXTURES;
app.setPath("userData", process.env.STREAMBERT_TEST_PROFILE);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.disableHardwareAcceleration();
let win, upstream;
const player = createPlaybackServer();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message) {
  for (let i = 0; i < 100; i++) { const result = await check(); if (result) return result; await pause(100); }
  if (win) {
    const id = await win.webContents.executeJavaScript("document.querySelector('webview').getWebContentsId()");
    console.error("DIAGNOSTIC", await webContents.fromId(id).executeJavaScript("JSON.stringify({error:document.getElementById('error')?.textContent,src:document.querySelector('video')?.src,ready:document.querySelector('video')?.readyState,videoError:document.querySelector('video')?.error?.message,hls:!!window.hls,native:document.querySelector('video')?.canPlayType('application/vnd.apple.mpegurl')})"));
  }
  throw new Error(message);
}
app.whenReady().then(async () => {
  const { watchPlayer } = await import(pathToFileURL(path.resolve(__dirname, "../src/utils/watchPlayer.mjs")));
  upstream = http.createServer((req, res) => {
    if (req.url === "/redirect") { res.writeHead(302, { Location: "/sample.mp4" }); res.end(); return; }
    const file = path.join(fixtureDir, path.basename(new URL(req.url, "http://fixture").pathname));
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    const size = fs.statSync(file).size;
    res.setHeader("Content-Type", file.endsWith("m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith("mp4") ? "video/mp4" : "video/mp2t");
    res.setHeader("Accept-Ranges", "bytes");
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Number(range[2]) : size - 1;
    if (range) { res.statusCode = 206; res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`); }
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(file, { start, end }).pipe(res);
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${upstream.address().port}`;
  win = new BrowserWindow({ width: 800, height: 500, show: false, webPreferences: { webviewTag: true, contextIsolation: true, nodeIntegration: false } });
  // Deny all external traffic: HLS must come from the installed dependency.
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: /^https?:/.test(details.url) && !details.url.startsWith("http://127.0.0.1:") });
  });
  await win.loadURL('data:text/html,<webview id="player" src="about:blank" style="width:100%;height:450px"></webview>');
  await until(() => win.webContents.executeJavaScript("(()=>{try{return document.querySelector('webview').getWebContentsId()}catch{return null}})()"), "Guest not attached");
  await win.webContents.executeJavaScript(`window.states=[];window.watcher=(${watchPlayer.toString()})(document.querySelector('webview'),s=>window.states.push(s));true;`);
  let guest;
  for (const filename of ["redirect", "sample.m3u8", "sample.mp4"]) {
    const { playerUrl } = await player.open({ url: `${base}/${filename}`, startTime: filename === "sample.mp4" ? 1 : 0 });
    await win.webContents.executeJavaScript(`document.querySelector('webview').src=${JSON.stringify(playerUrl)}`);
    await until(async () => {
      const id = await win.webContents.executeJavaScript("document.querySelector('webview').getWebContentsId()");
      guest = webContents.fromId(id);
      try { return await guest.executeJavaScript(`(()=>{const v=document.querySelector('video');return v&&v.videoWidth===320&&v.currentTime>0.3&&!v.error})()`); } catch { return false; }
    }, `No decoded video for ${filename}`);
    const state = await guest.executeJavaScript("(()=>{const v=document.querySelector('video');return {width:v.videoWidth,height:v.videoHeight,time:v.currentTime,hls:!!window.hls}})()");
    if (filename.endsWith("m3u8")) assert.equal(state.hls, true);
    const status = await win.webContents.executeJavaScript("window.states.at(-1)");
    assert.equal(status.loading, false); assert.equal(status.error, null);
    console.log("PASS decoded playback", filename, JSON.stringify(state));
  }
  await win.webContents.executeJavaScript("document.querySelector('webview').src='http://127.0.0.1:1/unavailable'");
  const failure = await until(() => win.webContents.executeJavaScript("window.states.at(-1)?.error"), "Failure was not surfaced");
  assert.match(failure, /Unable to load/);
  console.log("PASS real webview navigation error", failure);
  const again = await player.open({ url: `${base}/sample.mp4` });
  await win.webContents.executeJavaScript(`document.querySelector('webview').src=${JSON.stringify(again.playerUrl)}`);
  await until(() => win.webContents.executeJavaScript("window.states.at(-1)?.loading===false && !window.states.at(-1)?.error"), "Recovery failed");
  console.log("PASS source change recovers after failure");
}).then(() => finish(0), error => { console.error(error); finish(1); });
async function finish(code) {
  win?.destroy();
  await player.close();
  upstream?.closeAllConnections();
  upstream?.close();
  app.exit(code);
}
