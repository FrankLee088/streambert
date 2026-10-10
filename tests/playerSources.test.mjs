import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlayerSource, getNextNonAsyncSource, getSourceUrl, PLAYER_SOURCES } from "../src/utils/playerSources.mjs";

test("retired saved providers migrate without generating requests to dead hosts", () => {
  for (const id of ["videasy", "vidking", "unknown", null]) {
    assert.equal(normalizePlayerSource(id, "movie"), "peachify");
    assert.equal(normalizePlayerSource(id, "tv"), "vidsrc");
    assert.equal(new URL(getSourceUrl(id, "movie", 101)).hostname, "peachify.top");
  }
  assert.equal(PLAYER_SOURCES.some(s => ["videasy", "vidking"].includes(s.id)), false);
});
test("movie-only source is never selected for a TV episode or anime TV fallback", () => {
  assert.equal(normalizePlayerSource("peachify", "tv"), "vidsrc");
  assert.equal(getNextNonAsyncSource("allmanga", "tv"), "vidsrc");
  assert.equal(getNextNonAsyncSource("vidsrc", "tv"), null);
  assert.match(getSourceUrl("peachify", "tv", 102, 2, 3), /\/embed\/tv\/102\/2\/3/);
});
test("automatic recovery cannot revisit a failed provider", () => {
  assert.equal(getNextNonAsyncSource("vidsrc", "movie", ["vidsrc"]), "peachify");
  assert.equal(getNextNonAsyncSource("peachify", "movie", ["vidsrc", "peachify"]), null);
  assert.equal(normalizePlayerSource("vidsrc", "movie"), "vidsrc");
});
