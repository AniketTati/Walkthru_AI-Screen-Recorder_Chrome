// Screen Recorder Background Service Worker
// Central coordinator and state manager

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
  // Ignore messages meant for offscreen document
  if (message.target === 'offscreen') {
    return false;
  }
  
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
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

    case 'downloadRecording':
      return await downloadRecording(message.dataUrl, message.filename);

    case 'saveRecording':
      return await saveRecording(message.data, message.filename);

    default:
      return { error: 'Unknown action' };
  }
}

// Start recording flow
async function startRecording(config) {
  console.log('Background: Starting recording with config:', config);
  
  try {
    state.config = config;
    
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Background: Active tab:', tab);
    
    if (!tab) {
      return { success: false, error: 'No active tab found' };
    }
    
    // Check if it's a valid URL (not chrome://, about:, etc.)
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      return { success: false, error: 'Cannot record on this page. Please navigate to a regular website.' };
    }
    
    state.activeTabId = tab.id;

    // Create offscreen document first
    console.log('Background: Creating offscreen document...');
    await ensureOffscreenDocument();
    console.log('Background: Offscreen document ready');

    // Request permission FIRST (shows screen picker dialog)
    console.log('Background: Requesting screen permission...');
    const permResponse = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'requestPermission',
      config: state.config
    });
    console.log('Background: Permission response:', permResponse);
    
    if (!permResponse || !permResponse.success) {
      throw new Error(permResponse?.error || 'Permission denied');
    }

    // Inject content script
    await injectContentScript(tab.id);

    // Now start countdown (permission already granted)
    console.log('Background: Sending showCountdown to tab:', tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'showCountdown',
      config: state.config
    });
    console.log('Background: showCountdown response:', response);

    return { success: true };
  } catch (e) {
    console.error('Background: Failed to start recording:', e);
    // Cleanup on failure
    await cleanupRecording();
    return { success: false, error: e.message };
  }
}

// Countdown complete - actually start recording
async function onCountdownComplete() {
  console.log('Background: Countdown complete, starting recording...');
  
  try {
    // Offscreen document and permission should already be ready
    // Just start the actual recording
    console.log('Background: Sending startRecording to offscreen...');
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'startRecording',
      config: state.config
    });
    console.log('Background: Offscreen response:', response);

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to start recording in offscreen');
    }

    // Show floating controls
    console.log('Background: Showing floating controls...');
    await chrome.tabs.sendMessage(state.activeTabId, {
      action: 'showFloatingControls',
      config: state.config
    });
    console.log('Background: Floating controls shown');

    return { success: true };
  } catch (e) {
    console.error('Background: Failed to start recording after countdown:', e);
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
    console.log('Background: Stopping recording...');
    
    // Tell offscreen to stop and download
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'stopRecording'
    });
    
    console.log('Background: Offscreen response:', response);

    // Cleanup will be called when offscreen confirms stop
    return { success: true };
  } catch (e) {
    console.error('Failed to stop recording:', e);
    // Try to cleanup anyway
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

    // Update floating controls
    if (state.activeTabId) {
      await chrome.tabs.sendMessage(state.activeTabId, {
        action: 'updateControls',
        isPaused: true
      });
    }

    return { success: true };
  } catch (e) {
    console.error('Failed to pause recording:', e);
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

    // Update floating controls
    if (state.activeTabId) {
      await chrome.tabs.sendMessage(state.activeTabId, {
        action: 'updateControls',
        isPaused: false
      });
    }

    return { success: true };
  } catch (e) {
    console.error('Failed to resume recording:', e);
    return { success: false, error: e.message };
  }
}

// Reset recording (discard and start fresh)
async function resetRecording() {
  try {
    // Tell offscreen to discard
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'discardRecording'
    });

    // Reset state
    state.isRecording = false;
    state.isPaused = false;
    state.startTime = null;
    state.pausedTime = 0;

    // Show countdown again
    if (state.activeTabId) {
      await chrome.tabs.sendMessage(state.activeTabId, {
        action: 'showCountdown',
        config: state.config
      });
    }

    return { success: true };
  } catch (e) {
    console.error('Failed to reset recording:', e);
    return { success: false, error: e.message };
  }
}

// Delete recording (discard without download)
async function deleteRecording() {
  try {
    // Tell offscreen to discard
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'discardRecording'
    });

    await cleanupRecording();
    return { success: true };
  } catch (e) {
    console.error('Failed to delete recording:', e);
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
  // Remove floating controls
  if (state.activeTabId) {
    try {
      await chrome.tabs.sendMessage(state.activeTabId, {
        action: 'hideFloatingControls'
      });
    } catch (e) {
      // Tab might be closed
    }
  }

  // Close offscreen document
  try {
    await chrome.offscreen.closeDocument();
  } catch (e) {
    // Might not exist
  }

  // Reset state
  state.isRecording = false;
  state.isPaused = false;
  state.startTime = null;
  state.pausedTime = 0;
  state.activeTabId = null;

  // Notify popup
  await notifyPopup('stateUpdate', { state: 'stopped' });
}

// Inject content script into tab
async function injectContentScript(tabId) {
  console.log('Background: Injecting content script into tab:', tabId);
  
  try {
    // Check if already injected
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      console.log('Background: Content script already injected, response:', response);
      return; // Already injected
    } catch (e) {
      console.log('Background: Content script not yet injected, proceeding...');
    }

    // Inject CSS first
    console.log('Background: Injecting CSS...');
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['content.css']
    });
    console.log('Background: CSS injected successfully');

    // Inject JS
    console.log('Background: Injecting JS...');
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    console.log('Background: JS injected successfully');
    
    // Wait a moment for script to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify injection
    try {
      const verifyResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      console.log('Background: Content script verified:', verifyResponse);
    } catch (e) {
      console.error('Background: Content script injection verification failed:', e);
      throw new Error('Content script failed to initialize');
    }
    
  } catch (e) {
    console.error('Background: Failed to inject content script:', e);
    throw e;
  }
}

// Ensure offscreen document exists - following official Chrome pattern
let creatingOffscreen = null; // Global promise to avoid concurrency issues

async function ensureOffscreenDocument() {
  console.log('Background: Checking for existing offscreen document...');
  
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  
  console.log('Background: Existing offscreen documents:', existing.length);

  if (existing.length > 0) {
    console.log('Background: Offscreen document already exists');
    return;
  }

  // Create offscreen document with concurrency handling
  if (creatingOffscreen) {
    console.log('Background: Waiting for ongoing creation...');
    await creatingOffscreen;
  } else {
    console.log('Background: Creating offscreen document...');
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA', 'DISPLAY_MEDIA', 'BLOBS'],
      justification: 'Recording screen with getDisplayMedia, camera with getUserMedia, and creating blob URLs for download'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
    console.log('Background: Offscreen document created');
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

// Download recording using chrome.downloads API
async function downloadRecording(dataUrl, filename) {
  console.log('Background: Downloading recording:', filename);
  
  try {
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });
    
    console.log('Background: Download started, id:', downloadId);
    return { success: true, downloadId };
  } catch (e) {
    console.error('Background: Download failed:', e);
    return { success: false, error: e.message };
  }
}

// Save recording - receives base64 data from offscreen
async function saveRecording(base64data, filename) {
  console.log('Background: Saving recording:', filename, 'data length:', base64data?.length);
  
  try {
    // Use chrome.downloads.download with the data URL
    const downloadId = await chrome.downloads.download({
      url: base64data,
      filename: filename,
      saveAs: true  // Let user choose where to save
    });
    
    console.log('Background: Download initiated, id:', downloadId);
    return { success: true, downloadId };
  } catch (e) {
    console.error('Background: Save failed:', e);
    return { success: false, error: e.message };
  }
}
