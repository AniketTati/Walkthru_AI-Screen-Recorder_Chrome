// Scripts page - create and manage teleprompter scripts

const STORAGE_KEY = 'teleprompterScripts';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function parseTimestamp(str) {
  const trimmed = (str || '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map(p => parseInt(p, 10));
  if (parts.length === 1 || parts.length === 2) {
    const valid = parts.every(p => !isNaN(p) && p >= 0);
    if (!valid) return null;
    if (parts.length === 1) return parts[0];
    return parts[0] * 60 + parts[1];
  }
  return null;
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ':' + String(s).padStart(2, '0');
}

async function getScripts() {
  const { [STORAGE_KEY]: scripts } = await chrome.storage.local.get(STORAGE_KEY);
  return scripts || [];
}

async function saveScripts(scripts) {
  await chrome.storage.local.set({ [STORAGE_KEY]: scripts });
}

// DOM
const listView = document.getElementById('listView');
const editorView = document.getElementById('editorView');
const scriptList = document.getElementById('scriptList');
const emptyState = document.getElementById('emptyState');
const newScriptBtn = document.getElementById('newScriptBtn');
const emptyCreateBtn = document.getElementById('emptyCreateBtn');
const backBtn = document.getElementById('backBtn');
const editorTitle = document.getElementById('editorTitle');
const scriptForm = document.getElementById('scriptForm');
const scriptName = document.getElementById('scriptName');
const scriptContent = document.getElementById('scriptContent');
const addTimelineBtn = document.getElementById('addTimelineBtn');
const timelineList = document.getElementById('timelineList');
const timelineError = document.getElementById('timelineError');
const timelineModal = document.getElementById('timelineModal');
const timelineInput = document.getElementById('timelineInput');
const timelineCancel = document.getElementById('timelineCancel');
const timelineConfirm = document.getElementById('timelineConfirm');

let currentScriptId = null;
let pendingTimelinePosition = null;

function showList() {
  listView.classList.remove('hidden');
  editorView.classList.add('hidden');
}

function showEditor() {
  listView.classList.add('hidden');
  editorView.classList.remove('hidden');
}

async function renderList() {
  const scripts = await getScripts();
  scriptList.innerHTML = '';
  if (scripts.length === 0) {
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    scripts.forEach(script => {
      const card = document.createElement('div');
      card.className = 'script-card';
      const date = script.updatedAt ? new Date(script.updatedAt).toLocaleDateString() : '—';
      card.innerHTML = `
        <div class="script-card-info">
          <div class="script-card-name">${escapeHtml(script.name)}</div>
          <div class="script-card-date">Modified ${date}</div>
        </div>
        <div class="script-card-actions">
          <button class="edit-btn" data-id="${script.id}">Edit</button>
          <button class="delete-btn" data-id="${script.id}">Delete</button>
        </div>
      `;
      scriptList.appendChild(card);
      card.querySelector('.edit-btn').addEventListener('click', () => openEditor(script.id));
      card.querySelector('.delete-btn').addEventListener('click', () => deleteScript(script.id));
    });
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function getSnippet(text, position, maxLen = 40) {
  if (!text || position >= text.length) return '—';
  const start = Math.max(0, position - 10);
  let snippet = text.slice(start, position + maxLen);
  if (start > 0) snippet = '…' + snippet;
  if (position + maxLen < text.length) snippet += '…';
  return snippet.replace(/\n/g, ' ');
}

function renderTimelineList() {
  const content = scriptContent.value;
  const points = scriptForm.dataset.timelinePoints ? JSON.parse(scriptForm.dataset.timelinePoints) : [];
  timelineList.innerHTML = '';
  points.sort((a, b) => a.showAt - b.showAt);
  points.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    const snippet = getSnippet(content, p.position);
    item.innerHTML = `
      <span>${formatTimestamp(p.showAt)}</span>
      <span class="timeline-item-snippet" title="${escapeHtml(snippet)}">${escapeHtml(snippet)}</span>
      <button type="button" class="timeline-item-remove" data-index="${i}">×</button>
    `;
    timelineList.appendChild(item);
    item.querySelector('.timeline-item-remove').addEventListener('click', () => {
      points.splice(i, 1);
      scriptForm.dataset.timelinePoints = JSON.stringify(points);
      renderTimelineList();
    });
  });
}

function openEditor(id = null) {
  currentScriptId = id;
  if (id) {
    editorTitle.textContent = 'Edit script';
    getScripts().then(scripts => {
      const script = scripts.find(s => s.id === id);
      if (script) {
        scriptName.value = script.name;
        scriptContent.value = script.content || '';
        scriptForm.querySelector(`input[name="speed"][value="${script.defaultSpeed || 120}"]`).checked = true;
        scriptForm.dataset.timelinePoints = JSON.stringify(script.timelinePoints || []);
      }
      renderTimelineList();
    });
  } else {
    editorTitle.textContent = 'New script';
    scriptName.value = '';
    scriptContent.value = '';
    scriptForm.querySelector('input[name="speed"][value="120"]').checked = true;
    scriptForm.dataset.timelinePoints = JSON.stringify([]);
    renderTimelineList();
  }
  timelineError.classList.add('hidden');
  showEditor();
}

async function deleteScript(id) {
  if (!confirm('Delete this script?')) return;
  const scripts = await getScripts();
  const filtered = scripts.filter(s => s.id !== id);
  await saveScripts(filtered);
  renderList();
}

addTimelineBtn.addEventListener('click', () => {
  const pos = scriptContent.selectionStart;
  if (pos === undefined) return;
  pendingTimelinePosition = pos;
  timelineInput.value = '';
  timelineError.classList.add('hidden');
  timelineModal.classList.remove('hidden');
  timelineInput.focus();
});

timelineCancel.addEventListener('click', () => {
  timelineModal.classList.add('hidden');
  pendingTimelinePosition = null;
});

timelineConfirm.addEventListener('click', () => {
  const seconds = parseTimestamp(timelineInput.value);
  if (seconds === null) {
    timelineError.textContent = 'Invalid format. Use M:SS or MM:SS (e.g. 3:00, 1:30)';
    timelineError.classList.remove('hidden');
    return;
  }
  const points = scriptForm.dataset.timelinePoints ? JSON.parse(scriptForm.dataset.timelinePoints) : [];
  points.push({ position: pendingTimelinePosition, showAt: seconds });
  points.sort((a, b) => a.showAt - b.showAt);
  scriptForm.dataset.timelinePoints = JSON.stringify(points);
  renderTimelineList();
  timelineModal.classList.add('hidden');
  pendingTimelinePosition = null;
});

timelineInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') timelineConfirm.click();
  if (e.key === 'Escape') timelineCancel.click();
});

scriptForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = scriptName.value.trim();
  if (!name) {
    scriptName.focus();
    return;
  }
  const speed = parseInt(scriptForm.querySelector('input[name="speed"]:checked')?.value || '120', 10);
  const content = scriptContent.value;
  const timelinePoints = scriptForm.dataset.timelinePoints ? JSON.parse(scriptForm.dataset.timelinePoints) : [];

  const scripts = await getScripts();
  const now = Date.now();

  if (currentScriptId) {
    const idx = scripts.findIndex(s => s.id === currentScriptId);
    if (idx >= 0) {
      scripts[idx] = { ...scripts[idx], name, content, defaultSpeed: speed, timelinePoints, updatedAt: now };
    }
  } else {
    scripts.push({
      id: generateId(),
      name,
      content,
      defaultSpeed: speed,
      timelinePoints,
      updatedAt: now
    });
  }
  await saveScripts(scripts);
  showList();
  renderList();
});

backBtn.addEventListener('click', (e) => {
  e.preventDefault();
  showList();
  renderList();
});

newScriptBtn.addEventListener('click', () => openEditor(null));
emptyCreateBtn.addEventListener('click', () => openEditor(null));

document.addEventListener('DOMContentLoaded', () => {
  renderList();
});
