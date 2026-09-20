/**
 * DailyLog - Local File System Access API Sync Engine
 * Connects to local D:\Personal\Data folder and automatically writes/reads
 * tasks into corresponding Year/Month/DD-Mon-YYYY.txt files.
 */

const LOCAL_SYNC_DB = 'DailyLogLocalSyncDB';
const LOCAL_SYNC_STORE = 'directory_handles';
const LOCAL_SYNC_KEY = 'data_folder_handle';

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_SYNC_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LOCAL_SYNC_STORE)) {
        request.result.createObjectStore(LOCAL_SYNC_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveStoredHandle(handle) {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_SYNC_STORE, 'readwrite');
    tx.objectStore(LOCAL_SYNC_STORE).put(handle, LOCAL_SYNC_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getStoredHandle() {
  try {
    const db = await openSyncDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_SYNC_STORE, 'readonly');
      const req = tx.objectStore(LOCAL_SYNC_STORE).get(LOCAL_SYNC_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[LocalSync] Could not open DB to get handle:', err);
    return null;
  }
}

async function clearStoredHandle() {
  try {
    const db = await openSyncDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_SYNC_STORE, 'readwrite');
      tx.objectStore(LOCAL_SYNC_STORE).delete(LOCAL_SYNC_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[LocalSync] Could not clear handle:', err);
  }
}

async function verifyDirPermission(handle, readWrite = true) {
  if (!handle) return false;
  const options = {};
  if (readWrite) options.mode = 'readwrite';
  try {
    if ((await handle.queryPermission(options)) === 'granted') {
      return true;
    }
    if ((await handle.requestPermission(options)) === 'granted') {
      return true;
    }
  } catch (err) {
    console.warn('[LocalSync] Permission query failed:', err);
  }
  return false;
}

function parseDateForLocalSync(dateStr) {
  const parts = dateStr.split('-');
  const year = parts[0];
  const monthNum = parts[1];
  const day = parts[2];

  const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthIdx = parseInt(monthNum, 10) - 1;
  const monthName = fullMonths[monthIdx] || 'September';
  const monthFolderName = String(monthNum) + ' ' + monthName;

  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortMonth = shortMonths[monthIdx] || 'Sep';
  const fileName = String(parseInt(day, 10)).padStart(2, '0') + '-' + shortMonth + '-' + year + '.txt';

  return { year, monthFolderName, fileName };
}

function parseFileNameToDate(fileName) {
  const match = fileName.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\.txt$/i);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const monthStr = match[2].toLowerCase();
  const year = match[3];
  const shortMonths = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const month = shortMonths[monthStr];
  if (!month) return null;
  return year + '-' + month + '-' + day;
}

function formatTasksToJournal(tasksForDate) {
  if (!tasksForDate || tasksForDate.length === 0) return "Today's Task:\n";

  let output = "Today's Task:\n";
  const grouped = {};
  tasksForDate.forEach(t => {
    const mod = t.name || t.module || 'General Tasks';
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(t);
  });

  let counter = 1;
  for (const [mod, items] of Object.entries(grouped)) {
    let cleanMod = mod.replace(/^\d+\.\s*/, '').replace(/:$/, '');
    output += counter + '. ' + cleanMod + ':\n';
    items.forEach(i => {
      const desc = i.description || i.text || '';
      output += '   - ' + desc + '\n';
    });
    output += "\n";
    counter++;
  }
  return output.trim();
}

function mergeTasksIntoExistingFile(existingText, newTasksText) {
  if (!existingText || !existingText.trim()) {
    return newTasksText + '\n';
  }

  const todayMatch = existingText.match(/Today's Task:/i);
  if (!todayMatch) {
    return newTasksText + '\n\n' + existingText.trim() + '\n';
  }

  const startIndex = todayMatch.index;
  const afterToday = existingText.substring(startIndex);
  
  const nextSectionMatch = afterToday.substring(12).search(/\n(?=[A-Za-z0-9#].*?(Report|Notes|Summary|###))/i);
  if (nextSectionMatch !== -1) {
    const cutIndex = startIndex + 12 + nextSectionMatch;
    const remainder = existingText.substring(cutIndex).trim();
    return newTasksText + '\n\n' + remainder + '\n';
  } else {
    return newTasksText + '\n';
  }
}

// Universal parser that handles structured, freeform, numbered, or unbulleted entries
function parseJournalText(text, dateStr) {
  const parsedTasks = [];
  const notesLines = [];
  const lines = text.split(/\r?\n/);

  let currentModule = 'General Tasks';
  let inNotesSection = false;

  // Notes sections that shouldn't be parsed as tasks (Q&A, Bonus Knowledge)
  const notesSectionRegex = /^(bonus knowledge|what is api|scratchpad|knowledge|learnings|q&a|faq):?/i;
  // Document-level headers to skip (e.g. "Today's Task:", "Weekly Report 14-Sep-2026...", "24-June")
  const docHeaderRegex = /^(today's task:?|weekly report.*?|\d{1,2}\s*[-–/]\s*[A-Za-z]+.*)$/i;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Detect dedicated notes sections (like Bonus Knowledge, What is API)
    if (notesSectionRegex.test(trimmed)) {
      inNotesSection = true;
      notesLines.push(rawLine);
      continue;
    }
    if (inNotesSection) {
      notesLines.push(rawLine);
      continue;
    }

    // Skip document-level header lines
    if (docHeaderRegex.test(trimmed) && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
      continue;
    }

    // Check if line is a bullet item (*, -, •) or numbered item (1., 2.)
    const isBulletItem = /^([-*•]|\d+[\.\)])\s+/.test(trimmed);

    if (!isBulletItem) {
      // If it's not a bullet item and is relatively short, it's a module header!
      // (e.g. "Employee Wellness", "PMS", "1. PMS - My Desk:", "Add more sections:")
      const cleanMod = trimmed.replace(/^(\d+[\.\)]\s*)?/, '').replace(/:$/, '').trim();
      if (cleanMod.length < 50 && !/[.!?]$/.test(cleanMod)) {
        currentModule = cleanMod;
        continue;
      }
    }

    // Clean task description
    let taskText = trimmed.replace(/^([-*•]|\d+[\.\)])\s*/, '').trim();

    // Detect status
    let status = 'In Progress';
    if (/\[x\]/i.test(taskText)) {
      status = 'Completed';
      taskText = taskText.replace(/\[[xX]\]\s*/, '');
    } else if (/\[ \]/i.test(taskText)) {
      status = 'In Progress';
      taskText = taskText.replace(/\[ \]\s*/, '');
    } else if (/[-–—]\s*(completed|done)\s*$/i.test(taskText)) {
      status = 'Completed';
      taskText = taskText.replace(/[-–—]\s*(completed|done)\s*$/i, '');
    } else if (/[-–—]\s*(inprogress|in progress|started)\s*(\(.*?\))?\s*$/i.test(taskText)) {
      status = 'In Progress';
      taskText = taskText.replace(/[-–—]\s*(inprogress|in progress|started)\s*(\(.*?\))?\s*$/i, '');
    } else if (/[-–—]\s*blocked\s*$/i.test(taskText)) {
      status = 'Blocked';
      taskText = taskText.replace(/[-–—]\s*blocked\s*$/i, '');
    } else {
      // Completed by default for historical logs or descriptive bullet items
      status = 'Completed';
    }

    taskText = taskText.trim();
    if (taskText) {
      parsedTasks.push({
        id: Date.now() + Math.floor(Math.random() * 1000000) + i,
        date: dateStr,
        name: currentModule,
        module: currentModule,
        description: taskText,
        text: taskText,
        status: status
      });
    }
  }

  return {
    tasks: parsedTasks,
    notes: notesLines.join('\n').trim()
  };
}

window.DailyLogLocalSync = {
  parseFileNameToDate,
  parseJournalText,

  async isConnected() {
    const handle = await getStoredHandle();
    if (!handle) return false;
    try {
      const permitted = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
      return permitted;
    } catch (e) {
      return false;
    }
  },

  async connectFolder() {
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('File System Access API is not supported in this window.');
    }
    let handle;
    try {
      handle = await window.showDirectoryPicker({
        id: 'dailylog_data',
        startIn: 'documents'
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      handle = await window.showDirectoryPicker();
    }

    const hasPerm = await verifyDirPermission(handle, true);
    if (!hasPerm) {
      throw new Error('Write permission was not granted for the selected folder.');
    }

    await saveStoredHandle(handle);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        local_sync_active: true,
        local_sync_folder_name: handle.name
      });
    }

    return handle;
  },

  async disconnectFolder() {
    await clearStoredHandle();
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        local_sync_active: false,
        local_sync_folder_name: null
      });
    }
  },

  async syncTasksForDate(dateStr, allTasks) {
    const handle = await getStoredHandle();
    if (!handle) {
      return { synced: false, reason: 'not_connected' };
    }

    const hasPerm = await verifyDirPermission(handle, true);
    if (!hasPerm) {
      return { synced: false, reason: 'permission_needed' };
    }

    const { year, monthFolderName, fileName } = parseDateForLocalSync(dateStr);

    try {
      const yearDir = await handle.getDirectoryHandle(year, { create: true });

      let monthDir = null;
      try {
        for await (const entry of yearDir.values()) {
          if (entry.kind === 'directory' && entry.name.toLowerCase().includes(monthFolderName.toLowerCase().split(' ')[1])) {
            monthDir = entry;
            break;
          }
        }
      } catch (e) {}

      if (!monthDir) {
        monthDir = await yearDir.getDirectoryHandle(monthFolderName, { create: true });
      }

      const fileHandle = await monthDir.getFileHandle(fileName, { create: true });

      let existingText = '';
      try {
        const file = await fileHandle.getFile();
        existingText = await file.text();
      } catch (rErr) {
        existingText = '';
      }

      const tasksForDate = (allTasks || []).filter(t => t.date === dateStr);
      const newTasksText = formatTasksToJournal(tasksForDate);
      const finalContent = mergeTasksIntoExistingFile(existingText, newTasksText);

      const writable = await fileHandle.createWritable();
      await writable.write(finalContent);
      await writable.close();

      console.log('[LocalSync] Successfully synced ' + tasksForDate.length + ' tasks to ' + year + '/' + monthFolderName + '/' + fileName);
      return {
        synced: true,
        path: year + '\\' + monthFolderName + '\\' + fileName,
        count: tasksForDate.length
      };
    } catch (err) {
      console.error('[LocalSync] Failed to write file:', err);
      return { synced: false, reason: err.message };
    }
  },

  async readTasksFromDate(dateStr) {
    const handle = await getStoredHandle();
    if (!handle) return { tasks: [], notes: '' };
    const hasPerm = await verifyDirPermission(handle, false);
    if (!hasPerm) return { tasks: [], notes: '' };

    const { year, monthFolderName, fileName } = parseDateForLocalSync(dateStr);
    try {
      const yearDir = await handle.getDirectoryHandle(year);
      let monthDir = null;
      for await (const entry of yearDir.values()) {
        if (entry.kind === 'directory' && entry.name.toLowerCase().includes(monthFolderName.toLowerCase().split(' ')[1])) {
          monthDir = entry;
          break;
        }
      }
      if (!monthDir) monthDir = await yearDir.getDirectoryHandle(monthFolderName);
      
      let fileHandle = null;
      try {
        fileHandle = await monthDir.getFileHandle(fileName);
      } catch (fErr) {
        const dayPart = String(parseInt(day, 10));
        for await (const entry of monthDir.values()) {
          if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.txt')) {
            const entryLow = entry.name.toLowerCase();
            if (entryLow === fileName.toLowerCase() ||
                entryLow.startsWith(dayPart + '-') ||
                entryLow.startsWith(dayPart.padStart(2, '0') + '-')) {
              fileHandle = entry;
              break;
            }
          }
        }
      }

      if (!fileHandle) return { tasks: [], notes: '' };
      const file = await fileHandle.getFile();
      const text = await file.text();
      return parseJournalText(text, dateStr);
    } catch (e) {
      return { tasks: [], notes: '' };
    }
  },

  async readAllTasksForMonth(dateStr) {
    const handle = await getStoredHandle();
    if (!handle) return [];
    const hasPerm = await verifyDirPermission(handle, false);
    if (!hasPerm) return [];

    const { year, monthFolderName } = parseDateForLocalSync(dateStr);
    const allParsed = [];

    try {
      const yearDir = await handle.getDirectoryHandle(year);
      let monthDir = null;
      for await (const entry of yearDir.values()) {
        if (entry.kind === 'directory' && entry.name.toLowerCase().includes(monthFolderName.toLowerCase().split(' ')[1])) {
          monthDir = entry;
          break;
        }
      }
      if (!monthDir) monthDir = await yearDir.getDirectoryHandle(monthFolderName);

      for await (const entry of monthDir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.txt')) {
          const fileDate = parseFileNameToDate(entry.name);
          if (fileDate) {
            try {
              const fileHandle = await monthDir.getFileHandle(entry.name);
              const file = await fileHandle.getFile();
              const text = await file.text();
              const res = parseJournalText(text, fileDate);
              if (res && res.tasks && res.tasks.length > 0) {
                allParsed.push(...res.tasks);
              }
            } catch (fileErr) {
              console.warn('[LocalSync] Error reading file ' + entry.name, fileErr);
            }
          }
        }
      }
    } catch (dirErr) {
      console.warn('[LocalSync] Could not read month directory:', dirErr);
    }
    return allParsed;
  }
};
