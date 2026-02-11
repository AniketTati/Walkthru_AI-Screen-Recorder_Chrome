// Screen Recorder Content Script
// Handles floating controls, camera bubble, and countdown

(function() {
  // Prevent multiple injections
  if (window.__screenRecorderInjected) {
    return;
  }
  window.__screenRecorderInjected = true;

  // State
  let config = null;
  let isPaused = false;
  let cameraStream = null;
  let cameraBubbleVisible = true;
  let startTime = null;
  let timerInterval = null;
  let pausedDuration = 0;
  let pauseStartTime = null;
  let teleprompterBubble = null;
  let teleprompterScript = null;
  let teleprompterInWindow = false;
  let teleprompterBubbleVisible = true;
  let teleprompterScrollInterval = null;

  // DOM Elements
  let countdownOverlay = null;
  let controlBar = null;
  let cameraBubble = null;

  // Icons
  const icons = {
    stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
    resume: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
    delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
    script: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`
  };

  // Message handler - only handle messages meant for content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Ignore messages meant for offscreen document
    if (message.target === 'offscreen') {
      return false;
    }
    
    // Only handle known content script actions
    const handledActions = ['ping', 'showCountdown', 'showFloatingControls', 'hideFloatingControls', 'updateControls', 'toggleCameraBubble', 'toggleTeleprompter'];
    if (!handledActions.includes(message.action)) {
      return false; // Don't handle this message
    }
    
    try {
      switch (message.action) {
        case 'ping':
          sendResponse({ success: true });
          break;
        case 'showCountdown':
          config = message.config;
          showCountdown();
          sendResponse({ success: true });
          break;
        case 'showFloatingControls':
          config = message.config;
          // Sync state from background if provided (when re-injecting on tab switch)
          if (message.startTime) {
            startTime = message.startTime;
          }
          if (message.isPaused !== undefined) {
            isPaused = message.isPaused;
          }
          showFloatingControls(message.startTime, message.isPaused, message.teleprompterScript, message.teleprompterInWindow);
          sendResponse({ success: true });
          break;
        case 'hideFloatingControls':
          hideFloatingControls();
          sendResponse({ success: true });
          break;
        case 'updateControls':
          updateControls(message.isPaused);
          sendResponse({ success: true });
          break;
        case 'toggleCameraBubble':
          toggleCameraBubble();
          sendResponse({ success: true });
          break;
        case 'toggleTeleprompter':
          toggleTeleprompter();
          sendResponse({ success: true });
          break;
      }
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    
    return true;
  });

  // Show countdown overlay
  function showCountdown() {
    removeCountdown();
    
    const raw = parseInt(config?.countdownDuration, 10);
    const duration = Math.min(10, Math.max(0, isNaN(raw) ? 3 : raw));
    if (duration <= 0) {
      chrome.runtime.sendMessage({ action: 'countdownComplete' });
      return;
    }
    
    countdownOverlay = document.createElement('div');
    countdownOverlay.className = 'sr-countdown-overlay';
    countdownOverlay.id = 'sr-countdown-overlay';
    countdownOverlay.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.85) !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
    `;
    
    const numberEl = document.createElement('div');
    numberEl.className = 'sr-countdown-number';
    numberEl.style.cssText = `
      font-size: 200px !important;
      font-weight: 700 !important;
      color: white !important;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'sr-countdown-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      margin-top: 40px !important;
      padding: 12px 32px !important;
      background: rgba(255, 255, 255, 0.2) !important;
      color: white !important;
      border: 2px solid rgba(255, 255, 255, 0.5) !important;
      border-radius: 8px !important;
      font-size: 16px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
    `;
    cancelBtn.onclick = () => {
      removeCountdown();
      chrome.runtime.sendMessage({ action: 'countdownCancelled' });
    };
    
    countdownOverlay.appendChild(numberEl);
    countdownOverlay.appendChild(cancelBtn);
    document.body.appendChild(countdownOverlay);
    
    let count = duration;
    
    function showNumber() {
      if (count > 0) {
        numberEl.textContent = count;
        numberEl.style.animation = 'none';
        void numberEl.offsetWidth;
        numberEl.style.animation = 'sr-countdown-pulse 1s ease-out';
        count--;
        setTimeout(showNumber, 1000);
      } else {
        removeCountdown();
        chrome.runtime.sendMessage({ action: 'countdownComplete' });
      }
    }
    
    showNumber();
  }

  // Remove countdown overlay
  function removeCountdown() {
    if (countdownOverlay) {
      countdownOverlay.remove();
      countdownOverlay = null;
    }
  }

  // Show floating controls
  async function showFloatingControls(syncStartTime, syncIsPaused, messageTeleprompterScript, messageTeleprompterInWindow) {
    removeFloatingControls();
    
    teleprompterScript = messageTeleprompterScript || null;
    teleprompterInWindow = messageTeleprompterInWindow || false;
    
    document.body.classList.add('sr-recording');
    // Use synced start time if provided (when switching tabs during recording)
    startTime = syncStartTime || Date.now();
    isPaused = syncIsPaused || false;
    pausedDuration = 0;
    
    controlBar = document.createElement('div');
    controlBar.className = 'sr-control-bar';
    controlBar.id = 'sr-control-bar';
    controlBar.style.cssText = `
      position: fixed !important;
      bottom: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 8px 16px !important;
      background: #1a1a1a !important;
      border-radius: 50px !important;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5) !important;
      z-index: 2147483646 !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
      cursor: grab !important;
      user-select: none !important;
    `;
    // Use the current paused state when creating controls (important for tab switches)
    controlBar.innerHTML = getControlBarHTML(isPaused);
    document.body.appendChild(controlBar);
    
    setupControlBarEvents();
    setupDraggable(controlBar);
    
    if (config && config.cameraId) {
      await createCameraBubble();
    }
    
    if (teleprompterScript) {
      createTeleprompterBubble();
    }
    
    startTimer();
  }

  // Button styles
  const btnStyle = `
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 10px 16px !important;
    background: transparent !important;
    color: white !important;
    border: none !important;
    border-radius: 25px !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
  `;
  
  const stopBtnStyle = btnStyle + `background: #ff4757 !important;`;
  const resumeBtnStyle = btnStyle + `background: #28a745 !important;`;
  const deleteBtnStyle = btnStyle + `color: #ff4757 !important;`;
  const dividerStyle = `width: 1px !important; height: 24px !important; background: rgba(255,255,255,0.2) !important; margin: 0 4px !important;`;
  const timerStyle = `padding: 0 16px !important; font-size: 18px !important; font-weight: 600 !important; color: white !important; min-width: 60px !important; text-align: center !important;`;

  // Get control bar HTML
  function getControlBarHTML(paused) {
    const hasCamera = config && config.cameraId;
    const hasTeleprompter = !!teleprompterScript || teleprompterInWindow;
    
    const scriptOffClass = teleprompterInWindow ? '' : (teleprompterBubbleVisible ? '' : 'off');
    const teleprompterBtn = hasTeleprompter ? `
          <div class="sr-divider" style="${dividerStyle}"></div>
          <button class="sr-control-btn script ${scriptOffClass}" style="${btnStyle}" data-action="toggleTeleprompter">
            ${icons.script}
          </button>
        ` : '';
    
    if (paused) {
      return `
        <button class="sr-control-btn reset" style="${btnStyle}" data-action="reset">
          ${icons.reset}
          <span>Reset</span>
        </button>
        <div class="sr-divider" style="${dividerStyle}"></div>
        <button class="sr-control-btn delete" style="${deleteBtnStyle}" data-action="delete">
          ${icons.delete}
          <span>Delete</span>
        </button>
        <div class="sr-divider" style="${dividerStyle}"></div>
        <button class="sr-control-btn resume" style="${resumeBtnStyle}" data-action="resume">
          ${icons.resume}
          <span>Resume</span>
        </button>
        ${hasCamera ? `
          <div class="sr-divider" style="${dividerStyle}"></div>
          <button class="sr-control-btn camera ${cameraBubbleVisible ? '' : 'off'}" style="${btnStyle}" data-action="toggleCamera">
            ${icons.camera}
          </button>
        ` : ''}${teleprompterBtn}
        <div class="sr-divider" style="${dividerStyle}"></div>
        <div class="sr-timer" id="sr-timer" style="${timerStyle}">00:00</div>
      `;
    } else {
      return `
        <button class="sr-control-btn stop" style="${stopBtnStyle}" data-action="stop">
          ${icons.stop}
          <span>Stop</span>
        </button>
        <div class="sr-divider" style="${dividerStyle}"></div>
        <button class="sr-control-btn pause" style="${btnStyle}" data-action="pause">
          ${icons.pause}
          <span>Pause</span>
        </button>
        ${hasCamera ? `
          <div class="sr-divider" style="${dividerStyle}"></div>
          <button class="sr-control-btn camera ${cameraBubbleVisible ? '' : 'off'}" style="${btnStyle}" data-action="toggleCamera">
            ${icons.camera}
          </button>
        ` : ''}${teleprompterBtn}
        <div class="sr-divider" style="${dividerStyle}"></div>
        <div class="sr-timer" id="sr-timer" style="${timerStyle}">00:00</div>
      `;
    }
  }

  // Setup control bar events
  function setupControlBarEvents() {
    controlBar.querySelectorAll('.sr-control-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        handleControlAction(action);
      });
    });
  }

  // Handle control actions
  function handleControlAction(action) {
    // Find the button and show visual feedback
    const btn = controlBar?.querySelector(`[data-action="${action}"]`);
    if (btn) {
      btn.style.opacity = '0.6';
      setTimeout(() => {
        if (btn) btn.style.opacity = '1';
      }, 200);
    }
    
    switch (action) {
      case 'stop':
        // Show stopping state
        if (btn) {
          btn.innerHTML = `${icons.stop}<span>Stopping...</span>`;
          btn.disabled = true;
        }
        chrome.runtime.sendMessage({ action: 'stopRecording' })
          .catch(err => console.error('Stop recording failed:', err));
        break;
      case 'pause':
        chrome.runtime.sendMessage({ action: 'pauseRecording' })
          .catch(err => console.error('Pause failed:', err));
        break;
      case 'resume':
        chrome.runtime.sendMessage({ action: 'resumeRecording' })
          .catch(err => console.error('Resume failed:', err));
        break;
      case 'reset':
        chrome.runtime.sendMessage({ action: 'resetRecording' })
          .catch(err => console.error('Reset failed:', err));
        break;
      case 'delete':
        chrome.runtime.sendMessage({ action: 'deleteRecording' })
          .catch(err => console.error('Delete failed:', err));
        break;
      case 'toggleCamera':
        toggleCameraBubble();
        break;
      case 'toggleTeleprompter':
        toggleTeleprompter();
        break;
    }
  }

  // Update controls (pause/resume state)
  function updateControls(paused) {
    isPaused = paused;
    
    if (paused) {
      pauseStartTime = Date.now();
    } else if (pauseStartTime) {
      pausedDuration += Date.now() - pauseStartTime;
      pauseStartTime = null;
    }
    
    if (controlBar) {
      const currentPosition = {
        left: controlBar.style.left,
        bottom: controlBar.style.bottom,
        transform: controlBar.style.transform
      };
      
      controlBar.innerHTML = getControlBarHTML(paused);
      setupControlBarEvents();
      
      if (currentPosition.left) {
        controlBar.style.left = currentPosition.left;
        controlBar.style.bottom = currentPosition.bottom;
        controlBar.style.transform = currentPosition.transform;
      }
      
      updateTimerDisplay();
    }
  }

  // Start timer
  function startTimer() {
    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
  }

  // Update timer display
  function updateTimerDisplay() {
    const timerEl = document.getElementById('sr-timer');
    if (!timerEl || !startTime) return;
    
    let elapsed = Date.now() - startTime - pausedDuration;
    if (pauseStartTime) {
      elapsed -= (Date.now() - pauseStartTime);
    }
    
    const seconds = Math.floor(elapsed / 1000);
    const min = String(Math.floor(seconds / 60)).padStart(2, '0');
    const sec = String(seconds % 60).padStart(2, '0');
    timerEl.textContent = `${min}:${sec}`;
  }

  // Create camera bubble
  async function createCameraBubble() {
    if (!config || !config.cameraId) {
      return;
    }
    
    if (config.cameraMode === 'photo') {
      createPhotoBubble();
      cameraBubbleVisible = true;
      return;
    }
    
    // Retry camera acquisition up to 3 times with increasing delays.
    // The camera hardware may still be releasing from the popup's preview stream,
    // and different OS/hardware combinations take different amounts of time.
    const maxAttempts = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Wait before each attempt: 600ms, 1200ms, 1800ms
      await new Promise(resolve => setTimeout(resolve, attempt * 600));
      
      try {
        // First try the exact selected device
        try {
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: config.cameraId } }
          });
        } catch (exactError) {
          // Specific device unavailable, try any camera as fallback
          console.warn(`Camera device ${config.cameraId} failed, trying any camera:`, exactError.message);
          cameraStream = await navigator.mediaDevices.getUserMedia({
            video: true
          });
        }
        
        // Verify we actually got a valid video track
        const videoTrack = cameraStream?.getVideoTracks()[0];
        if (!videoTrack || videoTrack.readyState === 'ended') {
          throw new Error('Camera stream has no active video track');
        }
        
        // Success - create the bubble and return
        console.log('Camera bubble: stream acquired on attempt', attempt);
        createBubbleElement();
        cameraBubbleVisible = true;
        return;
        
      } catch (e) {
        lastError = e;
        console.warn(`Camera bubble attempt ${attempt}/${maxAttempts} failed:`, e.message);
        
        // Clean up failed stream
        if (cameraStream) {
          cameraStream.getTracks().forEach(t => { try { t.stop(); } catch (err) {} });
          cameraStream = null;
        }
      }
    }
    
    // All attempts failed - fall back to photo bubble
    console.warn('Camera bubble: all attempts failed, falling back to photo. Last error:', lastError?.message);
    createPhotoBubble();
    cameraBubbleVisible = true;
  }
  
  // Get camera bubble size in px from config
  function getCameraBubbleSize() {
    const sizes = { small: 80, medium: 120, large: 160 };
    return sizes[config?.cameraBubbleSize] || 120;
  }

  // Create photo bubble
  function createPhotoBubble() {
    const size = getCameraBubbleSize();
    cameraBubble = document.createElement('div');
    cameraBubble.className = 'sr-camera-bubble sr-photo';
    cameraBubble.id = 'sr-camera-bubble';
    
    cameraBubble.style.cssText = `
      position: fixed !important;
      bottom: 100px !important;
      left: 24px !important;
      width: ${size}px !important;
      height: ${size}px !important;
      border-radius: 50% !important;
      overflow: hidden !important;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5) !important;
      border: 4px solid white !important;
      z-index: 2147483645 !important;
      cursor: grab !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
    
    if (config.profilePhoto) {
      cameraBubble.innerHTML = `
        <img src="${config.profilePhoto}" style="width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important;" alt="Profile">
      `;
    } else {
      cameraBubble.innerHTML = `
        <div style="text-align: center; color: white;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <circle cx="12" cy="10" r="3"></circle>
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 0 1-6.25-3A6 6 0 0 1 12 14a6 6 0 0 1 6.25 3A8 8 0 0 1 12 20z"></path>
          </svg>
        </div>
      `;
    }
    
    document.body.appendChild(cameraBubble);
    setupDraggable(cameraBubble);
  }
  
  // Create bubble element with live video
  function createBubbleElement() {
    const size = getCameraBubbleSize();
    cameraBubble = document.createElement('div');
    cameraBubble.className = 'sr-camera-bubble';
    cameraBubble.id = 'sr-camera-bubble';
    
    cameraBubble.style.cssText = `
      position: fixed !important;
      bottom: 100px !important;
      left: 24px !important;
      width: ${size}px !important;
      height: ${size}px !important;
      border-radius: 50% !important;
      overflow: hidden !important;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5) !important;
      border: 4px solid white !important;
      z-index: 2147483645 !important;
      cursor: grab !important;
      background: #1a1a1a !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
    
    const video = document.createElement('video');
    video.srcObject = cameraStream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = `
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      transform: scaleX(-1) !important;
      display: block !important;
    `;
    
    // Handle video play with retry on failure
    // Some pages block autoplay; we retry on user interaction with the bubble
    let videoPlaying = false;
    
    const tryPlay = () => {
      video.play()
        .then(() => { videoPlaying = true; })
        .catch((err) => {
          console.warn('Camera bubble video play failed:', err.message);
          // Will retry on user interaction (click/mousedown on bubble)
        });
    };
    
    video.onloadedmetadata = tryPlay;
    
    // Also try playing after a short delay (some browsers need this)
    setTimeout(tryPlay, 200);
    
    // Monitor if the camera track ends unexpectedly
    const videoTrack = cameraStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        console.warn('Camera track ended unexpectedly');
        // Replace with photo bubble if camera dies
        if (cameraBubble && cameraStream) {
          cameraBubble.remove();
          cameraBubble = null;
          cameraStream = null;
          createPhotoBubble();
        }
      };
    }
    
    cameraBubble.appendChild(video);
    document.body.appendChild(cameraBubble);
    
    setupDraggable(cameraBubble);
    
    let clickTimeout;
    cameraBubble.addEventListener('mousedown', () => {
      // Retry video play on user interaction (bypasses autoplay policy)
      if (!videoPlaying) {
        tryPlay();
      }
      clickTimeout = setTimeout(() => {
        clickTimeout = null;
      }, 200);
    });
    
    cameraBubble.addEventListener('mouseup', (e) => {
      if (clickTimeout && !cameraBubble.classList.contains('dragging')) {
        clearTimeout(clickTimeout);
        toggleCameraBubble();
      }
    });
  }

  // Toggle camera bubble visibility
  function toggleCameraBubble() {
    cameraBubbleVisible = !cameraBubbleVisible;
    
    if (cameraBubble) {
      if (cameraBubbleVisible) {
        cameraBubble.style.setProperty('display', 'flex', 'important');
      } else {
        cameraBubble.style.setProperty('display', 'none', 'important');
      }
    }
    
    const cameraBtn = controlBar?.querySelector('.sr-control-btn.camera');
    if (cameraBtn) {
      cameraBtn.classList.toggle('off', !cameraBubbleVisible);
    }
  }

  // Create teleprompter bubble (script text only)
  function createTeleprompterBubble() {
    if (!teleprompterScript || !teleprompterScript.content) return;
    
    if (teleprompterScrollInterval) {
      cancelAnimationFrame(teleprompterScrollInterval);
      teleprompterScrollInterval = null;
    }
    
    teleprompterBubble = document.createElement('div');
    teleprompterBubble.className = 'sr-teleprompter-bubble';
    teleprompterBubble.id = 'sr-teleprompter-bubble';
    teleprompterBubble.style.cssText = `
      position: fixed !important;
      bottom: 100px !important;
      right: 24px !important;
      width: 320px !important;
      height: 240px !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5) !important;
      border: 2px solid rgba(255,255,255,0.3) !important;
      z-index: 2147483645 !important;
      cursor: grab !important;
      background: rgba(26, 26, 26, 0.92) !important;
      display: flex !important;
      flex-direction: column !important;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
    `;
    
    const textDiv = document.createElement('div');
    textDiv.className = 'sr-teleprompter-text';
    textDiv.style.cssText = `
      flex: 1 !important;
      overflow-y: auto !important;
      padding: 16px !important;
      font-size: 18px !important;
      line-height: 1.5 !important;
      color: #e0e0e0 !important;
      white-space: pre-wrap !important;
      scroll-behavior: smooth !important;
    `;
    textDiv.textContent = teleprompterScript.content;
    
    teleprompterBubble.appendChild(textDiv);
    document.body.appendChild(teleprompterBubble);
    setupDraggable(teleprompterBubble);
    
    // Auto-scroll and timeline sync
    const speed = teleprompterScript.defaultSpeed || 120;
    const timelinePoints = (teleprompterScript.timelinePoints || []).sort((a, b) => a.showAt - b.showAt);
    const pxPerSec = Math.max(20, Math.min(80, speed * 0.4));
    let lastScrollTop = 0;
    
    function getElapsedSeconds() {
      if (!startTime) return 0;
      let elapsed = Date.now() - startTime - pausedDuration;
      if (pauseStartTime) elapsed -= (Date.now() - pauseStartTime);
      return elapsed / 1000;
    }
    
    function scrollTick() {
      if (!teleprompterBubble || !textDiv) return;
      if (isPaused) {
        teleprompterScrollInterval = requestAnimationFrame(scrollTick);
        return;
      }
      
      const elapsed = getElapsedSeconds();
      const content = teleprompterScript.content;
      const maxScroll = textDiv.scrollHeight - textDiv.clientHeight;
      if (maxScroll <= 0) {
        teleprompterScrollInterval = requestAnimationFrame(scrollTick);
        return;
      }
      
      let targetScrollTop = lastScrollTop;
      let shouldJump = false;
      for (let i = timelinePoints.length - 1; i >= 0; i--) {
        if (elapsed >= timelinePoints[i].showAt) {
          const pos = timelinePoints[i].position;
          if (content && pos < content.length) {
            const pct = pos / content.length;
            targetScrollTop = pct * maxScroll;
            shouldJump = true;
          }
          break;
        }
      }
      
      if (shouldJump) {
        lastScrollTop = targetScrollTop;
        textDiv.scrollTop = targetScrollTop;
      } else {
        const delta = pxPerSec * 0.016; // ~60fps
        lastScrollTop = Math.min(maxScroll, lastScrollTop + delta);
        textDiv.scrollTop = lastScrollTop;
      }
      
      teleprompterScrollInterval = requestAnimationFrame(scrollTick);
    }
    teleprompterScrollInterval = requestAnimationFrame(scrollTick);
  }

  // Toggle teleprompter visibility (overlay: show/hide. Window mode: handled by background)
  function toggleTeleprompter() {
    if (teleprompterInWindow) {
      chrome.runtime.sendMessage({ action: 'toggleTeleprompter' });
      return;
    }
    teleprompterBubbleVisible = !teleprompterBubbleVisible;
    
    if (teleprompterBubble) {
      if (teleprompterBubbleVisible) {
        teleprompterBubble.style.setProperty('display', 'flex', 'important');
      } else {
        teleprompterBubble.style.setProperty('display', 'none', 'important');
      }
    }
    
    const scriptBtn = controlBar?.querySelector('.sr-control-btn.script');
    if (scriptBtn) {
      scriptBtn.classList.toggle('off', !teleprompterBubbleVisible);
    }
  }

  // Setup draggable element
  function setupDraggable(element) {
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, initialX, initialY;
    
    element.addEventListener('mousedown', (e) => {
      if (e.target.closest('.sr-control-btn')) return;
      
      isDragging = true;
      hasMoved = false;
      element.classList.add('dragging');
      
      const rect = element.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialX = rect.left;
      initialY = rect.top;
      
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        hasMoved = true;
      }
      
      const newX = initialX + deltaX;
      const newY = initialY + deltaY;
      
      const maxX = window.innerWidth - element.offsetWidth;
      const maxY = window.innerHeight - element.offsetHeight;
      
      element.style.setProperty('left', Math.max(0, Math.min(newX, maxX)) + 'px', 'important');
      element.style.setProperty('top', Math.max(0, Math.min(newY, maxY)) + 'px', 'important');
      element.style.setProperty('bottom', 'auto', 'important');
      element.style.setProperty('right', 'auto', 'important');
      element.style.setProperty('transform', 'none', 'important');
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        setTimeout(() => {
          element.classList.remove('dragging');
        }, 100);
      }
    });
  }

  // Hide floating controls
  function hideFloatingControls() {
    document.body.classList.remove('sr-recording');
    
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    
    if (teleprompterScrollInterval) {
      cancelAnimationFrame(teleprompterScrollInterval);
      teleprompterScrollInterval = null;
    }
    
    if (controlBar) {
      controlBar.remove();
      controlBar = null;
    }
    
    if (cameraBubble) {
      cameraBubble.remove();
      cameraBubble = null;
    }
    
    if (teleprompterBubble) {
      teleprompterBubble.remove();
      teleprompterBubble = null;
    }
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    
    startTime = null;
    pausedDuration = 0;
    pauseStartTime = null;
    cameraBubbleVisible = true;
    teleprompterBubbleVisible = true;
  }

  // Remove floating controls
  function removeFloatingControls() {
    hideFloatingControls();
    removeCountdown();
  }

})();
