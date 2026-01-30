// Simple background script - just manages offscreen document

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'background') {
    handleMessage(message, sendResponse);
    return true;
  }
});

async function handleMessage(message, sendResponse) {
  if (message.action === 'start') {
    await ensureOffscreenDocument();
    sendResponse({ success: true });
  } else if (message.action === 'stop') {
    sendResponse({ success: true });
  }
}

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  
  if (existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording screen and camera'
    });
  }
}
