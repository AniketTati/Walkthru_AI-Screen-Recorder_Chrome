// Teleprompter window - runs in separate window, not recorded

const textEl = document.getElementById('text');
let scriptData = null;
let rafId = null;
let lastScrollTop = 0;

async function loadScript() {
  const { teleprompterActiveScript } = await chrome.storage.local.get('teleprompterActiveScript');
  scriptData = teleprompterActiveScript;
  if (scriptData?.content) {
    textEl.textContent = scriptData.content;
  } else {
    textEl.textContent = 'No script loaded.';
  }
}

function getState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getTeleprompterState' }, (res) => {
      resolve(res ?? { elapsedMs: 0, isPaused: false });
    });
  });
}

function scrollLoop() {
  (async () => {
    if (!scriptData?.content) return;
    
    const { elapsedMs, isPaused } = await getState();
    if (isPaused) {
      rafId = requestAnimationFrame(scrollLoop);
      return;
    }
    const elapsed = elapsedMs / 1000;
    const speed = scriptData.defaultSpeed || 120;
    const timelinePoints = (scriptData.timelinePoints || []).sort((a, b) => a.showAt - b.showAt);
    const pxPerSec = Math.max(20, Math.min(80, speed * 0.4));
    const maxScroll = textEl.scrollHeight - textEl.clientHeight;
    
    if (maxScroll <= 0) {
      rafId = requestAnimationFrame(scrollLoop);
      return;
    }
    
    let targetScrollTop = lastScrollTop;
    let shouldJump = false;
    for (let i = timelinePoints.length - 1; i >= 0; i--) {
      if (elapsed >= timelinePoints[i].showAt) {
        const pos = timelinePoints[i].position;
        if (pos < scriptData.content.length) {
          const pct = pos / scriptData.content.length;
          targetScrollTop = pct * maxScroll;
          shouldJump = true;
        }
        break;
      }
    }
    
    if (shouldJump) {
      lastScrollTop = targetScrollTop;
      textEl.scrollTop = targetScrollTop;
    } else {
      const delta = pxPerSec * 0.016; // ~60fps
      lastScrollTop = Math.min(maxScroll, lastScrollTop + delta);
      textEl.scrollTop = lastScrollTop;
    }
    
    rafId = requestAnimationFrame(scrollLoop);
  })();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.teleprompterActiveScript) {
    loadScript();
  }
});

loadScript().then(() => {
  rafId = requestAnimationFrame(scrollLoop);
});

window.addEventListener('beforeunload', () => {
  if (rafId) cancelAnimationFrame(rafId);
});
