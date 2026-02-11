# Teleprompter Feature Plan

## Overview

- **Separate Scripts page** – Full page for creating and managing scripts (not in popup)
- **Timeline controls** – Define scroll speed and time-based breaks ("this paragraph at 3 mins")
- **Overlay** – Selected script appears as draggable overlay during recording, synced to recording elapsed time
- **In-recording** – Overlay appears in the video when visible (same as camera bubble); use hide toggle when not needed

---

## Script Creation Flow

### 1. Open the Scripts Page
- Link in popup: "Manage Scripts" opens new tab `chrome-extension://[id]/scripts.html`
- Or: right-click extension icon → "Manage Scripts"

### 2. Script List View
- List of saved scripts (name, date modified)
- "Create new script" button
- Click script → open editor
- Empty state: "No scripts yet. Create one to get started."

### 3. Popup – Script Selection Before Recording
- **Script dropdown** – Above "Start Recording": "Script: [No script ▼]" with options: No script, Product Demo, Intro Talk, etc.
- **Manage Scripts link** – Opens scripts page in new tab
- **Default** – "No script" selected; optionally remember last used

### 4. Paste First, Then Add Timeline Points

**Step 1: Paste**
- Paste full script from Google Doc, Word, Notepad, etc. into one textarea
- Set name and default scroll speed (Slow 80 / Medium 120 / Fast 160 WPM)

**Step 2: Define timeline points at specific positions**
- Place cursor at a point in the text
- Click "Add timeline point"
- Enter timestamp (e.g. `3:00`, `5:30`)
- At that time during recording, teleprompter scrolls to that position

**Flow:** Paste → Add points → Save. One continuous script; at each timestamp, jump to that position. Between marks, scroll at default speed.

---

## Data Model

```json
{
  "id": "uuid",
  "name": "Product Demo",
  "defaultSpeed": 120,
  "content": "Full pasted text...",
  "timelinePoints": [
    { "position": 0, "showAt": 0 },
    { "position": 342, "showAt": 180 },
    { "position": 891, "showAt": 300 }
  ]
}
```

- `content`: Full pasted text
- `timelinePoints`: { position: char offset, showAt: seconds from recording start }
- No timeline points = scroll at speed from top. With points = jump at each showAt.

---

## Timeline Playback Logic

- Recording timer tracks elapsed time (including pause)
- At each `showAt` → scroll/jump so that character position is visible
- Between timeline points → auto-scroll at `defaultSpeed`
- Manual control: pause, scroll manually, adjust speed

---

## UI/UX: Script Setup

### Script List View
| Element | Description |
|---------|-------------|
| Header | "Scripts" title |
| Create button | "New script" or "+ Create script" |
| Script cards | Name, last modified, [Edit] [Delete] |
| Empty state | Message + Create button |
| Back | "← Back" from editor |

**Layout:** Centered, max-width ~600px.

### Script Editor View
| Section | Elements |
|---------|----------|
| Name | Single-line input, required |
| Scroll speed | Slow / Medium / Fast (80/120/160 WPM) |
| Script content | Large textarea, placeholder "Paste from Google Doc, Word, etc. (Ctrl+V)" |
| Add timeline point | Button; gets cursor position; prompt for timestamp |
| Timeline list | Points with "3:00 → snippet" and [Remove] |
| Save | Primary button; disabled if name empty |

**Timeline point flow:** Cursor in text → Add timeline point → Enter M:SS or MM:SS → Validate → Add to list.

### Script Editor States
- Empty, With content, Point added, Error (invalid timestamp)

---

## UI/UX: Play During Recording (Overlay)

### Overlay – Script Text Only
- **Just the script text** – nothing else. No header, no controls inside the overlay.
- Draggable bubble; user drags to reposition (same pattern as camera bubble)
- ~320×240px, dark background (#1a1a1a), rounded corners
- Default: bottom-right; user drags to place
- Z-index: below control bar, above page

### Content
- Scrollable div with script text
- Font 18–24px, line-height 1.5, white text
- Auto-scroll at speed; at timeline points, jump to position

### Control Bar (Existing Recorder Bar)
- Add **Script** toggle button next to camera button
- Toggle show/hide overlay
- No extra controls inside the overlay – the recorder control bar is enough

### Interactions
- Drag to reposition
- Auto-scroll runs when overlay is visible

### Timeline Sync
| State | Behavior |
|-------|----------|
| Recording start | Overlay at top; auto-scroll |
| At timestamps | Jump to position |
| Recording paused | Overlay timer and scroll pause; resume syncs |

### Styling
- Background: #1a1a1a, ~90% opacity
- Text: white or #e0e0e0
- Font: system sans-serif

---

## Wireframes

**Scripts list:**
```
┌──────────────────────────────────────────────────────────┐
│  Scripts                                    [New script]  │
├──────────────────────────────────────────────────────────┤
│  Product Demo                     Modified 2 days ago    │
│  [Edit]  [Delete]                                         │
├──────────────────────────────────────────────────────────┤
│  Intro Talk                        Modified 1 week ago    │
│  [Edit]  [Delete]                                         │
└──────────────────────────────────────────────────────────┘
```

**Script editor:**
```
┌──────────────────────────────────────────────────────────┐
│  [← Back]     Edit script                                │
├──────────────────────────────────────────────────────────┤
│  Name: [Product Demo                              ]       │
│  Scroll speed: ( ) Slow  (•) Medium  ( ) Fast            │
├──────────────────────────────────────────────────────────┤
│  Script:                                                  │
│  ┌──────────────────────────────────────────────────┐    │
│  │ Welcome to our product demo...                    │    │
│  │ Now let's look at the main features...            │    │
│  │ (cursor → Add timeline point → 3:00)              │    │
│  └──────────────────────────────────────────────────┘    │
│  [Add timeline point at cursor]                            │
├──────────────────────────────────────────────────────────┤
│  Timeline: 0:00 (start) | 3:00 (pos 89) [×] | 5:30 [×]   │
├──────────────────────────────────────────────────────────┤
│                                              [Save]       │
└──────────────────────────────────────────────────────────┘
```

**Teleprompter overlay (script text only):**
```
┌─────────────────────────────────┐
│  Welcome to our product demo.   │
│  Today we'll cover the main     │
│  features...                    │
│  Now let's look at pricing...   │
│                                 │
└─────────────────────────────────┘
```
Draggable. Show/hide via Script toggle on recorder control bar.

**Control bar:**
```
[Stop] [Pause] [Script] [Camera] | 02:34
                    ↑ teleprompter toggle
```

**Popup:**
```
Script: [No script        ▼]
[Manage Scripts]
...
[Start Recording]
```

---

## File Structure

| File | Purpose |
|------|---------|
| scripts.html | Scripts page – list + editor |
| scripts.js | List, create, edit, save logic |
| scripts.css | Scripts page styles |
| popup.html | Script dropdown, Manage Scripts link |
| content.js | Teleprompter overlay, timer sync |
| content.css | Overlay styles |

---

## Implementation Summary

### 1. Scripts Page
- List: load from `chrome.storage.local` under `teleprompterScripts`
- Editor: name, defaultSpeed, textarea, "Add timeline point" (cursor position + timestamp prompt)
- Parse timestamp: `3:00` → 180s, `1:30` → 90s
- Timeline list with remove

### 2. Manifest
- Add scripts.html as extension page

### 3. Popup
- "Manage Scripts" → `chrome.tabs.create({ url: chrome.runtime.getURL('scripts.html') })`
- Script dropdown: "No script" + saved names
- Pass `teleprompterScriptId` in config when starting recording

### 4. Background
- On `startRecording`: if `teleprompterScriptId` set, fetch script (content + timelinePoints) from storage, pass to content script
- Add `toggleTeleprompter` message handler (like `toggleCameraBubble`)

### 5. Content Script
- Receive script (content + timelinePoints)
- Create teleprompter overlay; reuse `setupDraggable()` pattern from camera bubble
- **Overlay = script text only** – no header, no controls inside
- Track recording elapsed time (same as control bar)
- At each showAt → scroll to position; between points → auto-scroll at speed
- Show/hide via Script toggle on recorder control bar

---

## Caveat

When visible, the teleprompter overlay appears in the recording (same as camera bubble). Use the hide toggle when you don't want it in the video.
