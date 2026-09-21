# DailyLog — Complete User Guide & Feature Documentation

> **A professional, privacy-first developer productivity extension for tracking daily tasks by modules (PMS, Billing, etc.), auto-syncing with local `.txt` journals, scheduling spoken voice reminders, and generating 1-click standup reports.**

---

## 📑 Table of Contents
1. [Quickstart (30 Seconds)](#1-quickstart-30-seconds)
2. [Module Organization (PMS & Custom Modules)](#2-module-organization-pms--custom-modules)
3. [Smart Prefix Typing (Fastest Method)](#3-smart-prefix-typing-fastest-method)
4. [Inline Editing & 1-Click Module Renaming](#4-inline-editing--1-click-module-renaming)
5. [Automatic Local Folder Sync (`D:\Personal\Data`)](#5-automatic-local-folder-sync-dpersonaldata)
6. [Daily Scheduled Reminders & Spoken Voice Announcements](#6-daily-scheduled-reminders--spoken-voice-announcements)
7. [1-Click Standup & Journal Exporters](#7-1-click-standup--journal-exporters)
8. [The Three Work Surfaces (Popup, Sidebar, Full Dashboard)](#8-the-three-work-surfaces-popup-sidebar-full-dashboard)
9. [Keyboard Shortcuts Cheatsheet](#9-keyboard-shortcuts-cheatsheet)
10. [100% Offline & Privacy Guarantee](#10-100-offline--privacy-guarantee)

---

## 1. Quickstart (30 Seconds)

1. **Open DailyLog**:
   - Click the extension icon in your Chrome/Edge toolbar, or press **`Alt + Shift + T`**.
2. **Select or Type Your Module**:
   - The module dropdown defaults to **`PMS`**.
   - Or just type: `PMS: Compare Dashboard and Portal for Conflict Appointments` directly into the input.
3. **Press Enter**:
   - Your task bullet is saved immediately and auto-synced into your local daily file.
4. **Dock to Sidebar (Recommended)**:
   - Click the **Sidebar icon (`◨`)** in the header to dock DailyLog permanently to the right side of your browser while you code or browse.

---

## 2. Module Organization (PMS & Custom Modules)

DailyLog organizes tasks by project or functional module instead of dumping everything into a generic list.

### Using the Custom Dropdown
* **Module Button**: Located right beneath the task input line with a folder icon and active module name.
* **Floating Custom Menu**: Click to open a sleek popover showing all registered modules.
* **Adding New Modules Inline**:
  * At the bottom of the dropdown, type any custom module name in the `[ + Add module & ↵ ]` input box.
  * Press **`Enter`** &mdash; it immediately creates and selects the module with **zero** browser prompt dialogs!

### Status Selection
* Located next to the module dropdown.
* Shows custom glowing status indicators:
  * 🟡 **In Progress**
  * 🟢 **Completed**
  * 🔴 **Blocked**

---

## 3. Smart Prefix Typing (Fastest Method ⚡)

You never need to touch the mouse to file tasks under specific modules!

### Inline Prefix Syntax:
```text
PMS: Compare Dashboard and Portal for Conflict Appointments
```
*or*
```text
[PMS] Fix prescription verification API error
```

**What happens automatically**:
* The extension recognizes `PMS` as the target module.
* It strips the prefix and files the task cleanly under `1. PMS:`.
* Updates the active dropdown selection to `PMS`.

### Quick Module Switching:
Type just the module name with a colon into the input box:
```text
PMS:
```
Press **`Enter`**. DailyLog immediately switches the active module dropdown to **`PMS`** for all upcoming tasks without creating a blank task bullet!

---

## 4. Inline Editing & 1-Click Module Renaming

Never deal with disruptive browser `window.prompt()` popups again! Everything is editable directly in place:

### Renaming a Module Header:
1. Look at any group title in your task list (e.g. `General Tasks` or `PMS`).
2. Click the pencil icon (**`✎`**) next to the title (or **double-click** the title).
3. The title instantly transforms into a focused inline input field.
4. Type your new name (e.g. `PMS`) and press **`Enter`** (or click away).
5. All tasks in that section are updated, storage is saved, and your local `.txt` journal is re-synced in 1 click!

### Editing a Task Description:
* Click the pencil icon (**`✎`**) on any task row, or **double-click** the task text.
* Edit the text directly in place and press **`Enter`** to save or **`Escape`** to cancel.

---

## 5. Automatic Local Folder Sync (`D:\Personal\Data`)

DailyLog writes your tasks straight to your computer's local hard drive using the Chrome File System Access API.

### File Structure on Disk:
```text
D:\Personal\Data\
└── 2026\
    └── 09 September\
        └── 21-Sep-2026.txt
```

### Exact Journal Format:
```text
Today's Task:
1. PMS:
   - Compare Dashboard and Portal for Conflict Appointments

2. General Tasks:
   - Call with Athirathan
```

### Connecting Your Folder (One-Time Setup):
1. Click the **Folder Sync icon (`📁↓`)** in the extension header.
2. Select your root data folder: `D:\Personal\Data`.
3. Click "Allow" when the browser requests file edit permission.
4. The icon turns green (`✓ Sync Active`) and all changes auto-sync in real time!

---

## 6. Daily Scheduled Reminders & Spoken Voice Announcements

Never forget to plan your morning tasks or log your end-of-day accomplishments.

* **☀️ Morning Check-In (09:30 AM)**:
  * Checks today's log. If empty, sends a notification and speaks a short, funny voice prompt to jumpstart your day!
* **🌙 Evening Wrap-Up (05:30 PM)**:
  * Checks your remaining tasks before you leave. If all completed, congratulates you; if tasks remain, speaks a crisp nudge to mark them done.
* **12-Hour AM/PM Time Picker**:
  * Set reminder times in familiar 12-hour format with quick `[ AM | PM ]` toggle pills.
* **Chrome Text-to-Speech (TTS) Voice Engine**:
  * Choose your preferred system voice (Microsoft David, Zira, Google English, etc.).
  * Adjust speech speed from `0.8x` (relaxed) to `1.5x` (brisk).
  * Preview anytime with **"Test Voice"** and **"Test Alert"** buttons.

---

## 7. 1-Click Standup & Journal Exporters

Located in the bottom action bar of the Popup and Sidebar:

| Button | Format | Purpose |
| :--- | :--- | :--- |
| **Copy Standup** | `*Completed:*`<br>`• Task 1`<br><br>`*In Progress:*`<br>`• Task 2`<br><br>`*Blockers:*`<br>`• None` | Perfect for pasting into Slack, Microsoft Teams, or daily email updates |
| **Copy .TXT** | `Today's Task:`<br>`1. PMS:`<br>`   - Task 1` | Exact plain text mirror of your daily journal file |
| **Download .TXT** | `.txt` file | Saves directly to your browser's Downloads folder |

---

## 8. The Three Work Surfaces (Popup, Sidebar, Full Dashboard)

1. **Quick Action Popup**:
   * Compact 480×590px window.
   * Shortcut: **`Alt + Shift + T`**.
   * Best for quick 5-second task capture.
2. **Persistent Side Panel**:
   * Opens on the right side of your Chrome window.
   * Stays open while switching tabs, debugging code, or browsing portals.
   * Includes a scratchpad for quick meeting notes and temporary scratch text.
3. **Full Workspace Dashboard (`worklog.html`)**:
   * Full-screen workspace with complete interactive calendar view, monthly archives, search filters, and metrics.

---

## 9. Keyboard Shortcuts Cheatsheet

| Shortcut / Action | Where | Effect |
| :--- | :--- | :--- |
| **`Alt + Shift + T`** | Any browser tab | Open DailyLog popup |
| **`Enter`** | Task input box | Add task to selected module |
| **`Enter`** | Inline module rename | Commit module name change |
| **`Enter`** | Dropdown `+ Add module` | Create and select new module |
| **`Escape`** | Anywhere | Close open dropdowns or cancel edit |
| **Double-Click** | Any module header | Inline rename module |
| **Double-Click** | Any task text | Inline edit task description |
| **Right-Click** | Selected text on web | Add highlighted text directly to Today's Tasks |

---

## 10. 100% Offline & Privacy Guarantee

* **Zero External Calls**: DailyLog does not send any data to external servers, cloud databases, or third-party trackers.
* **Local Storage**: All tasks and preferences stay securely on your computer in `chrome.storage.local` and your local directory (`D:\Personal\Data`).
