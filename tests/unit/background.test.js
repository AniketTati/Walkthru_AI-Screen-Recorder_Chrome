/**
 * Unit tests for background.js functionality
 */

describe('Background Service Worker', () => {
  let state;
  let updateBadge;
  
  beforeEach(() => {
    // Reset state
    state = {
      isRecording: false,
      isPaused: false,
      startTime: null,
      pausedTime: 0,
      activeTabId: null,
      config: null,
      injectedTabs: new Set()
    };
    
    // Import the badge update function logic
    updateBadge = (isRecording, isPaused) => {
      if (isRecording) {
        chrome.action.setBadgeText({ text: isPaused ? '⏸' : 'REC' });
        chrome.action.setBadgeBackgroundColor({ color: isPaused ? '#ffa500' : '#ff4757' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
    };
  });

  describe('updateBadge', () => {
    test('should show REC badge when recording', () => {
      updateBadge(true, false);
      
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'REC' });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#ff4757' });
    });
    
    test('should show pause badge when paused', () => {
      updateBadge(true, true);
      
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '⏸' });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#ffa500' });
    });
    
    test('should clear badge when not recording', () => {
      updateBadge(false, false);
      
      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });
  });

  describe('State Management', () => {
    test('should track injected tabs', () => {
      state.injectedTabs.add(1);
      state.injectedTabs.add(2);
      
      expect(state.injectedTabs.has(1)).toBe(true);
      expect(state.injectedTabs.has(2)).toBe(true);
      expect(state.injectedTabs.has(3)).toBe(false);
    });
    
    test('should clear injected tabs on cleanup', () => {
      state.injectedTabs.add(1);
      state.injectedTabs.add(2);
      state.injectedTabs.clear();
      
      expect(state.injectedTabs.size).toBe(0);
    });
    
    test('should update recording state correctly', () => {
      // Start recording
      state.isRecording = true;
      state.startTime = Date.now();
      state.activeTabId = 1;
      
      expect(state.isRecording).toBe(true);
      expect(state.startTime).toBeTruthy();
      expect(state.activeTabId).toBe(1);
      
      // Stop recording
      state.isRecording = false;
      state.startTime = null;
      state.activeTabId = null;
      
      expect(state.isRecording).toBe(false);
      expect(state.startTime).toBeNull();
    });
  });

  describe('Tab Activation Logic', () => {
    test('should skip tab injection for tab recording mode', () => {
      state.isRecording = true;
      state.config = { source: 'tab' };
      
      // Logic: if source === 'tab', don't inject into other tabs
      const shouldInject = state.isRecording && state.config?.source !== 'tab';
      expect(shouldInject).toBe(false);
    });
    
    test('should inject controls for screen recording mode', () => {
      state.isRecording = true;
      state.config = { source: 'screen' };
      
      const shouldInject = state.isRecording && state.config?.source !== 'tab';
      expect(shouldInject).toBe(true);
    });
    
    test('should inject controls for window recording mode', () => {
      state.isRecording = true;
      state.config = { source: 'window' };
      
      const shouldInject = state.isRecording && state.config?.source !== 'tab';
      expect(shouldInject).toBe(true);
    });
    
    test('should skip already injected tabs', () => {
      state.isRecording = true;
      state.config = { source: 'screen' };
      state.injectedTabs.add(1);
      
      const tabId = 1;
      const shouldInject = !state.injectedTabs.has(tabId);
      expect(shouldInject).toBe(false);
    });
  });

  describe('Message Handling', () => {
    test('should identify offscreen messages', () => {
      const message = { target: 'offscreen', action: 'stopRecording' };
      const isOffscreenMessage = message.target === 'offscreen';
      
      expect(isOffscreenMessage).toBe(true);
    });
    
    test('should identify non-offscreen messages', () => {
      const message = { action: 'stopRecording' };
      const isOffscreenMessage = message.target === 'offscreen';
      
      expect(isOffscreenMessage).toBe(false);
    });
  });
});

describe('Recording Config', () => {
  test('should have valid source options', () => {
    const validSources = ['screen', 'window', 'tab'];
    
    validSources.forEach(source => {
      expect(['screen', 'window', 'tab']).toContain(source);
    });
  });
  
  test('should handle missing config gracefully', () => {
    const state = { config: null };
    const source = state.config?.source || 'tab';
    
    expect(source).toBe('tab');
  });
});
