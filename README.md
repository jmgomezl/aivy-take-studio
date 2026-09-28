# Take Studio

**Your story, one good take at a time.** An independent creator tool: record
a scripted video in chapters, keep your best takes and export a finished film.
The 14-chapter Quorum film is included as a sample project.

[Open Take Studio](https://quorum.aivylabs.xyz/demo-video/studio/)

**Proprietary software · v1.3.0.** Hosted use is permitted for your personal or
commercial videos; software reuse and self-hosting require separate permission.
Your recordings remain yours. [License and prior MIT release](LICENSING.md).

```text
Choose a chapter → record voice / camera → choose & trim a take
                                             ↓
                       preview → combine → download video + voice
```

## Two ways to start

Choose a workflow under **New project**. Both keep every take and use the same
camera effects, audio polish, preview and export.

| Start with | What sets the timing | Best for |
| --- | --- | --- |
| **Video first** | Your existing demo film | A finished visual edit that needs narration |
| **Voice first** | Your selected, trimmed voice takes | Telling the story naturally, then adding footage |

### Voice first

1. Paste your script from ChatGPT, Claude or your own notes. Use `# Headings` to name sections, or **blank lines** to separate a plain-text script. You can start blank and
   add sections later. No chatbot account is connected to the studio.
2. Record or import each section at your own pace. Press **Stop** when done;
   the full take sets the section length. Switching or trimming takes moves the
   following sections automatically. The whole project is limited to 20 minutes.
3. Optionally choose **Transcribe this take**. Whisper Tiny runs in a worker
   on your device, with English, Spanish or automatic language detection.
   First use downloads approximately 65 MB of self-hosted runtime/model files;
   recordings are never sent to a transcription service. Canceling leaves your
   takes intact. Automatic words and timestamps can be wrong: listen and edit.
4. Import your real demo clips. Click a transcript timestamp to listen there;
   **+ Visual** creates a cut at that phrase. Choose a clip and its source start,
   or a title card. You can also add a cue at an exact second manually.
5. Review and export. Clips play at **1×** with their audio muted. If footage is
   too short, choose another cut or explicitly enable **Hold last frame**.
   The studio does not invent demo footage or silently loop or speed it up.

Visual cues are relative to each section. After a shorter retake or a trim,
review their timing; invalid cues block video export with a specific explanation.
The ZIP backup includes clip originals, transcripts, cues and all takes. Older
video-first backups still restore as separate projects.

This is a guided editor, not an autonomous video generator: you choose the
footage and cuts. Transcript corrections change the guide, not the audio.

## Record (Video first)

1. **Set up mic & camera.** Choose your microphone. Optionally enable the camera,
   choose a device, then press **Enable preview**. Nothing records before you
   press **Record chapter** and the three-second countdown finishes.
2. **Record one chapter.** Follow the script beside the video. The clocks show
   elapsed time, time remaining and position in the full film. Recording stops
   at the chapter boundary by default. Turn that off in settings to allow an
   overrun; trim it before export.
3. **Keep your favourite take.** Every retake stays available. Choose one, listen,
   trim its start/end, or add a lead-in. Imported audio and video work too.
4. **Build a preview**, then **Finish & export**. The chosen take in each chapter
   follows the original video timing. Export refuses missing chapters unless
   you explicitly allow silent gaps for a draft.
5. **Download the video and a backup.** The backup includes original recordings,
   trim decisions, selected takes, camera settings and your script. Custom
   projects include the imported visual video too.

The studio does **not** upload your recordings or automatically publish the final
video. Download it, watch it once in full and submit it yourself.

## Camera

- Choose the MacBook camera or an iPhone that macOS exposes through
  [Continuity Camera](https://support.apple.com/en-us/102546). The website cannot
  activate a phone that the operating system has not made available. Use the
  **Find devices ↻** button after connecting it. Discovery briefly requests
  camera/microphone access, stops its temporary streams, then lists the inputs.
  It does not record or upload anything. Select your iPhone by its device name,
  enable **Record me with the camera**, then **Enable preview**.
- A reconnected device is restored by its saved ID or unique device name. A
  missing camera stays selected with a reconnect notice rather than silently
  switching to the Mac camera. Device lists refresh when setup opens, the tab
  becomes visible, or the browser reports a device change.
- If the iPhone is absent, connect it by USB, tap **Trust**, then lock and mount
  it nearby. Camera permission is separate from microphone permission. Check
  the site's browser permissions and macOS **Privacy & Security → Camera**.
  If Chrome still exposes no cameras, save your work and restart the browser.
  A disconnected camera prevents a new camera take; a disconnection during
  recording stops and retains the captured part.
- **Remove background → Portrait** uses Google's multiclass portrait model to
  separate hair, skin, clothes and accessories from the background. It runs in
  a local worker with GPU acceleration and a CPU fallback. **Fast** uses the
  smaller model when a device needs lighter processing.
- **Chair & edge cleanup** removes uncertain background pixels with a soft edge.
  Increase it if furniture remains; reduce it if hair or headphones disappear.
  Preview and export use the same settings, including for existing camera takes.
  No frames go to an AI service. Similar colors, lighting and motion can still
  confuse the model; this is not a guarantee of perfect removal.
- The presenter defaults to the **lower left**. Change corner, size or mirror
  orientation. Turn the camera off for individual chapters where it covers
  important evidence. A rounded frame is available as an alternative.
- Original camera recordings keep the original background **in your local
  browser and backup**. The final composited video uses the chosen effect.

## What “polish” does

Voice levels are matched using a silence-aware RMS estimate, with a maximum
6 dB boost and peak headroom. A 25 ms fade at each audio edge reduces clicks;
100 ms presenter fades soften video entrances/exits. Short takes leave silence
inside their allotted chapter. Speech and the visual edit are never sped up.

This does not invent words, repair a sentence cut in the middle or perform
studio-grade denoising. The browser's microphone processing helps with noise and
echo. Use a retake when the delivery does not fit; headphones help during review.

## Local storage and export

| Function | Implementation |
| --- | --- |
| Takes and settings | IndexedDB, scoped to this browser and origin. A take is called saved only after its transaction commits. |
| Backup / restore | Local ZIP via fflate. Restoring creates another project; it does not overwrite the original. |
| Microphone and camera | Browser `getUserMedia` and `MediaRecorder`; explicit user controls. |
| Background removal | Self-hosted MediaPipe 1.0.1, pinned portrait/fast models, GPU/CPU in a Web Worker. |
| Local transcription | Transformers.js 3.8.1 + multilingual Whisper Tiny q8, pinned and self-hosted. Phrase timestamps, editable text, cancelable worker. |
| Voice assembly | Decoded audio at 48 kHz, deterministic chapter placement, gain and fades. WAV export available separately. |
| Final composition | Mediabunny 1.56.1 + WebCodecs, a 30 fps canvas with exact frame timestamps. 1080p or 720p. |
| Format | H.264/AAC MP4 when the browser can encode both; VP9/Opus WebM fallback. The download uses its actual format. |

Keep the export tab open. Browser storage can be cleared or evicted; **backup is
the portable copy**. There is no cloud account recovery. Imports are limited to
20 minutes and 512 MB for the visual video, 256 MB per take. Browser ZIP backups
are limited to 512 MB; a long project may require individual take downloads.

Use a current Chrome or Edge on macOS for the broadest codec support. Device and
codec support is detected at runtime, and failures are shown instead of creating
a pretend export. Safari and specific Continuity Camera hardware still need
testing on your actual devices.

## Your own video projects

**New project** accepts a local video and a JSON chapter script. Download the
example in the dialog. Times must be consecutive and cover the entire video:

```json
{"title":"My demo","chapters":[
  {"start":0,"end":10,"title":"The problem","script":"Your own words."},
  {"start":10,"end":30,"title":"The demo","script":"Show what you built."}
]}
```

Without JSON, the imported video becomes one chapter. Edit text from the prompter.
The visual video’s existing audio is muted; the output uses your selected takes.
The original Quorum project and its recordings stay separate.

## Authorized development

The following instructions are for the copyright holder and developers with
separate written permission. They do not grant software reuse or self-hosting
rights. Run locally with **Node.js 22 or later**:

```sh
git clone https://github.com/jmgomezl/aivy-take-studio.git
cd aivy-take-studio
npm run dev
```

Open **http://127.0.0.1:5183/**. Runtime assets are already bundled; no install,
API key, account or Quorum backend is needed. Run `npm test` for the core checks.

The studio is plain HTML/CSS/ES modules and deploys as a static site. It has
**its own repository, dependencies and release directory**, separate from
Quorum's application and financial services. [Deployment guide](deploy/README.md).
The existing public URL is retained to preserve browser-saved recordings.

All default assets live in [`presets/quorum/`](presets/quorum/README.md) and
`assets/`; custom projects use your imported video and script. The default
project and IndexedDB identifiers remain compatible with the original studio.

To reproduce processing dependencies, run `npm ci --ignore-scripts`, then
`npm run vendor` and `npm run vendor:speech`. See [third-party notices](THIRD-PARTY.md) and [checks](QA.md).

**Submission boundary:** this is a founder's recording utility. It does not
extend Quorum's insurance functionality or prove a new blockchain integration.
