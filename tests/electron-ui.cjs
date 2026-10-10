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
app.commandLine.appendSwitch("use-mock-keychain");
let win, upstream, playerUrl;
let allSourcesFail = false, challengeRequired = false, tvSourceRecovered = false;
const requests = [];
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
    const url = new URL(request.url);
    requests.push(url.hostname);
    if (url.hostname === "challenge.fixture.invalid") return new Response(
      challengeRequired ? "<p>Verify you are human</p>" : "<p>Verification failed. Please reload.</p>",
      { headers: { "Content-Type": "text/html" } });
    if (url.hostname === "vsembed.su" && tvSourceRecovered) return Response.redirect(playerUrl);
    if (url.hostname === "vsembed.su" || allSourcesFail) return new Response(
      '<body><script>document.body.dataset.inlineRan="yes"</script><iframe style="width:100%;height:400px" src="https://challenge.fixture.invalid/verify"></iframe></body>',
      { headers: { "Content-Type": "text/html", "Content-Security-Policy": "frame-src https://challenge.fixture.invalid; script-src 'none'" } });
    assert.equal(url.hostname, "peachify.top", "Unexpected/retired provider requested");
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
  await until("document.querySelector('webview') && getComputedStyle(document.querySelector('webview')).visibility==='visible'");
  let id = await evaluate("document.querySelector('webview').getWebContentsId()");
  await until("window.electron.queryPlayerHealth(document.querySelector('webview').getWebContentsId()).then(s=>s?.state==='ready')");
  assert.equal(new URL(webContents.fromId(id).getURL()).hostname, "127.0.0.1");
  assert.equal(requests.includes("www.vidking.net"), false);
  assert.equal(requests.includes("player.videasy.to"), false);
  assert.equal(requests.includes("peachify.top"), true);
  assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Playback quality\"]')"), true);
  const ua = await webContents.fromId(id).executeJavaScript("navigator.userAgent");
  assert.ok(ua.includes(`Chrome/${process.versions.chrome}`));
  if (process.platform === "darwin") assert.match(ua, /Macintosh/);
  console.log("PASS retired saved source migrates to movie provider; native User-Agent and quality controls preserved");
  async function selectVidSrc() {
    await evaluate("document.querySelector('[title=\"Change source\"]').click()");
    await until("!!document.querySelector('.source-dropdown')");
    await evaluate("[...document.querySelectorAll('.source-dropdown button')].find(x=>x.textContent.includes('VidSrc')).click()");
  }
  // The failure is in a cross-origin iframe and arrives after document readiness.
  await selectVidSrc();
  await until("document.querySelector('.playback-notice')?.textContent.includes('Switched to Peachify')");
  await until("window.electron.queryPlayerHealth(document.querySelector('webview').getWebContentsId()).then(s=>s?.state==='ready')");
  assert.equal(await evaluate("!!document.querySelector('.playback-error')"), false);
  console.log("PASS cross-origin verification failure automatically switches movie source and decodes video");
  allSourcesFail = true;
  await selectVidSrc();
  await until("document.querySelector('.playback-error')?.textContent.includes('verification failed')");
  const failedCount = requests.length;
  await wait(1600);
  assert.equal(requests.length, failedCount, "Recovery must stop when all providers fail");
  allSourcesFail = false;
  await evaluate("document.querySelector('.playback-error .btn-secondary').click()");
  await until("window.electron.queryPlayerHealth(document.querySelector('webview').getWebContentsId()).then(s=>s?.state==='ready')");
  await until("!document.querySelector('.playback-error')");
  console.log("PASS all-failed recovery is bounded; retry recovers");
  await evaluate("[...document.querySelectorAll('.sidebar-btn')].find(x=>x.textContent.includes('Library')).click()");
  await until("[...document.querySelectorAll('.card')].some(x=>x.textContent.includes('Playback Test Series'))");
  await evaluate("[...document.querySelectorAll('.card')].find(x=>x.textContent.includes('Playback Test Series')).click()");
  await until("document.querySelectorAll('.episode-card').length===2");
  await evaluate("document.querySelector('.episode-card').click()");
  await until("document.querySelector('.playback-error')?.textContent.includes('verification failed')");
  assert.equal(await evaluate("document.querySelector('.playback-error').textContent.includes('No other source')"), true);
  assert.equal(await evaluate("!!document.querySelector('.playback-error .btn-primary')"), false);
  console.log("PASS TV source failure is actionable; movie-only/retired providers are not used");
  challengeRequired = true;
  await evaluate("document.querySelector('.playback-error .btn-secondary').click()");
  await until("document.querySelector('.playback-notice')?.textContent.includes('Complete this source')");
  assert.equal(await evaluate("!!document.querySelector('.playback-error')"), false);
  id = await evaluate("document.querySelector('webview').getWebContentsId()");
  const guest = webContents.fromId(id);
  assert.equal(guest.getURL().startsWith("https://vsembed.su/"), true);
  assert.equal(guest.session.getUserAgent().includes(`Chrome/${process.versions.chrome}`), true);
  assert.equal(await guest.executeJavaScript("document.body.dataset.inlineRan"), undefined);
  console.log("PASS interactive verification remains visible; provider CSP remains effective");
  tvSourceRecovered = true;
  await evaluate("[...document.querySelectorAll('.playback-recovery button')].find(b=>b.textContent==='Retry player').click()");
  await until("window.electron.queryPlayerHealth(document.querySelector('webview').getWebContentsId()).then(s=>s?.state==='ready')");
  const recoveredId = await evaluate("document.querySelector('webview').getWebContentsId()");
  assert.equal(await webContents.fromId(recoveredId).executeJavaScript("document.querySelector('video')?.videoWidth"), 320);
  console.log("PASS TV page retry recovers decoded video when fixture provider becomes available");

}).then(() => finish(0), error => { console.error(error); finish(1); });
async function finish(code) {
  if (win && !win.isDestroyed()) win.destroy();
  await player.close(); upstream?.closeAllConnections(); upstream?.close(); app.exit(code);
}
