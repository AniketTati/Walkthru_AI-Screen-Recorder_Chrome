// Screen Recorder Background Service Worker

// Recording state
let state = {
  isRecording: false,
  isPaused: false,
  startTime: null,
  pausedTime: 0,
  activeTabId: null,
  config: null
};

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen') {
    return false;
  }
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'getState':
      return {
        isRecording: state.isRecording,
        isPaused: state.isPaused,
        startTime: state.startTime,
        pausedTime: state.pausedTime
      };

    case 'startRecording':
      return await startRecording(message.config);

    case 'stopRecording':
      return await stopRecording();

    case 'captureScreenshot':
      return await captureScreenshot(message.config);

    case 'pauseRecording':
      return await pauseRecording();

    case 'resumeRecording':
      return await resumeRecording();

    case 'resetRecording':
      return await resetRecording();

    case 'deleteRecording':
      return await deleteRecording();

    case 'toggleCameraBubble':
      return await toggleCameraBubble();

    case 'countdownComplete':
      return await onCountdownComplete();

    case 'countdownCancelled':
      return await onCountdownCancelled();

    case 'recordingStarted':
      state.isRecording = true;
      state.startTime = Date.now();
      await notifyPopup('stateUpdate', { state: 'recording', startTime: state.startTime });
      return { success: true };

    case 'recordingStopped':
      await cleanupRecording();
      return { success: true };

    case 'saveRecording':
      return await saveRecording(message.data, message.filename);

    default:
      return { error: 'Unknown action' };
  }
}

// Capture screenshot
async function captureScreenshot(config) {
  try {
    const source = config.source || 'tab';
    
    if (source === 'tab') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        return { success: false, error: 'No active tab found' };
      }
      
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
        return { success: false, error: 'Cannot capture screenshot on this page. Please navigate to a regular website.' };
      }
      
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `screenshot-${timestamp}.png`;
      
      const downloadId = await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
      });
      
      return { success: true, downloadId };
      
    } else {
      await ensureOffscreenDocument();
      
      const response = await chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'captureScreenshot',
        config: config
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to capture screenshot');
      }
      
      return { success: true };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Start recording flow
async function startRecording(config) {
  try {
    state.config = config;
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      return { success: false, error: 'No active tab found' };
    }
    
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      return { success: false, error: 'Cannot record on this page. Please navigate to a regular website.' };
    }
    
    state.activeTabId = tab.id;

    await ensureOffscreenDocument();

    const permResponse = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'requestPermission',
      config: state.config
    });
    
    if (!permResponse || !permResponse.success) {
      throw new Error(permResponse?.error || 'Permission denied');
    }

    await injectContentScript(tab.id);

    await chrome.tabs.sendMessage(tab.id, {
      action: 'showCountdown',
      config: state.config
    });

    return { success: true };
  } catch (e) {
    await cleanupRecording();
    return { success: false, error: e.message };
  }
}

// Countdown complete - actually start recording
async function onCountdownComplete() {
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'startRecording',
      config: state.config
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to start recording in offscreen');
    }

    await chrome.tabs.sendMessage(state.activeTabId, {
      action: 'showFloatingControls',
      config: state.config
    });

    return { success: true };
  } catch (e) {
    await cleanupRecording();
    return { success: false, error: e.message };
  }
}

// Countdown cancelled
async function onCountdownCancelled() {
  await cleanupRecording();
  return { success: true };
}

// Stop recording
async function stopRecording() {
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'stopRecording'
    });

    return { success: true };
  } catch (e) {
    await cleanupRecording();
    return { success: false, error: e.message };
  }
}

// Pause recording
async function pauseRecording() {
  try {
    state.isPaused = true;
    state.pausedTime = Date.now();

    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'pauseRecording'
    });

    if (state.activeTabId) {
      await chrome.tabs.sendMessage(state.activeTabId, {
        action: 'updateControls',
        isPaused: true
      });
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Resume recording
async function resumeRecording() {
  try {
    state.isPaused = false;

    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'resumeRecording'
    });

    if (state.activeTabId) {
      await chrome.tabs.sendMessage(state.activeTabId, {
        action: 'updateControls',
        isPaused: false
      });
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Reset recording (discard and start fresh)
async function resetRecording() {
  try {
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'discardRecording'
    });

    state.isRecording = false;
    state.isPaused = false;
    state.startTime = null;
    state.pausedTime = 0;

    if (state.activeTabId) {
      await chrome.tabs.sendMessage(state.activeTabId, {
        action: 'showCountdown',
        config: state.config
      });
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Delete recording (discard without download)
async function deleteRecording() {
  try {
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'discardRecording'
    });

    await cleanupRecording();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Toggle camera bubble visibility
async function toggleCameraBubble() {
  try {
    if (state.activeTabId) {
      await chrome.tabs.sendMessage(state.activeTabId, {
        action: 'toggleCameraBubble'
      });
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Cleanup after recording ends
async function cleanupRecording() {
  if (state.activeTabId) {
    try {
      await chrome.tabs.sendMessage(state.activeTabId, {
        action: 'hideFloatingControls'
      });
    } catch (e) {
      // Tab might be closed
    }
  }

  try {
    await chrome.offscreen.closeDocument();
  } catch (e) {
    // Might not exist
  }

  state.isRecording = false;
  state.isPaused = false;
  state.startTime = null;
  state.pausedTime = 0;
  state.activeTabId = null;

  await notifyPopup('stateUpdate', { state: 'stopped' });
}

// Inject content script into tab
async function injectContentScript(tabId) {
  try {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      return; // Already injected
    } catch (e) {
      // Not yet injected, proceed
    }

    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['content.css']
    });

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (e) {
      throw new Error('Content script failed to initialize');
    }
    
  } catch (e) {
    throw e;
  }
}

// Ensure offscreen document exists
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existing.length > 0) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA', 'DISPLAY_MEDIA', 'BLOBS'],
      justification: 'Recording screen with getDisplayMedia, camera with getUserMedia, and creating blob URLs for download'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

// Notify popup of state changes
async function notifyPopup(action, data) {
  try {
    await chrome.runtime.sendMessage({ action, ...data });
  } catch (e) {
    // Popup might be closed
  }
}

// Save recording using chrome.downloads API
async function saveRecording(base64data, filename) {
  try {
    const downloadId = await chrome.downloads.download({
      url: base64data,
      filename: filename,
      saveAs: true
    });
    
    return { success: true, downloadId };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
