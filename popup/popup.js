/**
 * DailyLog Pro - Executive Popup Controller
 * Zero hardcoded data. 100% user-driven.
 */

let tasks = [];
let knownModules = new Set(['PMS', 'General Tasks']);

// Synchronously cached browser window and tab IDs to preserve Chrome's user gesture
let currentBrowserWindowId = null;
let currentActiveTabId = null;

if (typeof chrome !== "undefined") {
  if (chrome.windows && chrome.windows.getLastFocused) {
    chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (win) => {
      if (win && win.id) currentBrowserWindowId = win.id;
    });
  }
  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        currentActiveTabId = tabs[0].id;
        if (!currentBrowserWindowId) currentBrowserWindowId = tabs[0].windowId;
      }
    });
  }
}

let currentFilterDate = getTodayKey();
let activeView = 'today'; // 'today' | 'week' | 'all'
let collapsedModules = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  initUI();
  syncWithDiskTasks(currentFilterDate);
});

function isHeaderArtifact(text) {
  if (!text) return false;
  const t = text.trim();
  return /^(today's task:?|weekly report.*?|\d+[\.\)]\s*.*?:|[A-Za-z0-9_\-\s&/()]{2,50}:)$/i.test(t);
}

async function loadState() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['worklog_tasks', 'worklog_theme'], (res) => {
        let loaded = (res.worklog_tasks && Array.isArray(res.worklog_tasks)) ? res.worklog_tasks : [];
        // Clean out any previously injected sample seed IDs and header lines mistakenly saved as tasks
        tasks = loaded.filter(t => !(t.id >= 1 && t.id <= 10) && !(t.id >= 101 && t.id <= 110) && !isHeaderArtifact(t.description || t.text || ''));
        chrome.storage.local.set({ worklog_tasks: tasks });

        if (res.worklog_theme) {
          applyTheme(res.worklog_theme);
        }
        resolve();
      });
    });
  } else {
    const local = localStorage.getItem("worklog_tasks");
    let loaded = local ? JSON.parse(local) : [];
    tasks = loaded.filter(t => !(t.id >= 1 && t.id <= 10) && !(t.id >= 101 && t.id <= 110) && !isHeaderArtifact(t.description || t.text || ''));
    localStorage.setItem("worklog_tasks", JSON.stringify(tasks));
    
    const savedTheme = localStorage.getItem("worklog_theme") || "dark";
    applyTheme(savedTheme);
  }
}

function persistTasks(targetDate) {
  localStorage.setItem("worklog_tasks", JSON.stringify(tasks));
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ worklog_tasks: tasks });
  }

  // Auto-sync directly to local text file in D:\Personal\Data
  if (window.DailyLogLocalSync && typeof window.DailyLogLocalSync.syncTasksForDate === 'function') {
    const syncDate = targetDate || currentFilterDate;
    window.DailyLogLocalSync.syncTasksForDate(syncDate, tasks).then(res => {
      if (res && res.synced) {
        console.log('[DailyLog] Auto-synced to local file: ' + res.path);
        const syncBtn = document.getElementById("btnSyncFolder");
        if (syncBtn) syncBtn.classList.add("sync-connected");
      }
    }).catch(err => console.warn('[DailyLog] Local sync notice:', err));
  }
}

function initUI() {
  const dInp = document.getElementById("dateInput"); if (dInp) dInp.value = currentFilterDate;
  initCalendarPopover();

  // Also make the command row date picker open on click anywhere
  const cmdDateInput = document.getElementById("dateInput");
  if (cmdDateInput) {
    cmdDateInput.addEventListener("click", () => {
      try {
        if (typeof cmdDateInput.showPicker === "function") {
          cmdDateInput.showPicker();
        }
      } catch (err) {}
    });
    cmdDateInput.addEventListener("change", (e) => {
      if (e.target.value) {
        currentFilterDate = e.target.value;
        const picker = document.getElementById("filterDatePicker");
        if (picker) picker.value = currentFilterDate;
        activeView = 'today';
        document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.view === 'today'));
        updateDateDisplay();
        renderTasks();
      }
    });
  }

  // Jump to Today button
  const btnToday = document.getElementById("btnJumpToday");
  if (btnToday) {
    btnToday.addEventListener("click", () => {
      currentFilterDate = getTodayKey();
      const dInp = document.getElementById("dateInput"); if (dInp) dInp.value = currentFilterDate;
      const picker = document.getElementById("filterDatePicker");
      if (picker) picker.value = currentFilterDate;
      activeView = 'today';
      document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.view === 'today'));
      updateDateDisplay();
      renderTasks();
      syncWithDiskTasks(currentFilterDate);
    });
  }
  updateDateDisplay();
  populateModuleDropdown();
  renderTasks();

  // Events
  const btnSubmit = document.getElementById("btnSubmitTask");
  if (btnSubmit) btnSubmit.addEventListener("click", addTask);

  const taskTextInput = document.getElementById("taskTextInput");
  if (taskTextInput) {
    taskTextInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addTask();
    });
  }

  const btnPrev = document.getElementById("btnPrevDay");
  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      shiftDate(-1);
    });
  }

  const btnNext = document.getElementById("btnNextDay");
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      shiftDate(1);
    });
  }

  // Segment Buttons
  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeView = btn.dataset.view;
      renderTasks();
    });
  });

  // Custom Dropdowns (Module & Status)
  initCustomDropdowns();

  // Theme Toggle
  
  // Local Folder Auto-Sync Button
  const btnSyncFolder = document.getElementById("btnSyncFolder");
  if (btnSyncFolder) {
    if (window.DailyLogLocalSync) {
      window.DailyLogLocalSync.isConnected().then(connected => {
        if (connected) {
          btnSyncFolder.classList.add("sync-connected");
          btnSyncFolder.title = "Local Sync Active (D:\\Personal\\Data) - Click to sync now";
        } else {
          btnSyncFolder.classList.remove("sync-connected");
          btnSyncFolder.title = "Connect Local Folder (D:\\Personal\\Data)";
        }
      });
    }

    btnSyncFolder.addEventListener("click", async () => {
      console.log("[DailyLog] Sync button clicked in popup");
      const isConn = window.DailyLogLocalSync ? await window.DailyLogLocalSync.isConnected() : false;
      if (isConn) {
        btnSyncFolder.classList.add("sync-connected");
        showToast("Syncing with D:\\Personal\\Data...");
        const res = await window.DailyLogLocalSync.syncTasksForDate(currentFilterDate, tasks);
        if (res && res.synced) {
          showToast("Synced " + res.count + " tasks to " + res.path);
        } else {
          showToast("Tasks are up to date");
        }
      } else {
        // Open sync_setup.html in a tab to prevent popup closing on file picker focus loss
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.create({ url: chrome.runtime.getURL('sync_setup.html') });
        } else {
          window.open('../sync_setup.html', '_blank');
        }
      }
    });
  }

  const btnTheme = document.getElementById("btnThemeToggle");
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "dark";
      const next = cur === "dark" ? "light" : "dark";
      applyTheme(next);
    });
  }

  // Reminders
  initReminderModal();

  // Exporters
  const btnStandup = document.getElementById("btnCopyStandup");
  if (btnStandup) btnStandup.addEventListener("click", copyStandupReport);

  const btnCopy = document.getElementById("btnCopyTxt");
  if (btnCopy) btnCopy.addEventListener("click", copyPlainTextJournal);

  const btnDl = document.getElementById("btnDownloadTxt");
  if (btnDl) btnDl.addEventListener("click", downloadJournalFile);

  // Quick Feature Guide Modal
  initQuickGuideModal();

  // Workspace Launcher
  const btnDash = document.getElementById("btnOpenDashboard");
  if (btnDash) btnDash.addEventListener("click", openWorkspace);

  const btnLaunch = document.getElementById("btnLaunchFull");
  if (btnLaunch) btnLaunch.addEventListener("click", openWorkspace);

    // Sidebar Launcher (Chrome Side Panel API - User Gesture Synchronous)
  function openSidePanelAction() {
    console.log("Opening side panel...");

    // 1. Dispatch message to background service worker
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: "open_side_panel", type: "OPEN_SIDE_PANEL" });
    }

    // 2. Direct call from popup using active tab in current normal window
    if (typeof chrome !== "undefined" && chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
      if (chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].id) {
            chrome.sidePanel.open({ tabId: tabs[0].id }).catch((err) => {
              console.warn("Direct tabId sidepanel open failed:", err);
              if (tabs[0].windowId) {
                chrome.sidePanel.open({ windowId: tabs[0].windowId }).catch(() => {});
              }
            });
          }
        });
      }
    }

    // 3. Close the popup window after a brief tick so the side panel gains focus on the screen
    setTimeout(() => {
      window.close();
    }, 150);
  }

  const btnOpenSidebar = document.getElementById("btnOpenSidebar");
  if (btnOpenSidebar) {
    btnOpenSidebar.addEventListener("click", (e) => {
      e.preventDefault();
      openSidePanelAction();
    });
  }

  const btnDockSidebar = document.getElementById("btnDockSidebar");
  if (btnDockSidebar) {
    btnDockSidebar.addEventListener("click", (e) => {
      e.preventDefault();
      openSidePanelAction();
    });
  }

}

let calViewYear = null;
let calViewMonth = null;

function initCalendarPopover() {
  const container = document.getElementById("datePickerContainer");
  const popover = document.getElementById("calendarPopover");
  const overlay = document.getElementById("dateDisplayOverlay");
  const monthTitle = document.getElementById("calMonthTitle");
  const daysGrid = document.getElementById("calDaysGrid");
  const btnPrev = document.getElementById("btnCalPrevMonth");
  const btnNext = document.getElementById("btnCalNextMonth");
  const btnToday = document.getElementById("btnCalJumpToday");

  if (!container || !popover) return;

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function renderCalendar() {
    if (calViewYear === null || calViewMonth === null) {
      const parts = currentFilterDate.split('-');
      calViewYear = parseInt(parts[0], 10);
      calViewMonth = parseInt(parts[1], 10) - 1;
    }

    monthTitle.textContent = `${months[calViewMonth]} ${calViewYear}`;
    daysGrid.innerHTML = '';

    const firstDayIndex = new Date(calViewYear, calViewMonth, 1).getDay();
    const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
    const todayStr = getTodayKey();

    // Fill leading previous-month days
    const prevMonthDays = new Date(calViewYear, calViewMonth, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const cell = document.createElement("div");
      cell.className = "cal-day-cell other-month";
      cell.textContent = prevMonthDays - i;
      daysGrid.appendChild(cell);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement("div");
      cell.className = "cal-day-cell";
      cell.textContent = day;

      if (dayStr === currentFilterDate) cell.classList.add("active-day");
      if (dayStr === todayStr) cell.classList.add("today-day");
      if (tasks.some(t => t.date === dayStr)) cell.classList.add("has-tasks");

      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        selectCalendarDate(dayStr);
      });

      daysGrid.appendChild(cell);
    }

    // Fill trailing next-month slots
    const totalSlots = firstDayIndex + daysInMonth;
    const remainingSlots = (7 - (totalSlots % 7)) % 7;
    for (let i = 1; i <= remainingSlots; i++) {
      const cell = document.createElement("div");
      cell.className = "cal-day-cell other-month";
      cell.textContent = i;
      daysGrid.appendChild(cell);
    }
  }

  function openPopover() {
    const parts = currentFilterDate.split('-');
    calViewYear = parseInt(parts[0], 10);
    calViewMonth = parseInt(parts[1], 10) - 1;
    renderCalendar();
    popover.hidden = false;
    container.classList.add("open");
  }

  function closePopover() {
    popover.hidden = true;
    container.classList.remove("open");
  }

  function togglePopover() {
    if (popover.hidden) {
      openPopover();
    } else {
      closePopover();
    }
  }

  function selectCalendarDate(dateStr) {
    currentFilterDate = dateStr;
    const dInp = document.getElementById("dateInput"); if (dInp) dInp.value = currentFilterDate;
    activeView = 'today';
    document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.view === 'today'));
    updateDateDisplay();
    renderTasks();
    syncWithDiskTasks(currentFilterDate);
    closePopover();
  }

  if (overlay) {
    overlay.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePopover();
    });
  }

  container.addEventListener("click", (e) => {
    if (e.target === container) {
      togglePopover();
    }
  });

  container.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      togglePopover();
    } else if (e.key === "Escape") {
      closePopover();
    }
  });

  if (btnPrev) {
    btnPrev.addEventListener("click", (e) => {
      e.stopPropagation();
      calViewMonth--;
      if (calViewMonth < 0) {
        calViewMonth = 11;
        calViewYear--;
      }
      renderCalendar();
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", (e) => {
      e.stopPropagation();
      calViewMonth++;
      if (calViewMonth > 11) {
        calViewMonth = 0;
        calViewYear++;
      }
      renderCalendar();
    });
  }

  if (btnToday) {
    btnToday.addEventListener("click", (e) => {
      e.stopPropagation();
      selectCalendarDate(getTodayKey());
    });
  }

  document.addEventListener("click", (e) => {
    if (!popover.hidden && !container.contains(e.target)) {
      closePopover();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !popover.hidden) {
      closePopover();
    }
  });
}

function populateModuleDropdown(selectedVal) {
  const container = document.getElementById("moduleDropdownItems");
  if (!container) return;
  const current = selectedVal || (document.getElementById("moduleSelect") ? document.getElementById("moduleSelect").value : "PMS");

  if (!knownModules.has("PMS")) knownModules.add("PMS");
  if (!knownModules.has("General Tasks")) knownModules.add("General Tasks");

  tasks.forEach(t => {
    const m = t.name || t.module;
    if (m && m.trim()) knownModules.add(m.trim());
  });

  container.innerHTML = "";
  knownModules.forEach(mod => {
    const opt = document.createElement("div");
    opt.className = "custom-select-option" + (mod === current ? " active" : "");
    opt.dataset.value = mod;
    opt.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--brand-primary); flex-shrink: 0;">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="option-text">${escapeHTML(mod)}</span>
      <svg class="option-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      setCustomSelectedModule(mod);
      closeAllDropdowns();
    });
    container.appendChild(opt);
  });
}

function setCustomSelectedModule(modName) {
  if (!modName) return;
  const clean = modName.trim();
  knownModules.add(clean);
  const hiddenInput = document.getElementById("moduleSelect");
  if (hiddenInput) hiddenInput.value = clean;
  const label = document.getElementById("moduleSelectedLabel");
  if (label) label.textContent = clean;
  populateModuleDropdown(clean);
}

function setCustomSelectedStatus(statusVal) {
  if (!statusVal) return;
  const hiddenInput = document.getElementById("statusSelect");
  if (hiddenInput) hiddenInput.value = statusVal;
  const label = document.getElementById("statusSelectedLabel");
  if (label) label.textContent = statusVal;

  const dot = document.getElementById("statusTriggerDot");
  if (dot) {
    dot.className = "status-indicator-dot " + (
      statusVal === "Completed" ? "dot-completed" :
      statusVal === "Blocked" ? "dot-blocked" : "dot-inprogress"
    );
  }

  const options = document.querySelectorAll("#statusDropdownItems .custom-select-option");
  options.forEach(opt => {
    opt.classList.toggle("active", opt.dataset.value === statusVal);
  });
}

function closeAllDropdowns() {
  document.querySelectorAll(".custom-select-wrap").forEach(wrap => {
    wrap.classList.remove("open");
    const pop = wrap.querySelector(".custom-select-popover");
    if (pop) {
      pop.hidden = true;
      pop.style.display = "none";
    }
  });
}

function initCustomDropdowns() {
  const modWrap = document.getElementById("moduleCustomSelectWrap");
  const modTrigger = document.getElementById("moduleDropdownTrigger");
  const modPopover = document.getElementById("moduleDropdownPopover");
  const inputNewMod = document.getElementById("inputNewModuleInline");

  if (modTrigger && modPopover && modWrap) {
    modTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = modWrap.classList.contains("open");
      closeAllDropdowns();
      if (!isOpen) {
        populateModuleDropdown();
        modWrap.classList.add("open");
        modPopover.hidden = false;
        modPopover.style.display = "flex";
        if (inputNewMod) setTimeout(() => inputNewMod.focus(), 50);
      }
    });
  }

  if (inputNewMod) {
    inputNewMod.addEventListener("click", (e) => e.stopPropagation());
    inputNewMod.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const clean = inputNewMod.value.trim();
        if (clean) {
          setCustomSelectedModule(clean);
          inputNewMod.value = "";
          closeAllDropdowns();
          showToast(`Module set to "${clean}"`);
        }
      } else if (e.key === "Escape") {
        closeAllDropdowns();
      }
    });
  }

  const statWrap = document.getElementById("statusCustomSelectWrap");
  const statTrigger = document.getElementById("statusDropdownTrigger");
  const statPopover = document.getElementById("statusDropdownPopover");
  const statOptions = document.querySelectorAll("#statusDropdownItems .custom-select-option");

  if (statTrigger && statPopover && statWrap) {
    statTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = statWrap.classList.contains("open");
      closeAllDropdowns();
      if (!isOpen) {
        statWrap.classList.add("open");
        statPopover.hidden = false;
        statPopover.style.display = "flex";
      }
    });
  }

  statOptions.forEach(opt => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      setCustomSelectedStatus(opt.dataset.value);
      closeAllDropdowns();
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-select-wrap")) {
      closeAllDropdowns();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllDropdowns();
    }
  });

  populateModuleDropdown("PMS");
  closeAllDropdowns();
}

function addTask() {
  const textInput = document.getElementById("taskTextInput");
  let text = textInput.value.trim();
  if (!text) {
    textInput.focus();
    return;
  }

  // Handle module-only input like "PMS:" or "General Tasks:" or "[PMS]"
  const moduleOnlyMatch = text.match(/^\[([^\]]+)\]$/) || text.match(/^([A-Za-z0-9_\-\s]{2,25}):$/);
  if (moduleOnlyMatch) {
    const newMod = moduleOnlyMatch[1].trim();
    setCustomSelectedModule(newMod);
    textInput.value = "";
    showToast(`Target module set to "${newMod}"`);
    return;
  }

  const modSelEl = document.getElementById("moduleSelect");
  let moduleName = modSelEl ? modSelEl.value : "PMS";
  if (!moduleName || moduleName === "+ New Module...") {
    moduleName = "PMS";
  }

  // Smart prefix detection: e.g. "PMS: task text" or "[PMS] task text"
  const prefixMatch = text.match(/^\[([^\]]+)\]\s*(.*)$/) || text.match(/^([A-Za-z0-9_\-\s]{2,25}):\s+(.*)$/);
  if (prefixMatch) {
    const detectedMod = prefixMatch[1].trim();
    const cleanText = prefixMatch[2].trim();
    if (detectedMod && cleanText) {
      moduleName = detectedMod;
      text = cleanText;
      setCustomSelectedModule(detectedMod);
    }
  }

  const statSelEl = document.getElementById("statusSelect");
  const status = statSelEl ? statSelEl.value : "In Progress";
  const dateInpEl = document.getElementById("dateInput");
  const date = (dateInpEl && dateInpEl.value) ? dateInpEl.value : currentFilterDate;

  const newTask = {
    id: Date.now(),
    date: date,
    name: moduleName,
    module: moduleName,
    description: text,
    text: text,
    status: status
  };

  tasks.unshift(newTask);
  persistTasks();
  textInput.value = "";
  populateModuleDropdown(moduleName);
  renderTasks();
  showToast(`Task added to ${moduleName}`);
}

function startInlineEdit(task, row, textEl) {
  if (row.classList.contains("editing")) return;
  row.classList.add("editing");

  const originalVal = task.text || task.description || "";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "task-inline-input";
  input.value = originalVal;

  textEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;

  const commitEdit = () => {
    if (committed) return;
    committed = true;
    const newVal = input.value.trim();
    if (newVal && newVal !== originalVal) {
      task.text = newVal;
      task.description = newVal;
      persistTasks();
      renderTasks();
      showToast("Task updated");
    } else {
      input.replaceWith(textEl);
      row.classList.remove("editing");
    }
  };

  const cancelEdit = () => {
    if (committed) return;
    committed = true;
    input.replaceWith(textEl);
    row.classList.remove("editing");
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  });

  input.addEventListener("blur", () => {
    commitEdit();
  });
}

function renderTasks() {
  const canvas = document.getElementById("tasksCanvas");
  canvas.innerHTML = "";

  // Filter tasks according to activeView and exclude any header-only artifacts
  let targetTasks = [];
  if (activeView === 'today') {
    targetTasks = tasks.filter(t => t.date === currentFilterDate);
  } else if (activeView === 'week') {
    const weekBounds = getWeekBounds(currentFilterDate);
    targetTasks = tasks.filter(t => t.date >= weekBounds.start && t.date <= weekBounds.end);
  } else {
    targetTasks = [...tasks];
  }
  targetTasks = targetTasks.filter(t => !isHeaderArtifact(t.description || t.text || ''));

  if (targetTasks.length === 0) {
    canvas.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <p style="font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">No tasks recorded for this date.</p>
        <p style="font-size: 11.5px; color: var(--text-muted);">Type in the input above and press Enter to add a task.</p>
      </div>
    `;
    updateMetrics(0, 0);
    return;
  }

  // Group tasks by module name
  const grouped = {};
  targetTasks.forEach(t => {
    const key = t.name || t.module || 'General Tasks';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  let totalTasks = targetTasks.length;
  let completedTasks = targetTasks.filter(t => t.status === "Completed").length;

  for (const [moduleName, items] of Object.entries(grouped)) {
    const card = document.createElement("div");
    card.className = "module-group";

    const isCollapsed = collapsedModules.has(moduleName);
    if (isCollapsed) card.classList.add("collapsed");

    const doneCount = items.filter(i => i.status === "Completed").length;
    const totalCount = items.length;

    card.innerHTML = `
      <div class="group-header">
        <div class="group-title-box">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--brand-primary)">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="group-title">${escapeHTML(moduleName)}</span>
          <button class="group-rename-btn" title="Rename module (e.g. to PMS)" type="button">✎</button>
        </div>
        <div class="group-header-actions">
          <span class="group-badge">${doneCount}/${totalCount}</span>
          <button class="group-collapse-btn" title="${isCollapsed ? 'Maximize' : 'Minimize'}" type="button">
            <svg class="collapse-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
      </div>
      <div class="group-tasks-list" id="groupList_${moduleName.replace(/\W/g, '_')}" style="${isCollapsed ? 'display:none;' : ''}"></div>
    `;

    const header = card.querySelector(".group-header");
    const listEl = card.querySelector(`#groupList_${moduleName.replace(/\W/g, '_')}`);
    const renameBtn = card.querySelector(".group-rename-btn");

    function startModuleRename() {
      const titleSpan = card.querySelector(".group-title");
      if (!titleSpan || titleSpan.classList.contains("editing")) return;
      titleSpan.classList.add("editing");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "group-title-inline-input";
      input.value = moduleName;
      input.style.width = Math.max(120, moduleName.length * 9 + 25) + "px";

      titleSpan.replaceWith(input);
      input.focus();
      input.select();

      let committed = false;
      const commitRename = () => {
        if (committed) return;
        committed = true;
        const cleanMod = input.value.trim();
        if (cleanMod && cleanMod !== moduleName) {
          tasks.forEach(t => {
            const m = t.name || t.module || 'General Tasks';
            if (m === moduleName) {
              t.name = cleanMod;
              t.module = cleanMod;
            }
          });
          knownModules.add(cleanMod);
          persistTasks();
          populateModuleDropdown(cleanMod);
          renderTasks();
          showToast(`Renamed to "${cleanMod}"`);
        } else {
          input.replaceWith(titleSpan);
          titleSpan.classList.remove("editing");
        }
      };

      const cancelRename = () => {
        if (committed) return;
        committed = true;
        input.replaceWith(titleSpan);
        titleSpan.classList.remove("editing");
      };

      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitRename();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelRename();
        }
      });
      input.addEventListener("blur", commitRename);
    }

    if (renameBtn) {
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startModuleRename();
      });
    }

    const titleSpanEl = card.querySelector(".group-title");
    if (titleSpanEl) {
      titleSpanEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startModuleRename();
      });
    }

    header.addEventListener("click", () => {
      if (collapsedModules.has(moduleName)) {
        collapsedModules.delete(moduleName);
      } else {
        collapsedModules.add(moduleName);
      }
      const nowCollapsed = collapsedModules.has(moduleName);
      card.classList.toggle("collapsed", nowCollapsed);
      listEl.style.display = nowCollapsed ? "none" : "";
      const btn = header.querySelector(".group-collapse-btn");
      if (btn) btn.title = nowCollapsed ? "Maximize" : "Minimize";
    });

    items.forEach(task => {
      const row = document.createElement("div");
      row.className = `task-row ${task.status === "Completed" ? 'completed' : ''}`;

      let statusPillClass = "completed";
      if (task.status === "In Progress") statusPillClass = "progress";
      if (task.status === "Blocked") statusPillClass = "blocked";

      row.innerHTML = `
        <input type="checkbox" class="task-check" ${task.status === "Completed" ? 'checked' : ''} title="Mark done">
        <div class="task-body">
          <span class="task-text">${escapeHTML(task.description || task.text || "")}</span>
        </div>
        <div class="task-right">
          ${activeView !== 'today' && task.date ? `<span class="task-date-badge">${task.date}</span>` : ''}
          <span class="status-pill ${statusPillClass}">${task.status}</span>
          <div class="task-actions">
            <button class="row-action-btn edit-btn" title="Edit text">✎</button>
            <button class="row-action-btn delete del-btn" title="Delete">×</button>
          </div>
        </div>
      `;

      // Toggle Done Checkbox
      row.querySelector(".task-check").addEventListener("change", (e) => {
        task.status = e.target.checked ? "Completed" : "In Progress";
        persistTasks();
        renderTasks();
      });

      // Edit Task (Inline)
      const textSpan = row.querySelector(".task-text");
      const editBtn = row.querySelector(".edit-btn");
      editBtn.addEventListener("click", () => {
        startInlineEdit(task, row, textSpan);
      });
      textSpan.addEventListener("dblclick", () => {
        startInlineEdit(task, row, textSpan);
      });

      // Delete Task
      row.querySelector(".del-btn").addEventListener("click", () => {
        if (confirm("Remove this task?")) {
          tasks = tasks.filter(t => t.id !== task.id);
          persistTasks();
          renderTasks();
          showToast("Task removed");
        }
      });

      listEl.appendChild(row);
    });

    canvas.appendChild(card);
  }

  updateMetrics(totalTasks, completedTasks);
}

function updateMetrics(total, completed) {
  const sumEl = document.getElementById("progressSummary");
  const pctEl = document.getElementById("progressPercentage");
  const fillEl = document.getElementById("progressTrackFill");
  if (!sumEl || !pctEl || !fillEl) return;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  sumEl.innerText = `${completed} of ${total} tasks completed`;
  pctEl.innerText = `${pct}%`;
  fillEl.style.width = `${pct}%`;
}

function shiftDate(deltaDays) {
  const parts = currentFilterDate.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + deltaDays);
  currentFilterDate = formatInputDate(d);
  const dInp = document.getElementById("dateInput"); if (dInp) dInp.value = currentFilterDate;
  const picker = document.getElementById("filterDatePicker");
  if (picker) picker.value = currentFilterDate;
  activeView = 'today';
  document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.view === 'today'));
  updateDateDisplay();
  renderTasks();
  syncWithDiskTasks(currentFilterDate);
}

function updateDateDisplay() {
  const parts = currentFilterDate.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const isToday = currentFilterDate === getTodayKey();
  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  const formatted = d.toLocaleDateString('en-GB', options);
  document.getElementById("currentDateDisplay").innerText = isToday ? `Today — ${formatted}` : formatted;
}

function copyStandupReport() {
  if (tasks.length === 0) {
    showToast("No tasks to copy");
    return;
  }
  let output = `### 🚀 Daily Standup Update (${currentFilterDate})\n\n`;
  const currentDayTasks = tasks.filter(t => t.date === currentFilterDate);
  const target = currentDayTasks.length > 0 ? currentDayTasks : tasks;

  const done = target.filter(t => t.status === "Completed");
  const inProg = target.filter(t => t.status === "In Progress");
  const blocked = target.filter(t => t.status === "Blocked");

  output += "**✅ Accomplished:**\n";
  if (done.length > 0) {
    done.forEach(t => output += `- ${t.name.replace(/^\d+\.\s*/, '')}: ${t.description}\n`);
  } else {
    output += "- None\n";
  }
  output += "\n";

  output += "**⏳ In Progress / Today:**\n";
  if (inProg.length > 0) {
    inProg.forEach(t => output += `- ${t.name.replace(/^\d+\.\s*/, '')}: ${t.description}\n`);
  } else {
    output += "- None\n";
  }
  output += "\n";

  output += "**⚠️ Blockers:**\n";
  if (blocked.length > 0) {
    blocked.forEach(t => output += `- ${t.description}\n`);
  } else {
    output += "- None\n";
  }

  navigator.clipboard.writeText(output).then(() => {
    showToast("Copied Standup update for Slack/Teams!");
  });
}

function copyPlainTextJournal() {
  const currentDayTasks = tasks.filter(t => t.date === currentFilterDate);
  const target = currentDayTasks.length > 0 ? currentDayTasks : tasks;

  if (target.length === 0) {
    showToast("No tasks to copy");
    return;
  }

  let output = "Today's Task:\n";
  const grouped = {};
  target.forEach(t => {
    if (!grouped[t.name]) grouped[t.name] = [];
    grouped[t.name].push(t);
  });

  let counter = 1;
  for (const [mod, items] of Object.entries(grouped)) {
    let cleanMod = mod.replace(/^\d+\.\s*/, '').replace(/:$/, '');
    output += `${counter}. ${cleanMod}:\n`;
    items.forEach(i => {
      output += `   - ${i.description}\n`;
    });
    output += "\n";
    counter++;
  }

  navigator.clipboard.writeText(output).then(() => {
    showToast("Copied daily journal format to clipboard!");
  });
}

function downloadJournalFile() {
  const currentDayTasks = tasks.filter(t => t.date === currentFilterDate);
  const target = currentDayTasks.length > 0 ? currentDayTasks : tasks;

  let output = "Today's Task:\n";
  const grouped = {};
  target.forEach(t => {
    if (!grouped[t.name]) grouped[t.name] = [];
    grouped[t.name].push(t);
  });

  let counter = 1;
  for (const [mod, items] of Object.entries(grouped)) {
    let cleanMod = mod.replace(/^\d+\.\s*/, '').replace(/:$/, '');
    output += `${counter}. ${cleanMod}:\n`;
    items.forEach(i => {
      output += `   - ${i.description}\n`;
    });
    output += "\n";
    counter++;
  }

  const parts = currentFilterDate.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const filename = `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}.txt`;

  const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${filename}`);
}

function openWorkspace() {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: chrome.runtime.getURL('worklog.html') });
  } else {
    window.open('../worklog.html', '_blank');
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("worklog_theme", theme);
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ worklog_theme: theme });
  }
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.innerHTML = theme === "dark" 
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' 
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
}

function showToast(msg) {
  const container = document.getElementById("toastContainer");
  const box = document.createElement("div");
  box.className = "toast-box";
  box.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    <span>${escapeHTML(msg)}</span>
  `;
  container.appendChild(box);
  setTimeout(() => {
    box.style.opacity = '0';
    box.style.transform = 'translateY(8px)';
    setTimeout(() => box.remove(), 200);
  }, 2200);
}

function getTodayKey() {
  const d = new Date();
  return formatInputDate(d);
}

function formatInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekBounds(dateStr) {
  const parts = dateStr.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    start: formatInputDate(start),
    end: formatInputDate(end)
  };
}

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


async function syncWithDiskTasks(specificDate) {
  if (!window.DailyLogLocalSync) return;
  try {
    const isConn = await window.DailyLogLocalSync.isConnected();
    if (!isConn) return;

    const targetDate = specificDate || currentFilterDate;

    // 1. Direct fetch for targetDate file (instant display for selected day)
    if (typeof window.DailyLogLocalSync.readTasksFromDate === 'function') {
      const dayResult = await window.DailyLogLocalSync.readTasksFromDate(targetDate);
      if (dayResult && dayResult.tasks) {
        // Build map of existing statuses for targetDate to preserve user checkboxes
        const existingStatusMap = new Map();
        tasks.filter(t => t.date === targetDate).forEach(t => {
          const desc = (t.description || t.text || '').trim().toLowerCase();
          if (desc) existingStatusMap.set(desc, t.status);
        });

        const otherDateTasks = tasks.filter(t => t.date !== targetDate);
        const updatedDayTasks = dayResult.tasks
          .filter(dt => !isHeaderArtifact(dt.description || dt.text || ''))
          .map(dt => {
            const desc = (dt.description || dt.text || '').trim().toLowerCase();
            if (existingStatusMap.has(desc)) {
              dt.status = existingStatusMap.get(desc);
            }
            return dt;
          });

        tasks = [...otherDateTasks, ...updatedDayTasks];
        localStorage.setItem("worklog_tasks", JSON.stringify(tasks));
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ worklog_tasks: tasks });
        }
        populateModuleDropdown();
        renderTasks();
      }
    }

    // 2. Background month sync for Week / All views
    if (typeof window.DailyLogLocalSync.readAllTasksForMonth === 'function') {
      const diskTasks = await window.DailyLogLocalSync.readAllTasksForMonth(targetDate);
      if (diskTasks && diskTasks.length > 0) {
        let changed = false;
        const beforeLen = tasks.length;
        tasks = tasks.filter(t => !isHeaderArtifact(t.description || t.text || ''));
        if (tasks.length !== beforeLen) changed = true;

        diskTasks.forEach(dt => {
          if (isHeaderArtifact(dt.description || dt.text || '')) return;
          const match = tasks.find(t =>
            t.date === dt.date &&
            (t.description || t.text || '').trim().toLowerCase() === (dt.description || dt.text || '').trim().toLowerCase()
          );
          if (match) {
            if (match.module !== dt.module || match.name !== dt.name) {
              match.module = dt.module;
              match.name = dt.name;
              changed = true;
            }
          } else {
            tasks.push(dt);
            changed = true;
          }
        });

        if (changed) {
          localStorage.setItem("worklog_tasks", JSON.stringify(tasks));
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ worklog_tasks: tasks });
          }
          populateModuleDropdown();
          renderTasks();
        }
      }
    }
  } catch (err) {
    console.warn('[DailyLog] syncWithDiskTasks notice:', err);
  }
}

/* ========================================================
   DAILY REMINDERS MODAL CONTROLLER
   ======================================================== */

async function initReminderModal() {
  const btnReminders = document.getElementById("btnReminders");
  const modal = document.getElementById("reminderModalOverlay");
  const btnClose = document.getElementById("btnCloseReminderModal");
  const btnCancel = document.getElementById("btnCancelReminder");
  const btnSave = document.getElementById("btnSaveReminders");
  const btnTest = document.getElementById("btnTestNotification");
  const btnTestVoice = document.getElementById("btnTestVoice");
  const chkEnabled = document.getElementById("chkRemindersEnabled");
  const inpMorning = document.getElementById("reminderMorningTime");
  const inpEvening = document.getElementById("reminderEveningTime");
  const chkWeekdays = document.getElementById("chkReminderWeekdays");
  const chkVoice = document.getElementById("chkReminderVoice");
  const voicePanel = document.getElementById("voiceCustomPanel");
  const selVoice = document.getElementById("selVoiceName");
  const rngRate = document.getElementById("rngVoiceRate");
  const lblRate = document.getElementById("lblVoiceRate");
  const inputsGroup = document.getElementById("reminderInputsGroup");
  const dot = document.getElementById("reminderIndicatorDot");
  const testFeedback = document.getElementById("testNotifFeedback");
  const inpMorningMsg = document.getElementById("reminderMorningMsg");
  const inpEveningMsg = document.getElementById("reminderEveningMsg");

  if (!btnReminders || !modal) return;

  async function loadSettings() {
    let s = {
      enabled: true,
      morningTime: '09:30',
      eveningTime: '17:30',
      weekdaysOnly: true,
      voiceEnabled: true,
      voiceName: '',
      voiceRate: 1.0,
      morningMessage: '',
      eveningMessage: ''
    };

    if (typeof DailyLogStorage !== 'undefined' && DailyLogStorage.getReminderSettings) {
      try {
        const stored = await DailyLogStorage.getReminderSettings();
        if (stored) s = { ...s, ...stored };
      } catch (err) {}
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const res = await new Promise(r => chrome.storage.local.get(['reminder_settings'], r));
        if (res && res.reminder_settings) s = { ...s, ...res.reminder_settings };
      } catch (err) {}
    }
    try {
      const local = localStorage.getItem('dailylog_reminder_settings');
      if (local) s = { ...s, ...JSON.parse(local) };
    } catch (e) {}
    return s;
  }

  let settings = await loadSettings();

  // Populate installed TTS voices
  loadAvailableVoices(settings.voiceName);

  function loadAvailableVoices(selectedVoiceName) {
    if (typeof chrome === 'undefined' || !chrome.tts || typeof chrome.tts.getVoices !== 'function') return;
    try {
      chrome.tts.getVoices((voices) => {
        if (!selVoice || !Array.isArray(voices)) return;
        selVoice.innerHTML = '<option value="">Default System Voice</option>';
        const sorted = [...voices].sort((a, b) => {
          const aEng = (a.lang || '').startsWith('en');
          const bEng = (b.lang || '').startsWith('en');
          if (aEng && !bEng) return -1;
          if (!aEng && bEng) return 1;
          return (a.voiceName || '').localeCompare(b.voiceName || '');
        });

        sorted.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.voiceName;
          const langDisplay = v.lang ? ` (${v.lang})` : '';
          opt.textContent = `${v.voiceName}${langDisplay}`;
          if (selectedVoiceName && v.voiceName === selectedVoiceName) {
            opt.selected = true;
          }
          selVoice.appendChild(opt);
        });
      });
    } catch (err) {
      console.warn('[DailyLog TTS] Failed to fetch voices:', err);
    }
  }

  function setup12HourPicker(hiddenId, ampmId) {
    const hiddenInp = document.getElementById(hiddenId);
    const textInp = document.getElementById(hiddenId + 'Val');
    const ampmWrap = (ampmId ? document.getElementById(ampmId) : null) ||
                     document.getElementById(hiddenId.replace('reminder', 'ampm').replace('Time', '')) ||
                     document.getElementById(hiddenId.replace('reminder', 'ampm'));
    if (!hiddenInp || !textInp || !ampmWrap) return null;

    const btnAM = ampmWrap.querySelector('[data-period="AM"]');
    const btnPM = ampmWrap.querySelector('[data-period="PM"]');

    function updateHidden() {
      let raw = textInp.value.trim();
      if (!raw) raw = '09:00';
      let parts = raw.split(':');
      let h = parseInt(parts[0], 10) || 9;
      let m = parseInt(parts[1], 10) || 0;
      if (h > 12) h = 12;
      if (h < 1) h = 12;
      if (m > 59) m = 59;
      if (m < 0) m = 0;

      const activePeriod = ampmWrap.querySelector('.rem-ampm-btn.active')?.dataset.period || 'AM';
      let h24 = h;
      if (activePeriod === 'PM' && h24 < 12) h24 += 12;
      if (activePeriod === 'AM' && h24 === 12) h24 = 0;

      hiddenInp.value = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function setFrom24(time24) {
      if (!time24) time24 = '09:30';
      const str = String(time24).trim().toUpperCase();
      const isPM = str.includes('PM');
      const isAM = str.includes('AM');
      const clean = str.replace(/[^0-9:]/g, '');
      const parts = clean.split(':');
      let h = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10) || 0;
      if (isNaN(h)) h = 9;

      let period = 'AM';
      if (isPM) {
        period = 'PM';
      } else if (isAM) {
        period = 'AM';
      } else {
        period = h >= 12 ? 'PM' : 'AM';
      }

      let h12 = h % 12;
      if (h12 === 0) h12 = 12;

      textInp.value = `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (btnAM && btnPM) {
        btnAM.classList.toggle('active', period === 'AM');
        btnPM.classList.toggle('active', period === 'PM');
      }
      updateHidden();
    }

    btnAM?.addEventListener('click', () => {
      btnAM.classList.add('active');
      btnPM?.classList.remove('active');
      updateHidden();
    });

    btnPM?.addEventListener('click', () => {
      btnPM.classList.add('active');
      btnAM?.classList.remove('active');
      updateHidden();
    });

    textInp.addEventListener('input', () => {
      let v = textInp.value.replace(/[^0-9:]/g, '');
      textInp.value = v;
      updateHidden();
    });

    textInp.addEventListener('blur', () => {
      let v = textInp.value.replace(/[^0-9]/g, '');
      if (v.length === 1 || v.length === 2) {
        let h = parseInt(v, 10);
        if (h > 12) h = 12;
        if (h < 1) h = 1;
        textInp.value = `${String(h).padStart(2, '0')}:00`;
      } else if (v.length === 3) {
        let h = parseInt(v.slice(0, 1), 10);
        let m = parseInt(v.slice(1), 10);
        textInp.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      } else if (v.length >= 4) {
        let h = parseInt(v.slice(0, 2), 10);
        let m = parseInt(v.slice(2, 4), 10);
        if (h > 12) h = 12;
        if (h < 1) h = 1;
        if (m > 59) m = 59;
        textInp.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
      updateHidden();
    });

    return { setFrom24, updateHidden };
  }

  const morningPicker = setup12HourPicker('reminderMorningTime', 'ampmMorning');
  const eveningPicker = setup12HourPicker('reminderEveningTime', 'ampmEvening');

  function updateFormState(s) {
    if (chkEnabled) chkEnabled.checked = !!s.enabled;
    if (morningPicker) {
      morningPicker.setFrom24(s.morningTime || '09:30');
    } else if (inpMorning) {
      inpMorning.value = s.morningTime || '09:30';
    }
    if (eveningPicker) {
      eveningPicker.setFrom24(s.eveningTime || '17:30');
    } else if (inpEvening) {
      inpEvening.value = s.eveningTime || '17:30';
    }
    if (chkWeekdays) chkWeekdays.checked = s.weekdaysOnly !== false;
    if (chkVoice) chkVoice.checked = s.voiceEnabled !== false;
    if (inpMorningMsg) inpMorningMsg.value = s.morningMessage || '';
    if (inpEveningMsg) inpEveningMsg.value = s.eveningMessage || '';

    if (rngRate) {
      rngRate.value = s.voiceRate || 1.0;
      if (lblRate) lblRate.textContent = `${parseFloat(rngRate.value).toFixed(1)}x`;
    }
    if (selVoice && s.voiceName) {
      selVoice.value = s.voiceName;
    }
    if (inputsGroup) {
      inputsGroup.classList.toggle('disabled', !s.enabled);
    }
    if (voicePanel) {
      voicePanel.classList.toggle('disabled', !s.voiceEnabled);
    }
    if (dot) {
      dot.style.display = s.enabled ? 'block' : 'none';
    }
  }

  updateFormState(settings);

  if (chkEnabled) {
    chkEnabled.addEventListener('change', () => {
      if (inputsGroup) {
        inputsGroup.classList.toggle('disabled', !chkEnabled.checked);
      }
    });
  }

  if (chkVoice && voicePanel) {
    chkVoice.addEventListener('change', () => {
      voicePanel.classList.toggle('disabled', !chkVoice.checked);
    });
  }

  if (rngRate && lblRate) {
    rngRate.addEventListener('input', () => {
      lblRate.textContent = `${parseFloat(rngRate.value).toFixed(1)}x`;
    });
  }

  btnReminders.addEventListener('click', async () => {
    settings = await loadSettings();
    updateFormState(settings);
    modal.style.display = 'flex';
    if (testFeedback) testFeedback.textContent = '';
  });

  function closeModal() {
    modal.style.display = 'none';
  }

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  if (btnTest) {
    btnTest.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'TEST_NOTIFICATION' });
        if (testFeedback) {
          testFeedback.textContent = 'Alert sent!';
          setTimeout(() => { if (testFeedback) testFeedback.textContent = ''; }, 3500);
        }
      } else {
        if (testFeedback) testFeedback.textContent = 'Desktop alert requires Chrome runtime';
      }
    });
  }

  if (btnTestVoice) {
    btnTestVoice.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'TEST_VOICE',
          options: {
            voiceName: selVoice ? selVoice.value : '',
            rate: rngRate ? parseFloat(rngRate.value) : 1.0,
            customText: (inpMorningMsg?.value.trim() || inpEveningMsg?.value.trim()) || ''
          }
        });
        if (testFeedback) {
          testFeedback.textContent = 'Speaking aloud...';
          setTimeout(() => { if (testFeedback) testFeedback.textContent = ''; }, 3500);
        }
      } else {
        if (testFeedback) testFeedback.textContent = 'Chrome runtime required';
      }
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      morningPicker?.updateHidden();
      eveningPicker?.updateHidden();
      const updated = {
        enabled: chkEnabled.checked,
        morningTime: inpMorning.value || '09:30',
        eveningTime: inpEvening.value || '17:30',
        weekdaysOnly: chkWeekdays ? chkWeekdays.checked : true,
        voiceEnabled: chkVoice ? chkVoice.checked : true,
        voiceName: selVoice ? selVoice.value : '',
        voiceRate: rngRate ? parseFloat(rngRate.value) : 1.0,
        morningMessage: inpMorningMsg ? inpMorningMsg.value.trim() : '',
        eveningMessage: inpEveningMsg ? inpEveningMsg.value.trim() : ''
      };

      if (typeof DailyLogStorage !== 'undefined' && DailyLogStorage.saveReminderSettings) {
        await DailyLogStorage.saveReminderSettings(updated);
      }
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await new Promise(r => chrome.storage.local.set({ reminder_settings: updated }, r));
        if (chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'UPDATE_REMINDERS' });
        }
      }
      try {
        localStorage.setItem('dailylog_reminder_settings', JSON.stringify(updated));
      } catch (e) {}

      settings = updated;
      updateFormState(settings);
      closeModal();
      showToast('Reminder preferences saved!', 'success');
    });
  }
}

/* ========================================================
   QUICK FEATURE GUIDE IN-POPUP MODAL
   ======================================================== */

function initQuickGuideModal() {
  const btnHelp = document.getElementById("btnHelpDoc");
  const modal = document.getElementById("quickGuideModalOverlay");
  const btnCloseX = document.getElementById("btnCloseQuickGuideX");

  if (!modal) return;

  const openGuide = (e) => {
    if (e) e.preventDefault();
    modal.style.display = "flex";
  };

  const closeGuide = () => {
    modal.style.display = "none";
  };

  if (btnHelp) btnHelp.addEventListener("click", openGuide);
  if (btnCloseX) btnCloseX.addEventListener("click", closeGuide);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeGuide();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") {
      closeGuide();
    }
  });
}