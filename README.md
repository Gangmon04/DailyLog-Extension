# DailyLog - Task Tracker & Standup Journal

> **A sleek, modern, privacy-first browser extension for developers & professionals to track daily accomplishments, organize work by modules, and generate 1-click Standup, Plain Text, or Markdown updates.**

---

## 🚀 Key Features

- **Daily Task Organization**:
  - Automatically groups tasks by day (`YYYY-MM-DD`).
  - Interactive date navigator with interactive calendar picker (`Today — 18 Sept 2026 ▾`) with prev/next day chevrons and a 1-click "Today" jump button.
  - Project/Module organization (e.g. `General Tasks`, `PMS - Pharmacy Billing`, etc.).
  - Real-time completion progress bar (`X of Y tasks completed`).
  - Task priority/status pills (`✓ Done`, `⏳ In Progress`, `🛑 Blocked`).
  - Inline editing and 1-click deletion.

- **1-Click Exporters**:
  - **Plain Text (`.TXT`)**: Formatted identically to your daily work journal (`dd-MMM-yyyy.txt`).
  - **Standup Formatter**: Automatically generates *"What I completed / What I'm working on / Blockers"* formatted for Slack, Teams, or email.
  - **Direct File Download**: 1-click download of daily logs directly to your Downloads folder.

- **Three Surfaces**:
  1. **Quick Capture Popup (`popup/popup.html`)**: Compact 480x590px interface with 1-click sidebar launcher.
  2. **Persistent Right-Side Sidebar (`sidepanel/sidepanel.html`)**: Open alongside your browser tabs for continuous note-taking, scratchpad meeting notes, and task ticking without tab switching.
  3. **Full Workspace Dashboard (`worklog.html` & `dashboard/dashboard.html`)**: Full-screen workspace with interactive history search, calendar filters, and backup management.

- **Classic Enterprise Navy Design**:
  - Professional, crisp color palette inspired by Zoho, Microsoft, and Jira (`#1e40af` & `#2563eb`).
  - Full Dark and Light theme toggle with memory persistence.
  - Custom blue calendar leaf logo.

- **Context Menu & Shortcuts**:
  - Highlight any text on any webpage -> Right-click -> **"Add to Today's Task Log"**.
  - Right-click anywhere on any webpage -> **"Open DailyLog in Sidebar"**.
  - Default keyboard shortcut: **`Alt + Shift + T`** (customizable in `chrome://extensions/shortcuts`).

- **100% Offline & Private**:
  - Zero external tracking, zero third-party servers. All data stays secure locally in `chrome.storage.local`.

---

## 💻 How to Load & Test the Extension

### Google Chrome / Microsoft Edge / Brave:

1. Open your browser and navigate to:
   - **Chrome / Brave**: `chrome://extensions`
   - **Microsoft Edge**: `edge://extensions`
2. Enable **"Developer mode"** (toggle switch in the top-right corner).
3. Click the **"Load unpacked"** button.
4. Browse to and select this folder:
   ```
   D:\Personal\daily-task-tracker-extension
   ```
5. Pin the **DailyLog** extension icon to your toolbar.
6. Click the icon to launch the popup or press **`Alt + Shift + T`**!
7. Click the **Sidebar button** (`◨`) in the popup header to dock it to the right side of your browser.

---

## 📁 Project Structure

```
daily-task-tracker-extension/
├── manifest.json              # Chrome Manifest V3 configuration
├── background.js              # Service worker (shortcuts, context menus, badge)
├── icons/                     # Blue Calendar Leaf icons (16, 32, 48, 128px)
│   ├── logo.png
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── popup/                     # Action Popup
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── sidepanel/                 # Persistent Right-Side Sidebar
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
├── dashboard/                 # Full-Screen Workspace Dashboard
│   ├── dashboard.html
│   ├── dashboard.css
│   └── dashboard.js
├── worklog.html               # Full-screen workspace view
└── README.md                  # Documentation & publishing guide
```

---

## 📦 Publishing to the Chrome Web Store

When you are ready to publish the extension publicly:

1. **Create Developer Account**:
   - Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
   - Sign in with your Google account and complete developer registration.

2. **Package the Extension**:
   - Select all files inside `D:\Personal\daily-task-tracker-extension` and compress them into a `.zip` archive (make sure `manifest.json` is in the root of the zip).
   - Or run PowerShell:
     ```powershell
     Compress-Archive -Path "D:\Personal\daily-task-tracker-extension\*" -DestinationPath "D:\Personal\DailyLog-v1.0.0.zip"
     ```

3. **Upload & Store Listing**:
   - Click **"New Item"** in the developer console and upload `DailyLog-v1.0.0.zip`.
   - Fill in:
     - **Title**: DailyLog - Task Tracker & Standup Journal
     - **Summary**: Capture daily tasks by project, track work progress, and generate clean Standup, Plain Text, or Markdown updates in 1 click.
     - **Category**: Productivity / Workflow
     - **Screenshots**: Upload screenshots of the Popup, Sidebar, and Dashboard.
     - **Privacy Policy**: Mention that the extension does not collect or transmit any user data; all records remain strictly local on the user's device.
   - Click **Submit for Review**.
