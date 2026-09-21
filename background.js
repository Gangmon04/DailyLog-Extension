/**
 * DailyLog Extension - Service Worker (Manifest V3)
 */

// Initialize context menus, reminders, and alarms on installation
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
  scheduleDailyReminders();
});

// Also refresh badge and schedule alarms on browser startup
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  scheduleDailyReminders();
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-daily-log-sidebar') {
    if (chrome.sidePanel && chrome.sidePanel.open && tab && tab.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
    return;
  }
  if (info.menuItemId === 'add-to-daily-log' && info.selectionText) {
    const text = info.selectionText.trim();
    if (!text) return;

    const todayStr = getTodayKey();
    const storageData = await getStorage(['logs', 'settings', 'worklog_tasks']);
    const logs = storageData.logs || {};
    const settings = storageData.settings || {};
    const defaultSec = settings.defaultSection || 'General Tasks';

    // 1. Update logs object (legacy format)
    if (!logs[todayStr]) {
      logs[todayStr] = createEmptyDay(todayStr, defaultSec);
    }

    const dayLog = logs[todayStr];
    if (!dayLog.sections || dayLog.sections.length === 0) {
      dayLog.sections = [{
        id: 'sec_' + Date.now(),
        title: defaultSec,
        tasks: []
      }];
    }

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

    // 2. Update worklog_tasks array (used by popup & sidepanel)
    const wTasks = Array.isArray(storageData.worklog_tasks) ? storageData.worklog_tasks : [];
    wTasks.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      date: todayStr,
      name: defaultSec,
      module: defaultSec,
      description: text,
      text: text,
      status: 'In Progress'
    });

    await setStorage({ logs, worklog_tasks: wTasks });
    updateBadge();

    // Notify user with badge flash
    chrome.action.setBadgeText({ text: '+' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    setTimeout(updateBadge, 2000);
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'daily-log-refresh') {
    updateBadge();
    return;
  }

  if (alarm.name === 'reminder-morning') {
    await handleMorningReminder();
    scheduleDailyReminders(); // Reschedule for next occurrence
    return;
  }

  if (alarm.name === 'reminder-evening') {
    await handleEveningReminder();
    scheduleDailyReminders(); // Reschedule for next occurrence
    return;
  }

  if (alarm.name === 'reminder-snooze') {
    triggerVoiceReminder("DailyLog reminder: Here is your reminder to update and sync your daily tasks.");
    await showNotification({
      id: 'dailylog-snooze-' + Date.now(),
      title: 'DailyLog — Task Reminder ⏰',
      message: 'Here is your reminder to update and sync your daily tasks!',
      buttons: [{ title: 'Open DailyLog' }, { title: 'Snooze 30m' }]
    });
    return;
  }
});

/* ========================================================
   VOICE REMINDERS (CHROME TTS ENGINE)
   ======================================================== */

async function triggerVoiceReminder(voiceText, overrideOptions = {}) {
  try {
    const sData = await getStorage(['reminder_settings']);
    const rSet = sData.reminder_settings || {};
    if (rSet.voiceEnabled === false) return;
    await speakVoiceReminder(voiceText, overrideOptions);
  } catch (err) {
    console.warn('[DailyLog Voice] Error triggering voice reminder:', err);
  }
}

async function speakVoiceReminder(text, overrideOptions = {}) {
  if (typeof chrome === 'undefined' || !chrome.tts || typeof chrome.tts.speak !== 'function') {
    console.warn('[DailyLog TTS] chrome.tts API not available in this context');
    return;
  }

  try {
    const sData = await getStorage(['reminder_settings']);
    const rSet = sData.reminder_settings || {};

    chrome.tts.stop();

    const rate = typeof overrideOptions.rate === 'number' ? overrideOptions.rate : (parseFloat(rSet.voiceRate) || 1.0);
    const pitch = typeof overrideOptions.pitch === 'number' ? overrideOptions.pitch : (parseFloat(rSet.voicePitch) || 1.0);
    const voiceName = overrideOptions.voiceName !== undefined ? overrideOptions.voiceName : (rSet.voiceName || '');

    const ttsOptions = {
      rate: Math.min(Math.max(rate, 0.5), 2.0),
      pitch: Math.min(Math.max(pitch, 0.5), 2.0),
      volume: 1.0,
      enqueue: false
    };

    if (voiceName) {
      ttsOptions.voiceName = voiceName;
    } else {
      ttsOptions.lang = 'en-US';
    }

    chrome.tts.speak(text, ttsOptions);
    console.log('[DailyLog TTS] Spoke reminder aloud with options:', ttsOptions);
  } catch (err) {
    console.warn('[DailyLog TTS] Voice speech error:', err);
  }
}

/* ========================================================
   DAILY REMINDERS ENGINE
   ======================================================== */

async function scheduleDailyReminders() {
  try {
    const data = await getStorage(['reminder_settings']);
    const settings = data.reminder_settings || {
      enabled: true,
      morningTime: '09:30',
      eveningTime: '17:30',
      weekdaysOnly: true
    };

    // Clear existing reminder alarms first
    await chrome.alarms.clear('reminder-morning');
    await chrome.alarms.clear('reminder-evening');

    if (!settings.enabled) {
      console.log('[DailyLog Reminders] Reminders disabled by user preference');
      return;
    }

    const nextMorning = getNextAlarmTime(settings.morningTime || '09:30', settings.weekdaysOnly);
    const nextEvening = getNextAlarmTime(settings.eveningTime || '17:30', settings.weekdaysOnly);

    if (nextMorning) {
      chrome.alarms.create('reminder-morning', { when: nextMorning.getTime() });
      console.log('[DailyLog Reminders] Morning reminder scheduled for:', nextMorning.toLocaleString());
    }

    if (nextEvening) {
      chrome.alarms.create('reminder-evening', { when: nextEvening.getTime() });
      console.log('[DailyLog Reminders] Evening reminder scheduled for:', nextEvening.toLocaleString());
    }
  } catch (err) {
    console.error('[DailyLog Reminders] Failed to schedule alarms:', err);
  }
}

function getNextAlarmTime(timeStr, weekdaysOnly) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  const targetHour = parseInt(parts[0], 10);
  const targetMin = parseInt(parts[1], 10);
  if (isNaN(targetHour) || isNaN(targetMin)) return null;

  const now = new Date();
  const target = new Date();
  target.setHours(targetHour, targetMin, 0, 0);

  // If time has already passed today, advance to tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  // If weekdays only, skip Saturday (6) and Sunday (0)
  if (weekdaysOnly) {
    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
    }
  }

  return target;
}

async function getTodayTaskStats() {
  const todayStr = getTodayKey();
  const data = await getStorage(['worklog_tasks', 'logs']);
  let tasksForToday = [];

  // Check worklog_tasks first (used by popup & sidepanel)
  if (Array.isArray(data.worklog_tasks)) {
    tasksForToday = data.worklog_tasks.filter(t => t.date === todayStr);
  }

  // Fallback to logs structure if worklog_tasks was empty
  if (tasksForToday.length === 0 && data.logs && data.logs[todayStr]) {
    const dayLog = data.logs[todayStr];
    if (Array.isArray(dayLog.sections)) {
      dayLog.sections.forEach(sec => {
        if (Array.isArray(sec.tasks)) {
          tasksForToday.push(...sec.tasks);
        }
      });
    }
  }

  const total = tasksForToday.length;
  const completed = tasksForToday.filter(t => {
    const s = (t.status || '').toLowerCase();
    return s === 'completed' || s === 'done';
  }).length;
  const pending = total - completed;

  return { total, completed, pending, todayStr };
}

async function handleMorningReminder() {
  const stats = await getTodayTaskStats();
  const sData = await getStorage(['reminder_settings']);
  const rSet = sData.reminder_settings || {};
  let title = 'DailyLog — Morning Check-in ☀️';
  let message = '';
  let voiceText = '';

  if (stats.total === 0) {
    message = "Good morning! You haven't logged any tasks for today yet. Click to plan your daily goals in your journal!";
    voiceText = "Good morning! You haven't added any tasks for today yet. Time to plan your daily goals in DailyLog.";
  } else {
    message = `Good morning! You have ${stats.total} task${stats.total > 1 ? 's' : ''} planned for today (${stats.pending} pending). Ready to get started?`;
    voiceText = `Good morning! You have ${stats.total} task${stats.total > 1 ? 's' : ''} planned for today with ${stats.pending} pending.`;
  }

  triggerVoiceReminder(voiceText);

  await showNotification({
    id: 'dailylog-morning-' + Date.now(),
    title: title,
    message: message,
    buttons: [{ title: 'Open DailyLog' }, { title: 'Snooze 30m' }]
  });
}

async function handleEveningReminder() {
  const stats = await getTodayTaskStats();
  const sData = await getStorage(['reminder_settings']);
  const rSet = sData.reminder_settings || {};
  let title = 'DailyLog — Daily Wrap-up 📋';
  let message = '';
  let voiceText = '';

  if (stats.total === 0) {
    message = "Your daily worklog file is empty for today. Take a moment to log your accomplishments before wrapping up!";
    voiceText = "Reminder: Your daily worklog file is empty for today. Take a moment to record your accomplishments in DailyLog.";
  } else if (stats.pending > 0) {
    message = `You have ${stats.pending} pending task${stats.pending > 1 ? 's' : ''} remaining today. Don't forget to mark items done and sync your journal!`;
    voiceText = `DailyLog reminder: You have ${stats.pending} pending task${stats.pending > 1 ? 's' : ''} remaining today. Don't forget to sync your journal.`;
  } else {
    message = `Great job! All ${stats.total} tasks completed today. Your daily work journal is fully up to date! 🎉`;
    voiceText = "Great job! All tasks completed today. Your daily work journal is fully up to date.";
  }

  triggerVoiceReminder(voiceText);

  await showNotification({
    id: 'dailylog-evening-' + Date.now(),
    title: title,
    message: message,
    buttons: [{ title: 'Open DailyLog' }, { title: 'Snooze 30m' }]
  });
}

async function showNotification({ id, title, message, buttons }) {
  if (!chrome.notifications) {
    console.warn('[DailyLog Notifications] Notifications API not available');
    return;
  }

  const options = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: title,
    message: message,
    priority: 2,
    requireInteraction: true
  };

  if (buttons && Array.isArray(buttons)) {
    options.buttons = buttons;
  }

  return new Promise((resolve) => {
    chrome.notifications.create(id, options, (notifId) => {
      resolve(notifId);
    });
  });
}

// Notification interaction listeners
if (chrome.notifications) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.notifications.clear(notificationId);
    openDailyLogInterface();
  });

  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    chrome.notifications.clear(notificationId);
    if (buttonIndex === 0) {
      openDailyLogInterface();
    } else if (buttonIndex === 1) {
      // Snooze for 30 minutes
      const snoozeTime = Date.now() + 30 * 60 * 1000;
      chrome.alarms.create('reminder-snooze', { when: snoozeTime });
      console.log('[DailyLog Reminders] Snoozed for 30 minutes');
    }
  });
}

function openDailyLogInterface() {
  if (chrome.sidePanel && chrome.sidePanel.open) {
    chrome.windows.getLastFocused({ windowTypes: ['normal'] }, (win) => {
      if (win && win.id) {
        chrome.sidePanel.open({ windowId: win.id }).catch(() => {
          openDashboardTab();
        });
      } else {
        openDashboardTab();
      }
    });
  } else {
    openDashboardTab();
  }
}

function openDashboardTab() {
  const dashboardUrl = chrome.runtime.getURL('worklog.html');
  chrome.tabs.query({ url: dashboardUrl }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: dashboardUrl });
    }
  });
}

/* ========================================================
   TOOLBAR BADGE CONTROLLER
   ======================================================== */

async function updateBadge() {
  try {
    const stats = await getTodayTaskStats();
    if (stats.pending > 0) {
      chrome.action.setBadgeText({ text: String(stats.pending) });
      chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    console.error('Failed to update badge:', err);
  }
}

/* ========================================================
   STORAGE HELPERS
   ======================================================== */

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

// Listen for updates from popup/sidepanel/dashboard
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && (message.action === 'open_side_panel' || message.type === 'OPEN_SIDE_PANEL')) {
    openDailyLogInterface();
    sendResponse({ success: true });
    return true;
  }

  if (message?.type === 'REFRESH_BADGE') {
    updateBadge();
    sendResponse({ success: true });
    return true;
  }

  if (message?.type === 'UPDATE_REMINDERS') {
    scheduleDailyReminders();
    sendResponse({ success: true });
    return true;
  }


  if (message?.type === 'TEST_NOTIFICATION') {
    Promise.all([getTodayTaskStats(), getStorage(['reminder_settings'])]).then(([stats, sData]) => {
      triggerVoiceReminder("Test successful! DailyLog reminders and voice announcements are fully active.");
      showNotification({
        id: 'dailylog-test-' + Date.now(),
        title: 'DailyLog — Test Reminder 🔔',
        message: stats.total > 0
          ? `Test successful! Today you have ${stats.total} tasks (${stats.pending} pending). Daily reminders are fully configured!`
          : "Test successful! You haven't logged any tasks for today yet. Daily reminders are fully configured!",
        buttons: [{ title: 'Open DailyLog' }, { title: 'Snooze 30m' }]
      });
    });
    sendResponse({ success: true });
    return true;
  }

  if (message?.type === 'TEST_VOICE') {
    getTodayTaskStats().then(stats => {
      const voiceText = stats.total > 0
        ? `This is a test voice announcement from DailyLog. Today you have ${stats.total} tasks with ${stats.pending} pending.`
        : "This is a test of your DailyLog voice notification. Voice reminders are active!";
      speakVoiceReminder(voiceText, message.options || {});
    });
    sendResponse({ success: true });
    return true;
  }
});