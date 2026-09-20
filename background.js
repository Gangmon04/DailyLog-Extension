/**
 * DailyLog Extension - Service Worker (Manifest V3)
 */

// Initialize context menus and alarms on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'open-daily-log-sidebar',
    title: 'Open DailyLog in Sidebar',
    contexts: ['all']
  });
  chrome.contextMenus.create({
    id: 'add-to-daily-log',
    title: 'Add "%s" to Today\'s Task Log',
    contexts: ['selection']
  });

  // Daily alarm to check/update badge
  chrome.alarms.create('daily-log-refresh', {
    periodInMinutes: 30
  });

  updateBadge();
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-daily-log-sidebar') {
    if (chrome.sidePanel && chrome.sidePanel.open && tab && tab.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId });
    }
    return;
  }
  if (info.menuItemId === 'add-to-daily-log' && info.selectionText) {
    const text = info.selectionText.trim();
    if (!text) return;

    const todayStr = getTodayKey();
    const storageData = await getStorage(['logs', 'settings']);
    const logs = storageData.logs || {};
    const settings = storageData.settings || {};

    if (!logs[todayStr]) {
      logs[todayStr] = createEmptyDay(todayStr, settings.defaultSection || 'General Tasks');
    }

    const dayLog = logs[todayStr];
    if (!dayLog.sections || dayLog.sections.length === 0) {
      dayLog.sections = [{
        id: 'sec_' + Date.now(),
        title: 'General Tasks',
        tasks: []
      }];
    }

    // Add to first active section
    const targetSection = dayLog.sections[0];
    targetSection.tasks.push({
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      text: text,
      status: 'pending',
      priority: 'normal',
      createdAt: new Date().toISOString()
    });

    dayLog.updatedAt = new Date().toISOString();
    logs[todayStr] = dayLog;

    await setStorage({ logs });
    updateBadge();

    // Notify user with badge flash
    chrome.action.setBadgeText({ text: '+' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    setTimeout(updateBadge, 2000);
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daily-log-refresh') {
    updateBadge();
  }
});

// Update toolbar badge with pending tasks count for today
async function updateBadge() {
  try {
    const todayStr = getTodayKey();
    const data = await getStorage(['logs']);
    const logs = data.logs || {};
    const todayLog = logs[todayStr];

    if (!todayLog || !todayLog.sections) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    let pendingCount = 0;
    for (const sec of todayLog.sections) {
      if (Array.isArray(sec.tasks)) {
        pendingCount += sec.tasks.filter(t => t.status !== 'completed').length;
      }
    }

    if (pendingCount > 0) {
      chrome.action.setBadgeText({ text: String(pendingCount) });
      chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.error('Failed to update badge:', err);
  }
}

// Storage helpers for service worker
function getTodayKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createEmptyDay(dateStr, initialSectionName) {
  return {
    date: dateStr,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: 'sec_' + Date.now(),
        title: initialSectionName || 'General Tasks',
        tasks: []
      }
    ],
    notes: ''
  };
}

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (res) => resolve(res || {}));
  });
}

function setStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

// Listen for updates from popup/dashboard to refresh badge or open side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && (message.action === 'open_side_panel' || message.type === 'OPEN_SIDE_PANEL')) {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.sidePanel.open({ tabId: tabs[0].id }).catch((err) => {
            console.warn("Service worker tabId open error:", err);
            if (tabs[0].windowId) {
              chrome.sidePanel.open({ windowId: tabs[0].windowId }).catch(() => {});
            }
          });
        } else {
          chrome.windows.getLastFocused({ windowTypes: ['normal'] }, (win) => {
            if (win && win.id) {
              chrome.sidePanel.open({ windowId: win.id }).catch(() => {});
            }
          });
        }
      });
    }
    sendResponse({ success: true });
    return true;
  }
  if (message?.type === 'REFRESH_BADGE') {
    updateBadge();
    sendResponse({ success: true });
  }
});