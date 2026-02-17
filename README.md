# Screen Recorder Chrome Extension

A Chrome extension for screen recording with camera overlay, **teleprompter scripts**, pause/resume, and floating controls.

## Features

- **Multiple Recording Sources**
  - Browser tab
  - Application window
  - Entire screen

- **Audio Options**
  - System audio capture
  - Microphone recording
  - Both combined

- **Camera Overlay**
  - Live camera bubble (draggable)
  - Static profile photo option
  - Size options: Small (80px), Medium (120px), Large (160px)
  - Toggle visibility during recording
  - **Note**: The camera bubble is rendered as a DOM overlay on the page. When recording **Entire Screen** or **Window**, the overlay is part of the captured region and appears in the final video. When recording a **Browser Tab**, the overlay is drawn inside the tab and is included only if the tab content is what’s being shared (not a separate window). If you need the camera always baked into the video regardless of source, use Entire Screen or Window and ensure the bubble is visible in the captured area.

- **Teleprompter**
  - Create and manage scripts in the **Scripts** page (opened via "Manage Scripts" in the popup).
  - **Display modes**: **Separate window** (not recorded)—script scrolls in sync with recording time; **Overlay** (on page, recorded)—draggable script bubble on the tab with synced auto-scroll.
  - Per-script **scroll speed** (WPM) and **timeline markers** (scroll to a position at a given time in the recording).
  - Toggle script visibility during recording from the floating control bar.

- **Quality Presets**
  - 720p (HD), 1080p (Full HD), 4K (Ultra HD)
  - Bitrate scales with resolution for optimal quality

- **Recording Controls**
  - Countdown: Start immediately, or 3/5/10 second countdown
  - Floating control bar (draggable)
  - Pause/Resume recording
  - Reset and start over
  - Delete recording

- **Other Options**
  - Custom filename prefix for recordings and screenshots
  - Microphone level indicator when mic is selected
  - All preferences saved locally (no re-configuration needed)

- **Screenshot Mode**
  - Capture tab, window, or screen
  - Saves as PNG

## TODO

**Goal:** Turn raw screen recordings into polished product walkthroughs automatically.

### Phase 1: Metadata capture (foundation)

Record interaction metadata alongside the video so we can segment and annotate later:

- [ ] **Log DOM events during recording** — Capture clicks, focus changes, and scrolls with timestamps from the content script. Save as JSON sidecar (e.g. `recording.webm` + `recording.events.json`).
- [ ] **Pause / resume in metadata** — Ensure pause/resume boundaries are stored so we can optionally trim idle or paused segments.
- [ ] **Teleprompter timeline → metadata** — Export script markers and scroll positions so narration and script sync can be used for chaptering.

### Phase 2: Key moment detection

Identify important segments for highlights, steps, and cuts:

- [ ] **Frame-based change detection** — Use `requestVideoFrameCallback` or WebCodecs to extract frames and detect significant UI changes (pixel diff or perceptual hash).
- [ ] **Click / interaction clustering** — Treat click locations + timestamps as candidate “key moments” for step boundaries (similar to Zight, Glitter).
- [ ] **Silence / speech detection** — If mic is used, detect speech vs silence to trim filler or split into logical sections (e.g. via Web Audio or external transcription API).
- [ ] **AI scene detection** — Optional: use a vision/transcription API to detect “scenes” or “steps” from frames + audio for higher-level segmentation.

### Phase 3: Post-recording processing pipeline

Transform raw recording + metadata into structured content:

- [ ] **Extract step screenshots** — Grab frames at each key moment for step-by-step guides (screenshots per step).
- [ ] **Generate transcript** — Transcribe audio (Web Speech API, Whisper, or cloud API) with timestamps.
- [ ] **Auto-generate step descriptions** — Use AI (e.g. vision + transcript) to describe each step (“Click Settings”, “Enter email”, etc.) for guides and captions.
- [ ] **Produce structured output** — JSON/Markdown step list: `{ steps: [{ time, screenshot, description, click? }] }` for downstream tools.

### Phase 4: Polished walkthrough output

Apply professional walkthrough patterns (zoom, captions, structure):

- [ ] **Step-by-step guide** — Export an interactive or static guide with screenshots + descriptions (HTML/MD or embeddable widget).
- [ ] **Highlighted video** — Generate a trimmed/split video with zoom-in on clicks (e.g. via Remotion, FFmpeg, or cloud video API).
- [ ] **Captions / annotations** — Add auto-generated captions or on-screen annotations at key moments.
- [ ] **Intro / outro support** — Optional templates or placeholders for intro/outro clips (per TechSmith, Wistia best practices).
- [ ] **Multiple formats** — Support export as: trimmed WebM, GIF highlights, PDF/HTML guide, or link to cloud-rendered polished video.

### Phase 5: UX and integration

- [ ] **“Create walkthrough” action** — After stop, offer “Turn into walkthrough” flow (local processing or send to backend).
- [ ] **Progress + settings** — UI for choosing output type (guide vs video), quality, and whether to use cloud vs local processing.
- [ ] **Backend / API option** — Design for optional cloud pipeline (e.g. Hexus, Videate, or custom) for heavy lifting (AI, video rendering) if local isn’t feasible.

### References

- [Hexus AI](https://www.hexus.ai/video-to-demo) — Video → interactive demos
- [Glitter AI](https://www.glitter.io/) — Video → step-by-step guides
- [Zight](https://zight.com/step-by-step-guide/) — Clicks/actions → structured guides
- [RecordIt](https://recordit.dev/) — Recording with debug metadata
- [WebCodecs / requestVideoFrameCallback](https://web.dev/articles/requestvideoframecallback-rvfc) — Frame-level video processing

## Installation

### From Chrome Web Store
1. Visit the Chrome Web Store (link coming soon)
2. Click "Add to Chrome"
3. Click "Add Extension"

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the extension folder
6. The Screen Recorder icon will appear in your toolbar

## Usage

### Video Recording
1. Click the extension icon
2. Select your recording source (Tab, Window, or Screen)
3. Choose quality preset (720p, 1080p, or 4K)
4. Choose countdown (Start immediately, or 3/5/10 sec)
5. Choose camera and microphone options
6. Optionally select a **teleprompter script** and display mode (Separate window or Overlay)
7. Optionally add a filename prefix
8. Click "Start Recording"
9. Select what to share in the browser dialog
10. Countdown appears (if not "Start immediately"), then use the floating controls to pause, resume, or stop
11. Recording saves automatically to your Downloads folder when you stop

**Tip:** Enable Chrome's "Ask where to save each file before downloading" to choose the save location.

### Teleprompter & Scripts
1. In the popup, click **Manage Scripts** to open the Scripts page
2. Create a new script, set a name, scroll speed (WPM), and add timeline markers (position at time) if needed
3. Save the script and return to the popup
4. Select the script and display mode: **Separate window** (script in its own window, not recorded) or **Overlay** (script on the page, recorded)
5. Start recording; the script scrolls in sync with the recording timer. Use the script button on the floating bar to show/hide the teleprompter

### Keyboard Shortcuts

- **Start Recording**: `Ctrl+Shift+R` (Windows/Linux) or `Command+Shift+R` (Mac) — Opens the popup
- **Stop Recording**: `Ctrl+Shift+S` (Windows/Linux) or `Command+Shift+S` (Mac) — Stops the current recording

You can customize these in `chrome://extensions/shortcuts`.

### Screenshot
1. Click the extension icon
2. Switch to "Photo" mode
3. Select your source
4. Click "Take Screenshot"
5. Choose where to save

## File Format

- **Video**: WebM with VP9/VP8 codec. Bitrate depends on quality preset (4–16 Mbps). Recordings are saved directly to your Downloads folder; use Chrome's download settings if you want a "Save As" prompt.
- **Screenshots**: PNG

## Permissions

- `activeTab`: Access to current tab for recording
- `desktopCapture`: Screen and window recording
- `storage`: Save user preferences
- `offscreen`: Background recording support
- `scripting`: Inject floating controls
- `tabs`: Tab management
- `downloads`: Save recordings
- `notifications`: Show error alerts when recording fails (e.g. popup closed)

## Browser Support

- Chrome 116+ (requires Manifest V3 and offscreen API)
- Edge 116+
- Any Chromium-based browser with extension support

## Troubleshooting

### Camera Not Working
- Ensure camera permissions are granted in Chrome settings
- Close other applications using the camera
- Try selecting a different camera

### Recording Fails on Certain Pages
- Chrome extensions cannot record on:
  - `chrome://` pages
  - `chrome-extension://` pages
  - `about:` pages
- Navigate to a regular website to record

### No Audio in Recording
- Make sure to check "Share audio" when selecting the screen/window
- For tab recording, audio is captured automatically
- Verify microphone selection in the extension

## Project structure

| File | Purpose |
|------|--------|
| `manifest.json` | Extension manifest (v3) |
| `popup.html` / `popup.js` / `popup.css` | Popup UI (source, quality, camera, script, start) |
| `background.js` | Service worker: recording state, offscreen, teleprompter window |
| `content.js` / `content.css` | Injected UI: countdown, floating controls, camera/teleprompter overlay |
| `offscreen.html` / `offscreen.js` | Offscreen document for capturing audio |
| `scripts.html` / `scripts.js` / `scripts.css` | Scripts page: create/edit teleprompter scripts, timeline markers |
| `teleprompter.html` / `teleprompter.js` | Teleprompter window (separate window mode) |
| `icon.svg`, `generate-icons.js`, `generate-icons.sh` | Icon source and build script for PNGs |
| `tests/` | Unit tests (background, content, offscreen) and E2E (Puppeteer) |

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install
```

### Testing

The extension includes comprehensive tests:

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run E2E tests (requires Chrome)
npm run test:e2e

# Watch mode for development
npm run test:watch
```

#### Test Structure

```
tests/
├── setup.js              # Mock Chrome APIs and browser globals
├── unit/
│   ├── background.test.js    # Background service worker tests
│   ├── content.test.js       # Content script tests
│   └── offscreen.test.js     # Offscreen document tests
└── e2e/
    └── extension.test.js     # End-to-end browser tests
```

#### What's Tested

- **Unit Tests**: Test individual functions with mocked Chrome APIs
  - Badge updates
  - State management
  - Message filtering
  - Timer formatting
  - Recording size limits

- **E2E Tests**: Load the actual extension in Chrome using Puppeteer
  - Extension loading
  - Popup UI elements
  - Content script injection

#### Manual Testing

For features requiring user interaction (screen recording permission):

1. Load the extension in Chrome (`chrome://extensions/`)
2. Open Developer Tools (F12) to see console logs
3. Start a recording and check for:
   - "REC" badge on extension icon
   - Floating control bar appears
   - Timer counts up
4. Click Stop and verify:
   - Button shows "Stopping..."
   - Download dialog appears
   - Badge clears

### Debugging

Enable verbose logging by opening:
- **Background**: `chrome://extensions/` → Click "service worker" link
- **Popup**: Right-click extension icon → Inspect popup
- **Content Script**: F12 on the web page → Console tab
- **Offscreen**: `chrome://extensions/` → Check for errors

## Privacy

This extension:
- Does not collect any personal data
- Does not send recordings to any server
- All recordings are saved locally to your device
- Camera and microphone are only accessed during recording

## License

MIT License - Feel free to modify and distribute.
