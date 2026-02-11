# Screen Recorder Chrome Extension

A screen recorder extension with camera overlay, pause/resume, and floating controls.

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
  - Toggle visibility during recording

- **Recording Controls**
  - 3-second countdown before recording
  - Floating control bar (draggable)
  - Pause/Resume recording
  - Reset and start over
  - Delete recording

- **Screenshot Mode**
  - Capture tab, window, or screen
  - Saves as PNG

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
3. Choose camera and microphone options
4. Click "Start Recording"
5. Select what to share in the browser dialog
6. A 3-second countdown will appear
7. Use the floating controls to pause, resume, or stop
8. Recording saves automatically when you stop

### Screenshot
1. Click the extension icon
2. Switch to "Photo" mode
3. Select your source
4. Click "Take Screenshot"
5. Choose where to save

## File Format

- **Video**: WebM with VP9 codec (8 Mbps quality)
- **Screenshots**: PNG

## Permissions

- `activeTab`: Access to current tab for recording
- `desktopCapture`: Screen and window recording
- `storage`: Save user preferences
- `offscreen`: Background recording support
- `scripting`: Inject floating controls
- `tabs`: Tab management
- `downloads`: Save recordings

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
