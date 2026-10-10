import { test } from "node:test";
import assert from "node:assert/strict";
import { watchPlayer } from "../src/utils/watchPlayer.mjs";

class Webview extends EventTarget {
  url = "https://player.example/movie/1";
  reloads = 0;
  getURL() { return this.url; }
  reload() { this.reloads++; }
  executeJavaScript() { return Promise.resolve("loading"); }
  emit(name, fields = {}) { this.dispatchEvent(Object.assign(new Event(name), fields)); }
}

test("DOM readiness reveals player without waiting for slow third-party page resources", t => {
  const view = new Webview(); const states = [];
  const watcher = watchPlayer(view, s => states.push(s)); t.after(() => watcher.dispose());
  view.emit("dom-ready"); assert.deepEqual(states.at(-1), { loading: false, error: null });
});
test("main-frame failures remain visible even when Chromium loads its error document; retry recovers", t => {
  const view = new Webview(); const states = [];
  const watcher = watchPlayer(view, s => states.push(s)); t.after(() => watcher.dispose());
  view.emit("did-fail-load", { isMainFrame: true, errorCode: -105, errorDescription: "ERR_NAME_NOT_RESOLVED" });
  view.emit("dom-ready"); assert.match(states.at(-1).error, /ERR_NAME_NOT_RESOLVED/);
  watcher.retry(); assert.equal(view.reloads, 1); assert.equal(states.at(-1).loading, true);
  view.emit("dom-ready"); assert.equal(states.at(-1).error, null);
});
test("cancelled navigation and failed ad subframes do not hide the player", t => {
  const view = new Webview(); const states = [];
  const watcher = watchPlayer(view, s => states.push(s)); t.after(() => watcher.dispose());
  view.emit("dom-ready");
  view.emit("did-fail-load", { isMainFrame: true, errorCode: -3 });
  view.emit("did-fail-load", { isMainFrame: false, errorCode: -105 });
  assert.deepEqual(states.at(-1), { loading: false, error: null });
});
test("blank resolver page does not falsely finish loading and a stall becomes actionable", async t => {
  const view = new Webview(); view.url = "about:blank"; const states = [];
  const watcher = watchPlayer(view, s => states.push(s), { timeout: 15 }); t.after(() => watcher.dispose());
  view.emit("dom-ready"); assert.equal(states.at(-1).loading, true);
  await new Promise(resolve => setTimeout(resolve, 30)); assert.match(states.at(-1).error, /did not respond/);
});
test("renderer crash is reported and disposal removes handlers/timers", async () => {
  const view = new Webview(); const states = [];
  const watcher = watchPlayer(view, s => states.push(s), { timeout: 15 });
  view.emit("render-process-gone", { reason: "crashed" }); assert.match(states.at(-1).error, /crashed/);
  watcher.dispose(); const count = states.length;
  view.emit("dom-ready"); await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(states.length, count);
});
