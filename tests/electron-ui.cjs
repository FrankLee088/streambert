// Full built-app regression with synthetic metadata and local media only.
const { app, BrowserWindow, session, webContents } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createPlaybackServer } = require("../src/ipc/playbackServer");
app.setPath("userData", process.env.STREAMBERT_TEST_PROFILE);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let win, upstream, playerUrl;
const player = createPlaybackServer();
const movie = { id: 101, title: "Playback Test Movie", media_type: "movie", release_date: "2020-01-01", genre_ids: [28], original_language: "en" };
const tv = { id: 102, name: "Playback Test Series", media_type: "tv", first_air_date: "2020-01-01", genre_ids: [28], original_language: "en" };
const evaluate = script => win.webContents.executeJavaScript(script);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(script) {
  for (let i = 0; i < 100; i++) { const result = await evaluate(script); if (result) return result; await wait(100); }
  throw new Error(`UI timed out: ${script}\n${await evaluate("document.body.innerText.slice(-2000)")}`);
}
const json = data => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
app.whenReady().then(async () => {
  upstream = http.createServer((req, res) => {
    res.setHeader("Content-Type", "video/mp4");
    fs.createReadStream(path.join(process.env.STREAMBERT_FIXTURES, "sample.mp4")).pipe(res);
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  ({ playerUrl } = await player.open({ url: `http://127.0.0.1:${upstream.address().port}/sample.mp4` }));
  session.defaultSession.protocol.handle("https", request => {
    const url = new URL(request.url);
    if (url.pathname === "/3/movie/101") return json({ ...movie, genres: [{ id: 28, name: "Action" }], runtime: 90 });
    if (url.pathname === "/3/tv/102") return json({ ...tv, genres: [{ id: 28, name: "Action" }], seasons: [{ season_number: 1, episode_count: 2 }], number_of_seasons: 1 });
    if (url.pathname === "/3/tv/102/season/1") return json({ episodes: [1, 2].map(n => ({ id: 200+n, episode_number: n, season_number: 1, name: `Episode ${n}`, air_date: "2020-01-01", runtime: 20 })) });
    return json({ results: [], cast: [], crew: [], genres: [], total_results: 0, total_pages: 1 });
  });
  session.fromPartition("persist:player").protocol.handle("https", request => {
    if (new URL(request.url).hostname === "www.vidking.net") throw new Error("Synthetic provider outage");
    return Response.redirect(playerUrl);
  });
  require("../index.js");
  for (let i = 0; i < 100; i++) { win = BrowserWindow.getAllWindows()[0]; if (win && !win.webContents.isLoading()) break; await wait(100); }
  await until("!!window.electron");
  await evaluate(`(async()=>{
    await window.electron.secureSet('apikey','synthetic-test-token');
    localStorage.setItem('streambert_saved',JSON.stringify({movie_101:${JSON.stringify(movie)},tv_102:${JSON.stringify(tv)}}));
    localStorage.setItem('streambert_startPage',JSON.stringify('history'));
    localStorage.setItem('streambert_playerSource',JSON.stringify('vidking'));
    localStorage.setItem('streambert_autoCheckUpdates','false');
    localStorage.setItem('streambert_gamepadEnabled','false');
  })()`);
  win.webContents.reload();
  await wait(300);
  await until("document.querySelectorAll('.card').length===2");
  await evaluate("[...document.querySelectorAll('.card')].find(x=>x.textContent.includes('Playback Test Movie')).click()");
  await until("[...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Play')");
  await evaluate("[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Play').click()");
  await until("document.querySelector('.playback-error')?.textContent.includes('Unable to load')");
  console.log("PASS movie page shows provider failure instead of black screen");
  await evaluate("document.querySelector('.playback-error .btn-primary').click()");
  await until("document.querySelector('webview') && getComputedStyle(document.querySelector('webview')).visibility==='visible' && !document.querySelector('.playback-error')");
  let id = await evaluate("document.querySelector('webview').getWebContentsId()");
  for (let i = 0; i < 100; i++) {
    if (await webContents.fromId(id).executeJavaScript("document.querySelector('video')?.videoWidth===320")) break;
    await wait(100);
  }
  assert.equal(await webContents.fromId(id).executeJavaScript("document.querySelector('video')?.videoWidth"), 320);
  assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Playback quality\"]')"), true);
  console.log("PASS movie UI switches source, reveals decoded video and keeps quality selector");
  await evaluate("[...document.querySelectorAll('.sidebar-btn')].find(x=>x.textContent.includes('Library')).click()");
  await until("[...document.querySelectorAll('.card')].some(x=>x.textContent.includes('Playback Test Series'))");
  await evaluate("[...document.querySelectorAll('.card')].find(x=>x.textContent.includes('Playback Test Series')).click()");
  await until("document.querySelectorAll('.episode-card').length===2");
  await evaluate("document.querySelector('.episode-card').click()");
  await until("document.querySelector('.playback-error')?.textContent.includes('Unable to load')");
  await evaluate("document.querySelector('.playback-error .btn-primary').click()");
  await until("document.querySelector('webview') && getComputedStyle(document.querySelector('webview')).visibility==='visible' && !document.querySelector('.playback-error')");
  id = await evaluate("document.querySelector('webview').getWebContentsId()");
  for (let i = 0; i < 100; i++) {
    if (await webContents.fromId(id).executeJavaScript("document.querySelector('video')?.videoWidth===320")) break;
    await wait(100);
  }
  assert.equal(await webContents.fromId(id).executeJavaScript("document.querySelector('video')?.videoWidth"), 320);
  console.log("PASS TV episode page recovers from source failure and decodes video");
}).then(() => finish(0), error => { console.error(error); finish(1); });
async function finish(code) {
  if (win && !win.isDestroyed()) win.destroy();
  await player.close(); upstream?.closeAllConnections(); upstream?.close(); app.exit(code);
}
