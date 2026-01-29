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

1. **Generate Icons**:
   - Open `generate-icons.html` in your browser
   - Click "Generate Icons" button
   - Three PNG files will download automatically
   - They will be in the extension folder

2. **Load Extension**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the folder containing these extension files
   - The Screen Recorder icon should appear in your extensions toolbar

3. **Setup Camera (First Time Only)**:
   - Click the extension icon
   - Toggle "Camera" on
   - Click "Setup Camera Permission" button
   - Allow camera permission when prompted in the new tab
   - Close the permission tab

## Usage

1. Click the Screen Recorder extension icon
2. Choose your recording source (Tab, Window, or Entire Screen)
3. Toggle Audio on/off as needed
4. (Optional) Enable Camera and select mode:
   - **Picture-in-Picture**: Camera appears as overlay in bottom-right corner
   - **Separate File**: Screen and camera saved as two separate files
5. Click "Start Recording"
6. Select the screen/window/tab you want to record in the browser dialog
7. Recording starts - popup shows timer
8. You can close the popup, recording continues in background
9. Reopen popup anytime to check timer or stop recording
10. Click "Stop Recording" when done
11. Your recording(s) will automatically download

## File Format

Recordings are saved as `.webm` files with VP9 codec.

## Permissions

- `activeTab`: Access to current tab for recording
- `desktopCapture`: Screen and window recording capability
- `storage`: Save user preferences (future feature)

**Note:** Camera access is requested through a separate permission setup page the first time you use it. This ensures Chrome properly shows the permission prompt.

## Technical Details

- Uses MediaRecorder API for recording
- Canvas API for Picture-in-Picture mode
- WebM/VP9 encoding for optimal quality and size

## Browser Support

- Chrome 70+
- Edge 79+
- Any Chromium-based browser with extension support

## Troubleshooting

### Camera Access Denied (No Permission Popup)

If you get "Camera access denied" without seeing a permission popup, Chrome has likely blocked or remembered a previous denial. Follow these steps:

#### Method 1: Reset Extension Permissions (Recommended)

1. Go to `chrome://extensions/`
2. Find "Screen Recorder" extension
3. Click "Remove" to uninstall it
4. Re-install by clicking "Load unpacked" and selecting the folder again
5. Click the extension icon
6. Enable Camera toggle
7. Click "Test Camera Access" button
8. When the permission popup appears, click "Allow"

#### Method 2: Check Chrome Camera Settings

1. Go to `chrome://settings/content/camera` in Chrome
2. Check if Camera is set to "Sites can ask to use your camera"
3. Look in the "Not allowed to use your camera" list
4. If you see `chrome-extension://...` entries, click the trash icon to remove them
5. Reload the extension and try again

#### Method 3: Check System Permissions (Mac)

1. Open System Settings → Privacy & Security → Camera
2. Make sure "Google Chrome" is checked/enabled
3. Restart Chrome completely (quit and reopen)
4. Try the extension again

#### Method 4: Check System Permissions (Windows)

1. Open Settings → Privacy → Camera
2. Make sure "Allow apps to access your camera" is ON
3. Make sure "Google Chrome" is allowed
4. Restart Chrome
5. Try the extension again

### No Camera Detected

If no camera is found:
- Ensure your camera is properly connected
- Check if your camera works in other applications (try opening Camera app or visiting `https://webcamtests.com`)
- Try unplugging and reconnecting your camera
- Restart your browser

### Camera Already in Use

If you get "Camera is already in use":
- Close other applications using the camera (Zoom, Skype, Teams, etc.)
- Close other browser tabs that might be using the camera
- Restart your browser if needed
