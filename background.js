// Screen Recorder Background Service Worker

// Recording state
let state = {
  isRecording: false,
  isPaused: false,
  startTime: null,
  pausedTime: 0,
  activeTabId: null,
  config: null,
  injectedTabs: new Set() // Track all tabs with injected controls
};

// Update badge to show recording status
function updateBadge(isRecording, isPaused) {
  if (isRecording) {
    chrome.action.setBadgeText({ text: isPaused ? '⏸' : 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: isPaused ? '#ffa500' : '#ff4757' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Listen for tab activation to re-inject controls when switching tabs during full-screen recording
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!state.isRecording || state.config?.source === 'tab') {
    return; // Only handle full-screen/window recording
  }
  
  // Skip if already injected into this tab
  if (state.injectedTabs.has(activeInfo.tabId)) {
    return;
  }
  
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    
    // Skip chrome:// and other restricted URLs
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      return;
    }
    
    // Inject controls into the new active tab
    await injectControlsIntoTab(activeInfo.tabId);
  } catch (e) {
    console.error('Tab activation handler error:', e);
  }
});

// Listen for page navigation to re-inject controls when a tab navigates during recording
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!state.isRecording || changeInfo.status !== 'complete') {
    return;
  }
  
  // Only re-inject if this tab was previously injected (content script lost on navigation)
  if (!state.injectedTabs.has(tabId)) {
    return;
  }
  
  // Mark as needing re-injection
  state.injectedTabs.delete(tabId);
  
  try {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      return;
    }
    
    await injectControlsIntoTab(tabId);
  } catch (e) {
    console.error('Tab navigation re-inject error:', e);
  }
});

// Inject controls into a specific tab
async function injectControlsIntoTab(tabId) {
  try {
    // First inject the content script if not already
    await injectContentScript(tabId);
    
    // Show the floating controls
    await chrome.tabs.sendMessage(tabId, {
      action: 'showFloatingControls',
      config: state.config,
      startTime: state.startTime,
      isPaused: state.isPaused
    });
    
    state.injectedTabs.add(tabId);
  } catch (e) {
    // Failed to inject into this tab
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'offscreen') {
    return false;
  }
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => {
      console.error('handleMessage error:', err);
      sendResponse({ success: false, error: err.message });
    });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'getState':
      return {
        isRecording: state.isRecording,
        isPaused: state.isPaused,
        startTime: state.startTime,
        pausedTime: state.pausedTime,
        source: state.config?.source || 'tab'
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
      state.injectedTabs.add(state.activeTabId);
      updateBadge(true, false);
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
    // Check if offscreen document exists
    const offscreenUrl = chrome.runtime.getURL('offscreen.html');
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl]
    });
    
    if (existing.length === 0) {
      // No offscreen document - just cleanup
      await cleanupRecording();
      return { success: true };
    }
    
    // Send stop command to offscreen
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'stopRecording'
    });
    
    // Safety net: force cleanup if offscreen doesn't respond in time
    // (handles cases where offscreen crashes, onstop never fires, etc.)
    setTimeout(async () => {
      if (state.isRecording) {
        console.log('Stop recording timeout - forcing cleanup');
        try { await chrome.offscreen.closeDocument(); } catch (e) {}
        await cleanupRecording();
      }
    }, 15000);

    return { success: true };
  } catch (e) {
    console.error('Stop recording error:', e);
    await cleanupRecording();
    return { success: false, error: e.message };
  }
}

// Pause recording
async function pauseRecording() {
  try {
    state.isPaused = true;
    state.pausedTime = Date.now();
    updateBadge(true, true);

    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'pauseRecording'
    });

    // Update controls in all injected tabs
    for (const tabId of state.injectedTabs) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'updateControls',
          isPaused: true
        });
      } catch (e) {
        // Tab might be closed
        state.injectedTabs.delete(tabId);
      }
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
    updateBadge(true, false);

    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'resumeRecording'
    });

    // Update controls in all injected tabs
    for (const tabId of state.injectedTabs) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          action: 'updateControls',
          isPaused: false
        });
      } catch (e) {
        // Tab might be closed
        state.injectedTabs.delete(tabId);
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Reset recording (discard current recording and start fresh)
// FIXED: Uses resetForRerecord to keep streams alive instead of discardRecording
// which killed the streams, causing the re-record to always fail silently
async function resetRecording() {
  try {
    // Reset the recorder but KEEP the screen/mic streams alive
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'resetForRerecord'
    });

    state.isRecording = false;
    state.isPaused = false;
    state.startTime = null;
    state.pausedTime = 0;
    updateBadge(false, false);
    
    // Hide controls in all injected tabs except the current one
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTabId = currentTab?.id;
    
    for (const tabId of state.injectedTabs) {
      if (tabId !== currentTabId) {
        try {
          await chrome.tabs.sendMessage(tabId, {
            action: 'hideFloatingControls'
          });
        } catch (e) {
          // Tab might be closed
        }
      }
    }
    state.injectedTabs.clear();

    // Show countdown in current tab (streams are still alive, so startRecording will work)
    if (currentTabId) {
      state.activeTabId = currentTabId;
      await chrome.tabs.sendMessage(currentTabId, {
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
  // Hide controls in all injected tabs
  for (const tabId of state.injectedTabs) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'hideFloatingControls'
      });
    } catch (e) {
      // Tab might be closed
    }
  }

  // Also try the current active tab as a fallback
  // (handles service worker restart case where injectedTabs is empty)
  try {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentTab && !state.injectedTabs.has(currentTab.id)) {
      await chrome.tabs.sendMessage(currentTab.id, {
        action: 'hideFloatingControls'
      });
    }
  } catch (e) {
    // Tab might not have content script
  }

  // Tell offscreen to cleanup its streams (but DON'T close the document yet -
  // closing immediately can invalidate blob URLs for pending downloads)
  try {
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'discardRecording'
    });
  } catch (e) {
    // Offscreen might not exist
  }

  updateBadge(false, false);
  
  state.isRecording = false;
  state.isPaused = false;
  state.startTime = null;
  state.pausedTime = 0;
  state.activeTabId = null;
  state.injectedTabs.clear();

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
    try {
      creatingOffscreen = chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA', 'DISPLAY_MEDIA', 'BLOBS'],
        justification: 'Recording screen with getDisplayMedia, camera with getUserMedia, and creating blob URLs for download'
      });
      await creatingOffscreen;
    } finally {
      // CRITICAL: Always reset even if createDocument throws, otherwise
      // all future recording attempts hang forever on the rejected promise
      creatingOffscreen = null;
    }
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
