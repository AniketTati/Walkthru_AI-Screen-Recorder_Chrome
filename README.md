# Screen Recorder Chrome Extension

A simple and clean Chrome extension for recording your screen, window, or tab with audio and camera options.

## Features

- **Recording Options**
  - Tab recording
  - Window recording
  - Entire screen recording

- **Audio Control**
  - Toggle audio on/off

- **Camera Recording**
  - Picture-in-Picture mode (camera overlay on screen recording)
  - Separate file mode (saves screen and camera as separate files)

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the folder containing these extension files
5. The Screen Recorder icon should appear in your extensions toolbar

## Usage

1. Click the Screen Recorder extension icon
2. Choose your recording source (Tab, Window, or Entire Screen)
3. Toggle Audio on/off as needed
4. (Optional) Enable Camera and select mode:
   - **Picture-in-Picture**: Camera appears as overlay in bottom-right corner
   - **Separate File**: Screen and camera saved as two separate files
5. Click "Start Recording"
6. Select the screen/window/tab you want to record
7. Click "Stop Recording" when done
8. Your recording(s) will automatically download

## File Format

Recordings are saved as `.webm` files with VP9 codec.

## Permissions

- `activeTab`: Access to current tab for recording
- `desktopCapture`: Screen and window recording capability
- `storage`: Save user preferences (future feature)

## Technical Details

- Uses MediaRecorder API for recording
- Canvas API for Picture-in-Picture mode
- WebM/VP9 encoding for optimal quality and size

## Browser Support

- Chrome 70+
- Edge 79+
- Any Chromium-based browser with extension support
