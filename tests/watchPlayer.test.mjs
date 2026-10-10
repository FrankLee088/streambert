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

test("a loaded provider document can later fail verification", async t => {
  const view = new Webview(); const states = [];
  const watcher = watchPlayer(view, s => states.push(s), {
    inspect: async () => ({ state: "verification-failed" }), pollInterval: 5,
  }); t.after(() => watcher.dispose());
  view.emit("dom-ready");
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(states.at(-1).kind, "verification-failed");
  view.emit("dom-ready");
  assert.match(states.at(-1).error, /verification failed/);
});
test("verification awaiting user action is visible without becoming an error", async t => {
  const view = new Webview(); const states = [];
  const watcher = watchPlayer(view, s => states.push(s), {
    inspect: async () => ({ state: "verification-required" }), pollInterval: 5,
  }); t.after(() => watcher.dispose()); view.emit("dom-ready");
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(states.at(-1).error, null);
  assert.match(states.at(-1).notice, /Complete this source/);
});
test("inspection from a previous navigation cannot fail the new source", async t => {
  const view = new Webview(); const states = []; let resolve;
  const watcher = watchPlayer(view, s => states.push(s), {
    inspect: () => new Promise(r => { resolve = r; }),
  }); t.after(() => watcher.dispose()); view.emit("dom-ready");
  await new Promise(r => setTimeout(r, 10));
  view.emit("did-start-navigation", { isMainFrame: true, url: "https://another.example/player" });
  resolve({ state: "verification-failed" });
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(states.at(-1), { loading: true, error: null });
});
