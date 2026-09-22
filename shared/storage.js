/**
 * DailyLog Storage Layer
 * Supports Chrome Extension storage with automatic fallback to localStorage.
 */
const DailyLogStorage = {
  isExtension: typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local,

  async get(keys) {
    if (this.isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.get(keys, (res) => resolve(res || {}));
      });
    } else {
      // LocalStorage fallback for standalone/browser dev preview
      const result = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) {
        const item = localStorage.getItem('dailylog_' + k);
        try {
          result[k] = item ? JSON.parse(item) : undefined;
        } catch (e) {
          result[k] = item;
        }
      }
      return result;
    }
  },

  async set(items) {
    if (this.isExtension) {
      return new Promise((resolve) => {
        chrome.storage.local.set(items, () => {
          // Trigger badge update
          if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' }).catch(() => {});
          }
          resolve();
        });
      });
    } else {
      for (const [k, val] of Object.entries(items)) {
        localStorage.setItem('dailylog_' + k, JSON.stringify(val));
      }
      return Promise.resolve();
    }
  },

  getTodayKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  formatDisplayDate(dateKey) {
    if (!dateKey) return '';
    const parts = dateKey.split('-');
    if (parts.length !== 3) return dateKey;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleDateString('en-US', options);
  },

  formatDateFilename(dateKey) {
    if (!dateKey) return 'Daily-Log.txt';
    const parts = dateKey.split('-');
    if (parts.length !== 3) return `${dateKey}.txt`;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const monthStr = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${monthStr}-${year}.txt`;
  },

  async getSettings() {
    const data = await this.get(['settings']);
    return data.settings || {
      theme: 'dark',
      defaultSection: 'PMS - General Tasks',
      autoCarryOver: false,
      copyFormat: 'plaintext'
    };
  },

  async saveSettings(updates) {
    const current = await this.getSettings();
    const settings = { ...current, ...updates };
    await this.set({ settings });
    return settings;
  },

  async getReminderSettings() {
    const data = await this.get(['reminder_settings']);
    const defaults = {
      enabled: true,
      morningTime: '09:30',
      eveningTime: '17:30',
      weekdaysOnly: true,
      voiceEnabled: true,
      voiceName: '',
      voiceRate: 1.0,
      voicePitch: 1.0,
      notifyMorningEmpty: true,
      notifyEveningPending: true,
      morningMessage: '',
      eveningMessage: ''
    };
    const saved = data.reminder_settings || {};
    return {
      ...defaults,
      ...saved
    };
  },

  async saveReminderSettings(updates) {
    const current = await this.getReminderSettings();
    const reminder_settings = { ...current, ...updates };
    await this.set({ reminder_settings });
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'UPDATE_REMINDERS' }).catch(() => {});
    }
    return reminder_settings;
  },

  async getAllLogs() {
    const data = await this.get(['logs']);
    return data.logs || {};
  },

  async getDayLog(dateKey) {
    const logs = await this.getAllLogs();
    if (!logs[dateKey]) {
      const settings = await this.getSettings();
      logs[dateKey] = {
        date: dateKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sections: [
          {
            id: 'sec_' + Date.now(),
            title: '1. ' + (settings.defaultSection || 'PMS - Development & Tasks'),
            tasks: []
          }
        ],
        notes: ''
      };
      await this.set({ logs });
    }
    return logs[dateKey];
  },

  async saveDayLog(dateKey, logData) {
    const logs = await this.getAllLogs();
    logData.updatedAt = new Date().toISOString();
    logs[dateKey] = logData;
    await this.set({ logs });
    return logData;
  },

  async addTask(dateKey, sectionId, taskText, priority = 'normal') {
    const dayLog = await this.getDayLog(dateKey);
    let section = dayLog.sections.find(s => s.id === sectionId);
    if (!section) {
      if (dayLog.sections.length === 0) {
        section = {
          id: 'sec_' + Date.now(),
          title: '1. General Tasks',
          tasks: []
        };
        dayLog.sections.push(section);
      } else {
        section = dayLog.sections[0];
      }
    }

    const newTask = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      text: taskText.trim(),
      status: 'pending', // 'pending' | 'in_progress' | 'completed' | 'blocker'
      priority: priority, // 'normal' | 'high' | 'blocker'
      createdAt: new Date().toISOString()
    };

    section.tasks.push(newTask);
    await this.saveDayLog(dateKey, dayLog);
    return { dayLog, newTask };
  },

  async updateTask(dateKey, taskId, updates) {
    const dayLog = await this.getDayLog(dateKey);
    for (const sec of dayLog.sections) {
      const taskIndex = sec.tasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        sec.tasks[taskIndex] = { ...sec.tasks[taskIndex], ...updates };
        await this.saveDayLog(dateKey, dayLog);
        return { dayLog, task: sec.tasks[taskIndex] };
      }
    }
    return null;
  },

  async deleteTask(dateKey, taskId) {
    const dayLog = await this.getDayLog(dateKey);
    for (const sec of dayLog.sections) {
      sec.tasks = sec.tasks.filter(t => t.id !== taskId);
    }
    await this.saveDayLog(dateKey, dayLog);
    return dayLog;
  },

  async addSection(dateKey, title) {
    const dayLog = await this.getDayLog(dateKey);
    const secNum = dayLog.sections.length + 1;
    let cleanTitle = title.trim();
    if (!/^\d+\./.test(cleanTitle)) {
      cleanTitle = `${secNum}. ${cleanTitle}`;
    }

    const newSec = {
      id: 'sec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: cleanTitle,
      tasks: []
    };
    dayLog.sections.push(newSec);
    await this.saveDayLog(dateKey, dayLog);
    return { dayLog, section: newSec };
  },

  async updateSectionTitle(dateKey, sectionId, newTitle) {
    const dayLog = await this.getDayLog(dateKey);
    const sec = dayLog.sections.find(s => s.id === sectionId);
    if (sec) {
      sec.title = newTitle.trim();
      await this.saveDayLog(dateKey, dayLog);
    }
    return dayLog;
  },

  async deleteSection(dateKey, sectionId) {
    const dayLog = await this.getDayLog(dateKey);
    dayLog.sections = dayLog.sections.filter(s => s.id !== sectionId);
    await this.saveDayLog(dateKey, dayLog);
    return dayLog;
  },

  async saveNotes(dateKey, notes) {
    const dayLog = await this.getDayLog(dateKey);
    dayLog.notes = notes;
    await this.saveDayLog(dateKey, dayLog);
    return dayLog;
  },

  async searchLogs(query) {
    const logs = await this.getAllLogs();
    const cleanQuery = query.toLowerCase().trim();
    if (!cleanQuery) return [];

    const matches = [];
    for (const [dateKey, dayLog] of Object.entries(logs)) {
      let dateMatched = false;
      const matchingTasks = [];

      for (const sec of dayLog.sections || []) {
        for (const task of sec.tasks || []) {
          if (task.text.toLowerCase().includes(cleanQuery)) {
            matchingTasks.push({
              section: sec.title,
              task: task
            });
            dateMatched = true;
          }
        }
      }

      if (dayLog.notes && dayLog.notes.toLowerCase().includes(cleanQuery)) {
        dateMatched = true;
      }

      if (dateMatched) {
        matches.push({
          date: dateKey,
          displayDate: this.formatDisplayDate(dateKey),
          matchingTasks: matchingTasks,
          hasNotesMatch: dayLog.notes ? dayLog.notes.toLowerCase().includes(cleanQuery) : false
        });
      }
    }

    // Sort newest date first
    matches.sort((a, b) => b.date.localeCompare(a.date));
    return matches;
  },

  // Initialize demo data if no records exist yet
  async initDemoIfEmpty() {
    const data = await this.get(['logs']);
    if (!data.logs || Object.keys(data.logs).length === 0) {
      const todayKey = this.getTodayKey();
      const sample = {
        [todayKey]: {
          date: todayKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sections: [
            {
              id: 'sec_1',
              title: "1. PMS - Codebase Setup & Code Alignment:",
              tasks: [
                {
                  id: 't1',
                  text: 'Cloned repository from release branch & verified dependencies',
                  status: 'completed',
                  priority: 'normal'
                },
                {
                  id: 't2',
                  text: 'Cross-compared changes with reference repository to port enhancements',
                  status: 'completed',
                  priority: 'normal'
                }
              ]
            },
            {
              id: 'sec_2',
              title: "2. PMS - My Desk (Front Desk & Patient Form):",
              tasks: [
                {
                  id: 't3',
                  text: 'Ported Patient Density Map component and filter updates',
                  status: 'completed',
                  priority: 'high'
                },
                {
                  id: 't4',
                  text: 'Updated PatientForm and styles for form state & blood group selection',
                  status: 'in_progress',
                  priority: 'normal'
                }
              ]
            },
            {
              id: 'sec_3',
              title: "3. PMS - Medicine Catalog & Pharmacy Billing:",
              tasks: [
                {
                  id: 't5',
                  text: 'Resolved multiple tax selection issue in Add Medicine popup',
                  status: 'completed',
                  priority: 'normal'
                },
                {
                  id: 't6',
                  text: 'Investigated payment status options and default payment modes',
                  status: 'pending',
                  priority: 'normal'
                }
              ]
            }
          ],
          notes: 'Team standup at 10:30 AM. Need to review deployment logs before EOD.'
        }
      };
      await this.set({ logs: sample });
    }
  }
};

if (typeof window !== 'undefined') {
  window.DailyLogStorage = DailyLogStorage;
}
