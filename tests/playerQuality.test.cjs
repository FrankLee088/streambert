const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { controlQuality } = require("../src/ipc/playerQuality");

function frame(window, video = { videoHeight: 1080, currentTime: 120, paused: false }) {
  const context = vm.createContext({ window, document: { querySelector: () => video } });
  return quality => JSON.parse(JSON.stringify(vm.runInContext(`(${controlQuality})(${JSON.stringify(quality)})`, context)));
}

test("HLS switches real 2K/4K renditions, preserves playback and restores Auto", () => {
  let writes = 0;
  let currentLevel = -1;
  const hls = { levels: [{ height: 1080 }, { height: 1440 }, { height: 2160 }],
    get currentLevel() { return currentLevel; }, set currentLevel(v) { writes++; currentLevel = v; } };
  const video = { videoHeight: 1080, currentTime: 120, paused: false };
  const select = frame({ hls }, video);
  assert.equal(select("1440").available, true);
  assert.equal(currentLevel, 1);
  select("1440");
  assert.equal(writes, 1, "polls must not repeatedly switch or reset playback");
  select("2160");
  assert.equal(currentLevel, 2);
  assert.equal(video.currentTime, 120);
  assert.equal(video.paused, false);
  select("auto");
  assert.equal(currentLevel, -1);
});

test("missing 4K leaves current playback unchanged and does not claim success", () => {
  const hls = { levels: [{ height: 720 }, { height: 1080 }], currentLevel: 1 };
  const result = frame({ hls })("2160");
  assert.equal(result.available, false);
  assert.deepEqual(result.heights, [720, 1080]);
  assert.equal(hls.currentLevel, 1);
});

test("a newly created player receives the saved preference", () => {
  const window = { hls: { levels: [{ height: 2160 }], currentLevel: -1 } };
  const select = frame(window);
  select("2160");
  window.hls = { levels: [{ height: 2160 }], currentLevel: -1 };
  select("2160");
  assert.equal(window.hls.currentLevel, 0);
});

test("JWPlayer recognizes 2K/4K labels and its native Auto entry", () => {
  const selected = [];
  const player = { getQualityLevels: () => [{ label: "Auto" }, { label: "1440p" }, { label: "4K" }],
    setCurrentQuality: index => selected.push(index) };
  const select = frame({ jwplayer: () => player });
  select("1440"); select("2160"); select("auto");
  assert.deepEqual(selected, [1, 2, 0]);
});

test("Video.js enables requested quality and restores adaptive playback", () => {
  const video = { videoHeight: 1080 };
  const levels = [{ height: 1080, enabled: true }, { height: 2160, enabled: true }];
  const player = { el: () => ({ contains: v => v === video }), qualityLevels: () => levels };
  const select = frame({ videojs: { getPlayers: () => ({ main: player }) } }, video);
  select("2160");
  assert.deepEqual(levels.map(l => l.enabled), [false, true]);
  select("auto");
  assert.deepEqual(levels.map(l => l.enabled), [true, true]);
});

test("unsupported/private players and invalid selections never alter media", () => {
  assert.equal(frame({})("1440").supported, false);
  assert.equal(frame({})("malicious"), null);
  assert.equal(frame({ jwplayer: () => { throw Error("not ready"); } })("2160").supported, false);
});
