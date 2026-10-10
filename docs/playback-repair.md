# Playback repair (2026-10-10)

This repair preserves the 1440p/2160p quality controls from the earlier macOS source bundle.

## Fixed paths

- Reveal the embedded player at DOM readiness instead of waiting indefinitely for every third-party resource. Main-frame failures and renderer crashes now show a message, retry and source-switch actions. Cancelled navigation and blocked ad frames are ignored.
- Initialize player sessions before their first navigation.
- Allocate a distinct local player URL and immutable media configuration for each playback request, including episode switches and pop-out playback.
- Follow bounded HTTP redirects, preserve byte ranges and URL ports, and time out failed media requests.
- Proxy HLS manifests, variants, segments, init segments and keys through one origin with the source Referer set by the main process. Renderer JavaScript no longer tries to set the forbidden Referer header.
- Bundle a pinned HLS.js dependency rather than fetching a player script at runtime. Prefer HLS.js MediaSource playback: Chromium can report native HLS as `maybe` even when it fails to decode it.
- Include the pop-out preload in packaged applications, and use Node 24 in the macOS build workflow.

## Validation

`npm test` passes 16 regression tests, including the six existing quality tests.
Vite production build passes. Electron 40.10.6 on Linux decoded synthetic MP4 and HLS video at 320×180 and advanced playback time with external requests blocked. The full built app's movie and TV pages recovered from a synthetic provider outage and decoded video after changing source. Both x64 and arm64 macOS application directories were cross-packaged; their ASAR contents include the HLS library and both preloads.

GitHub Actions run 38038319089 additionally passed the real Electron MP4/HLS playback and complete movie/TV recovery checks on a macOS runner, and produced a universal DMG. Installed-app behavior on the user's own Mac, audio output hardware and live third-party source availability have **not** been verified. Synthetic fixtures are not evidence that an unavailable external provider has recovered. The macOS packages are not Developer ID signed or notarized.

## Reproduce Electron checks

Generate `sample.mp4` with FFmpeg (H.264/AAC, 320×180, at least four seconds), then remux to `sample.m3u8` and MPEG-TS segments in the same directory. Use a desktop session (or Xvfb on Linux):

```sh
STREAMBERT_FIXTURES=/absolute/path/to/fixtures \
STREAMBERT_TEST_PROFILE=/absolute/path/to/temporary-profile \
npx electron tests/electron-playback.cjs

STREAMBERT_FIXTURES=/absolute/path/to/fixtures \
STREAMBERT_TEST_PROFILE=/absolute/path/to/another-temporary-profile \
npx electron tests/electron-ui.cjs
```

Run `npx vite build` before the full UI test. Test profiles must be disposable, never your normal Streambert profile. The UI test uses synthetic metadata and a dummy token, not a real account.

For GPU-driver troubleshooting, launch with `STREAMBERT_DISABLE_GPU=1`; the default continues to use hardware acceleration.

Prepared with Codex. No upstream PR or release publication is included.
