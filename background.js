// Background service worker - Simple state management

chrome.runtime.onInstalled.addListener(() => {
  console.log('Screen Recorder extension installed');
  // Initialize storage
  chrome.storage.local.set({ isRecording: false });
});
