# Habit tick sounds

Drop three files here and they replace the synthesized placeholders on next load:

- `partial.ogg` — a plain click (plays on a partial tick)
- `complete.ogg` — the Switch-style click (plays on a complete tick)
- `off.ogg` — a short swoosh (plays on toggle-off)

Master format to hand over: mono WAV or FLAC, 44.1 kHz, at most 0.4 s, with
leading silence trimmed — the trim is what makes playback feel instant.
Transcode to OGG Vorbis around 48 kbps (a few KB per file); decoding happens
once at load, so compression never affects click latency.

`ffmpeg -i master.wav -ac 1 -c:a libvorbis -b:a 48k partial.ogg`
