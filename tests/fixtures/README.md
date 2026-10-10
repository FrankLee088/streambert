Synthetic test media generated with FFmpeg, no third-party video content:

```sh
ffmpeg -f lavfi -i testsrc2=size=320x180:rate=24 -f lavfi -i sine=frequency=440 \
  -t 4 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart sample.mp4
ffmpeg -i sample.mp4 -c copy -hls_time 1 -hls_list_size 0 \
  -hls_segment_filename segment%d.ts sample.m3u8
```

The fixture server is local only. Electron tests block or stub external requests.
