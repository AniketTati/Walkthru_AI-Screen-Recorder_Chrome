// Background service worker for Chrome extension
// Handles extension lifecycle and permissions

chrome.runtime.onInstalled.addListener(() => {
  console.log('Screen Recorder extension installed');
});

// Handle any background tasks if needed in the future
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Currently no background tasks, but ready for future expansion
  return true;
});
