/**
 * DailyLog - Sidebar Controller
 * Synchronized with popup.js and dashboard.
 */

let tasks = [];
let currentFilterDate = getTodayKey();
let activeView = 'today';
let knownModules = new Set(['PMS', 'General Tasks']);
let collapsedModules = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  initUI();
  syncWithDiskTasks(currentFilterDate);
  initNotes();

  // Listen for storage changes from popup or dashboard
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.worklog_tasks) {
        tasks = changes.worklog_tasks.newValue || [];
        renderTasks();
      }
      if (area === 'local' && changes.worklog_theme) {
        applyTheme(changes.worklog_theme.newValue);
      }
    });
  }
});

async function loadState() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['worklog_tasks', 'worklog_theme'], (res) => {
        let loaded = (res.worklog_tasks && Array.isArray(res.worklog_tasks)) ? res.worklog_tasks : [];
        tasks = loaded.filter(t => !(t.id >= 1 && t.id <= 10) && !(t.id >= 101 && t.id <= 110));
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
    tasks = loaded.filter(t => !(t.id >= 1 && t.id <= 10) && !(t.id >= 101 && t.id <= 110));
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
        console.log('[DailyLog Sidebar] Auto-synced to local file: ' + res.path);
        const syncBtn = document.getElementById("btnSyncFolder");
        if (syncBtn) syncBtn.classList.add("sync-connected");
      }
    }).catch(err => console.warn('[DailyLog Sidebar] Local sync notice:', err));
  }
}

function initUI() {
  const dInp = document.getElementById("dateInput"); if (dInp) dInp.value = currentFilterDate;
  initCalendarPopover();

  const cmdDateInput = document.getElementById("dateInput");
  if (cmdDateInput) {
    cmdDateInput.addEventListener("click", () => {
      try {
        if (typeof cmdDateInput.showPicker === "function") cmdDateInput.showPicker();
      } catch (err) {}
    });
    cmdDateInput.addEventListener("change", (e) => {
      if (e.target.value) {
        currentFilterDate = e.target.value;
        if (datePicker) datePicker.value = currentFilterDate;
        activeView = 'today';
        document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.view === 'today'));
        updateDateDisplay();
        renderTasks();
        syncWithDiskTasks(currentFilterDate);
      }
    });
  }

  // Jump to Today button
  const btnToday = document.getElementById("btnJumpToday");
  if (btnToday) {
    btnToday.addEventListener("click", () => {
      currentFilterDate = getTodayKey();
      const dInp = document.getElementById("dateInput"); if (dInp) dInp.value = currentFilterDate;
      if (datePicker) datePicker.value = currentFilterDate;
      activeView = 'today';
      document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.view === 'today'));
      updateDateDisplay();
      renderTasks();
      syncWithDiskTasks(currentFilterDate);
    });
  }

  updateDateDisplay();

  // Prev / Next Day
  document.getElementById("btnPrevDay").addEventListener("click", () => shiftDate(-1));
  document.getElementById("btnNextDay").addEventListener("click", () => shiftDate(1));

  // View Segments
  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeView = btn.dataset.view;
      renderTasks();
    });
  });

  // Theme toggle
  
  // Local Folder Auto-Sync Button
  const btnSyncFolder = document.getElementById("btnSyncFolder");
  if (btnSyncFolder) {
    if (window.DailyLogLocalSync) {
      window.DailyLogLocalSync.isConnected().then(connected => {
        if (connected) {
          btnSyncFolder.classList.add("sync-connected");
          btnSyncFolder.title = "Local Sync Active (D:\\Personal\\Data) - Click to re-sync";
        } else {
          btnSyncFolder.classList.remove("sync-connected");
          btnSyncFolder.title = "Connect Local Folder (D:\\Personal\\Data)";
        }
      });
    }

    btnSyncFolder.addEventListener("click", async () => {
      console.log("[DailyLog] Sync button clicked in sidepanel");
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
        // Try direct picker in sidepanel; fallback to sync_setup.html if blocked
        try {
          showToast("Opening folder picker...");
          await window.DailyLogLocalSync.connectFolder();
          btnSyncFolder.classList.add("sync-connected");
          showToast("Connected to D:\\Personal\\Data!");
          await window.DailyLogLocalSync.syncTasksForDate(currentFilterDate, tasks);
        } catch (err) {
          console.warn("[DailyLog] Direct picker error:", err);
          if (err.name === 'AbortError') {
            showToast("Folder selection canceled");
            return;
          }
          if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.create({ url: chrome.runtime.getURL('sync_setup.html') });
          } else {
            window.open('../sync_setup.html', '_blank');
          }
        }
      }
    });
  }

  document.getElementById("btnThemeToggle").addEventListener("click", toggleTheme);

  // Open Full Dashboard
  const openDash = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('worklog.html') });
    } else {
      window.open('../worklog.html', '_blank');
    }
  };
  document.getElementById("btnOpenDashboard").addEventListener("click", openDash);
  document.getElementById("btnLaunchFull").addEventListener("click", openDash);

  // Add Task submit
  document.getElementById("btnSubmitTask").addEventListener("click", submitTask);
  document.getElementById("taskTextInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      submitTask();
    }
  });

  // Custom Dropdowns (Module & Status)
  initCustomDropdowns();

  // Dock Exporters
  document.getElementById("btnCopyStandup").addEventListener("click", copyStandupReport);
  document.getElementById("btnCopyTxt").addEventListener("click", copyDailyTxt);
  document.getElementById("btnDownloadTxt").addEventListener("click", downloadDailyTxt);

  // Reminders
  initReminderModal();

  renderTasks();
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

function initNotes() {
  const notesEl = document.getElementById("dailyNotesText");
  const saveIndicator = document.getElementById("notesSaveIndicator");
  const noteKey = "dailylog_scratchpad_" + currentFilterDate;

  // Load note
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([noteKey], (res) => {
      if (res[noteKey]) notesEl.value = res[noteKey];
    });
  } else {
    notesEl.value = localStorage.getItem(noteKey) || '';
  }

  let noteDebounce = null;
  notesEl.addEventListener("input", () => {
    saveIndicator.innerText = "Saving...";
    clearTimeout(noteDebounce);
    noteDebounce = setTimeout(() => {
      const val = notesEl.value;
      const key = "dailylog_scratchpad_" + currentFilterDate;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [key]: val });
      } else {
        localStorage.setItem(key, val);
      }
      saveIndicator.innerText = "Saved";
    }, 400);
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
      <span class="option-text">${escapeHtml(mod)}</span>
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

const repopulateModuleSelect = populateModuleDropdown;

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
  const btnAddMod = document.getElementById("btnAddNewModule");

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
      }
    });
  }

  if (btnAddMod) {
    btnAddMod.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllDropdowns();
      const newName = prompt("Enter new module / project name (e.g. Front Desk / Billing):");
      if (newName && newName.trim()) {
        const clean = newName.trim();
        setCustomSelectedModule(clean);
        closeAllDropdowns();
        showToast(`Target module set to "${clean}"`);
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

function submitTask() {
  const input = document.getElementById("taskTextInput");
  let text = input.value.trim();
  if (!text) return;

  // Handle module-only input like "PMS:" or "General Tasks:" or "[PMS]"
  const moduleOnlyMatch = text.match(/^\[([^\]]+)\]$/) || text.match(/^([A-Za-z0-9_\-\s]{2,25}):$/);
  if (moduleOnlyMatch) {
    const newMod = moduleOnlyMatch[1].trim();
    setCustomSelectedModule(newMod);
    input.value = "";
    showToast(`Target module set to "${newMod}"`);
    return;
  }

  const moduleEl = document.getElementById("moduleSelect");
  let moduleName = (moduleEl && moduleEl.value && moduleEl.value !== "+ New Module...") ? moduleEl.value : "PMS";

  // Smart module parsing if user types "[Module] Task" or "Module: Task"
  const bracketMatch = text.match(/^\[(.*?)\]\s*(.*)$/);
  const colonMatch = text.match(/^([A-Za-z0-9\s_-]{2,25}):\s+(.*)$/);
  if (bracketMatch) {
    moduleName = bracketMatch[1].trim();
    text = bracketMatch[2].trim();
    setCustomSelectedModule(moduleName);
  } else if (colonMatch) {
    moduleName = colonMatch[1].trim();
    text = colonMatch[2].trim();
    setCustomSelectedModule(moduleName);
  }

  const statusEl = document.getElementById("statusSelect");
  const status = (statusEl && statusEl.value) ? statusEl.value : "In Progress";

  const dateEl = document.getElementById("dateInput");
  const date = (dateEl && dateEl.value) ? dateEl.value : currentFilterDate;

  const newTask = {
    id: Date.now(),
    text,
    description: text,
    module: moduleName,
    name: moduleName,
    status,
    date
  };

  tasks.unshift(newTask);
  persistTasks();

  input.value = "";
  populateModuleDropdown(moduleName);

  showToast(`Task added to ${moduleName}`);
  renderTasks();
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
  const container = document.getElementById("tasksCanvas");
  container.innerHTML = "";

  let filtered = [];
  if (activeView === 'today') {
    filtered = tasks.filter(t => t.date === currentFilterDate);
  } else if (activeView === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = formatInputDate(weekAgo);
    filtered = tasks.filter(t => t.date >= weekAgoStr);
  } else {
    filtered = [...tasks];
  }

  // Update Progress banner
  const total = filtered.length;
  const completedCount = filtered.filter(t => t.status === "Completed").length;
  const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const sumEl = document.getElementById("progressSummary");
  const pctEl = document.getElementById("progressPercentage");
  const fillEl = document.getElementById("progressTrackFill");
  if (sumEl && pctEl && fillEl) {
    sumEl.innerText = `${completedCount} of ${total} tasks completed`;
    pctEl.innerText = `${percent}%`;
    fillEl.style.width = `${percent}%`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <p style="font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">No tasks recorded for this date.</p>
        <p style="font-size: 11.5px; color: var(--text-muted);">Type in the input above and press Enter to add a task.</p>
      </div>
    `;
    return;
  }

  // Group by module
  const groups = {};
  filtered.forEach(task => {
    const mod = task.module || task.name || "General Tasks";
    if (!groups[mod]) groups[mod] = [];
    groups[mod].push(task);
    knownModules.add(mod);
  });

  repopulateModuleSelect();

  Object.keys(groups).forEach(moduleName => {
    const groupCard = document.createElement("div");
    groupCard.className = "module-group";

    const isCollapsed = collapsedModules.has(moduleName);
    if (isCollapsed) groupCard.classList.add("collapsed");

    const header = document.createElement("div");
    header.className = "group-header";
    header.innerHTML = `
      <div class="group-title-box">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--brand-primary)">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="group-title">${escapeHtml(moduleName)}</span>
        <button class="group-rename-btn" title="Rename module (e.g. to PMS)" type="button">✎</button>
      </div>
      <div class="group-header-actions">
        <span class="group-badge">${groups[moduleName].length}</span>
        <button class="group-collapse-btn" title="${isCollapsed ? 'Maximize' : 'Minimize'}" type="button">
          <svg class="collapse-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
    `;

    const renameBtn = header.querySelector(".group-rename-btn");
    if (renameBtn) {
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const newMod = prompt(`Rename module "${moduleName}" to:`, moduleName);
        if (newMod && newMod.trim() && newMod.trim() !== moduleName) {
          const cleanMod = newMod.trim();
          tasks.forEach(t => {
            const m = t.module || t.name || 'General Tasks';
            if (m === moduleName) {
              t.name = cleanMod;
              t.module = cleanMod;
            }
          });
          knownModules.add(cleanMod);
          persistTasks();
          repopulateModuleSelect(cleanMod);
          renderTasks();
          showToast(`Module renamed to "${cleanMod}"`);
        }
      });
    }

    const taskList = document.createElement("div");
    taskList.className = "group-tasks-list";
    taskList.style.display = isCollapsed ? "none" : "flex";
    taskList.style.flexDirection = "column";
    taskList.style.gap = "6px";

    header.addEventListener("click", () => {
      if (collapsedModules.has(moduleName)) {
        collapsedModules.delete(moduleName);
      } else {
        collapsedModules.add(moduleName);
      }
      const nowCollapsed = collapsedModules.has(moduleName);
      groupCard.classList.toggle("collapsed", nowCollapsed);
      taskList.style.display = nowCollapsed ? "none" : "flex";
      const btn = header.querySelector(".group-collapse-btn");
      if (btn) btn.title = nowCollapsed ? "Maximize" : "Minimize";
    });

    groupCard.appendChild(header);

    groups[moduleName].forEach(task => {
      const row = document.createElement("div");
      row.className = `task-row ${task.status === "Completed" ? "completed" : ""}`;

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "task-check";
      check.checked = (task.status === "Completed");
      check.addEventListener("change", () => {
        task.status = check.checked ? "Completed" : "In Progress";
        persistTasks();
        renderTasks();
      });

      const body = document.createElement("div");
      body.className = "task-body";

      const textEl = document.createElement("span");
      textEl.className = "task-text";
      textEl.innerText = task.text || task.description || "";
      body.appendChild(textEl);

      const rightCol = document.createElement("div");
      rightCol.className = "task-right";

      if (activeView !== 'today' && task.date) {
        const dateBadge = document.createElement("span");
        dateBadge.className = "task-date-badge";
        dateBadge.innerText = task.date;
        rightCol.appendChild(dateBadge);
      }

      let statusClass = "progress";
      if (task.status === "Completed") statusClass = "completed";
      if (task.status === "Blocked") statusClass = "blocked";

      const statusPill = document.createElement("span");
      statusPill.className = `status-pill ${statusClass}`;
      statusPill.innerText = task.status;
      rightCol.appendChild(statusPill);

      const actions = document.createElement("div");
      actions.className = "task-actions";

      const btnEdit = document.createElement("button");
      btnEdit.className = "row-action-btn";
      btnEdit.title = "Edit task text";
      btnEdit.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      `;
      btnEdit.addEventListener("click", () => {
        startInlineEdit(task, row, textEl);
      });
      textEl.addEventListener("dblclick", () => {
        startInlineEdit(task, row, textEl);
      });

      const btnDelete = document.createElement("button");
      btnDelete.className = "row-action-btn delete";
      btnDelete.title = "Delete task";
      btnDelete.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      `;
      btnDelete.addEventListener("click", () => {
        tasks = tasks.filter(t => t.id !== task.id);
        persistTasks();
        renderTasks();
        showToast("Task removed");
      });

      actions.appendChild(btnEdit);
      actions.appendChild(btnDelete);
      rightCol.appendChild(actions);

      row.appendChild(check);
      row.appendChild(body);
      row.appendChild(rightCol);
      taskList.appendChild(row);
    });

    groupCard.appendChild(taskList);
    container.appendChild(groupCard);
  });
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
  initNotes();
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
  output += `**Completed Tasks:**\n`;
  const done = tasks.filter(t => t.status === "Completed" && t.date === currentFilterDate);
  if (done.length > 0) {
    done.forEach(t => output += `- [${t.module}] ${t.text}\n`);
  } else {
    output += `- None recorded yet\n`;
  }

  output += `\n**In Progress:**\n`;
  const inProg = tasks.filter(t => t.status === "In Progress" && t.date === currentFilterDate);
  if (inProg.length > 0) {
    inProg.forEach(t => output += `- [${t.module}] ${t.text}\n`);
  } else {
    output += `- None\n`;
  }

  const blocked = tasks.filter(t => t.status === "Blocked" && t.date === currentFilterDate);
  if (blocked.length > 0) {
    output += `\n**Blockers:**\n`;
    blocked.forEach(t => output += `- 🛑 [${t.module}] ${t.text}\n`);
  }

  navigator.clipboard.writeText(output).then(() => {
    showToast("Standup report copied to clipboard!");
  });
}

function copyDailyTxt() {
  const dayTasks = tasks.filter(t => t.date === currentFilterDate);
  if (dayTasks.length === 0) {
    showToast("No tasks for selected date");
    return;
  }

  const d = new Date(currentFilterDate);
  const dateFormatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  
  let txt = `Tasks Completed on ${dateFormatted}:\n\n`;
  const groups = {};
  dayTasks.forEach(t => {
    if (!groups[t.module]) groups[t.module] = [];
    groups[t.module].push(t);
  });

  let counter = 1;
  Object.keys(groups).forEach(m => {
    txt += `${counter}. ${m}\n`;
    groups[m].forEach(t => {
      const mark = t.status === "Completed" ? "[x]" : "[ ]";
      txt += `   ${mark} ${t.text}\n`;
    });
    txt += `\n`;
    counter++;
  });

  navigator.clipboard.writeText(txt).then(() => {
    showToast("Journal .TXT copied!");
  });
}

function downloadDailyTxt() {
  const dayTasks = tasks.filter(t => t.date === currentFilterDate);
  if (dayTasks.length === 0) {
    showToast("No tasks for selected date to download");
    return;
  }

  const d = new Date(currentFilterDate);
  const dateFormatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  
  let txt = `Tasks Completed on ${dateFormatted}:\n\n`;
  const groups = {};
  dayTasks.forEach(t => {
    if (!groups[t.module]) groups[t.module] = [];
    groups[t.module].push(t);
  });

  let counter = 1;
  Object.keys(groups).forEach(m => {
    txt += `${counter}. ${m}\n`;
    groups[m].forEach(t => {
      const mark = t.status === "Completed" ? "[x]" : "[ ]";
      txt += `   ${mark} ${t.text}\n`;
    });
    txt += `\n`;
    counter++;
  });

  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dateFormatted}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("File downloaded: " + a.download);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const target = current === "dark" ? "light" : "dark";
  applyTheme(target);
  localStorage.setItem("worklog_theme", target);
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ worklog_theme: target });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.innerHTML = theme === "dark" 
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' 
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }
}

function getTodayKey() {
  const d = new Date();
  return formatInputDate(d);
}

function formatInputDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showToast(msg) {
  const portal = document.getElementById("toastContainer");
  if (!portal) return;
  const toast = document.createElement("div");
  toast.className = "toast-box";
  toast.innerText = msg;
  portal.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.2s ease";
    setTimeout(() => toast.remove(), 200);
  }, 2200);
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
      if (dayResult && dayResult.tasks && dayResult.tasks.length > 0) {
        let dayMerged = 0;
        dayResult.tasks.forEach(dt => {
          const match = tasks.find(t =>
            t.date === dt.date &&
            (t.description || t.text || '').trim().toLowerCase() === (dt.description || dt.text || '').trim().toLowerCase()
          );
          if (!match) {
            tasks.push(dt);
            dayMerged++;
          }
        });

        if (dayMerged > 0) {
          localStorage.setItem("worklog_tasks", JSON.stringify(tasks));
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ worklog_tasks: tasks });
          }
          populateModuleDropdown();
          renderTasks();
          showToast('Loaded ' + dayMerged + ' tasks from ' + targetDate + ' journal');
        }
      }

      // Also load scratchpad notes if any
      if (dayResult && dayResult.notes) {
        const noteKey = "dailylog_scratchpad_" + targetDate;
        localStorage.setItem(noteKey, dayResult.notes);
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ [noteKey]: dayResult.notes });
        }
        const notesEl = document.getElementById("dailyNotesText");
        if (notesEl && targetDate === currentFilterDate && !notesEl.value.trim()) {
          notesEl.value = dayResult.notes;
        }
      }
    }

    // 2. Background month sync for Week / All views
    if (typeof window.DailyLogLocalSync.readAllTasksForMonth === 'function') {
      const diskTasks = await window.DailyLogLocalSync.readAllTasksForMonth(targetDate);
      if (diskTasks && diskTasks.length > 0) {
        let mergedCount = 0;
        diskTasks.forEach(dt => {
          const match = tasks.find(t =>
            t.date === dt.date &&
            (t.description || t.text || '').trim().toLowerCase() === (dt.description || dt.text || '').trim().toLowerCase()
          );
          if (!match) {
            tasks.push(dt);
            mergedCount++;
          }
        });

        if (mergedCount > 0) {
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

  if (!btnReminders || !modal) return;

  // Load existing reminder settings
  let settings = {
    enabled: true,
    morningTime: '09:30',
    eveningTime: '17:30',
    weekdaysOnly: true,
    voiceEnabled: true,
    voiceName: '',
    voiceRate: 1.0
  };

  if (typeof DailyLogStorage !== 'undefined' && DailyLogStorage.getReminderSettings) {
    settings = await DailyLogStorage.getReminderSettings();
  } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const res = await new Promise(r => chrome.storage.local.get(['reminder_settings'], r));
    if (res && res.reminder_settings) settings = res.reminder_settings;
  }

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

  function setup12HourPicker(hiddenId) {
    const hiddenInp = document.getElementById(hiddenId);
    const textInp = document.getElementById(hiddenId + 'Val');
    const ampmWrap = document.getElementById(hiddenId.replace('reminder', 'ampm'));
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
        if (h < 1) h = 12;
        if (m > 59) m = 59;
        textInp.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
      updateHidden();
    });

    return { setFrom24, updateHidden };
  }

  const morningPicker = setup12HourPicker('reminderMorningTime');
  const eveningPicker = setup12HourPicker('reminderEveningTime');

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
    if (typeof DailyLogStorage !== 'undefined' && DailyLogStorage.getReminderSettings) {
      settings = await DailyLogStorage.getReminderSettings();
    }
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
            rate: rngRate ? parseFloat(rngRate.value) : 1.0
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
        weekdaysOnly: chkWeekdays.checked,
        voiceEnabled: chkVoice ? chkVoice.checked : true,
        voiceName: selVoice ? selVoice.value : '',
        voiceRate: rngRate ? parseFloat(rngRate.value) : 1.0
      };

      if (typeof DailyLogStorage !== 'undefined' && DailyLogStorage.saveReminderSettings) {
        await DailyLogStorage.saveReminderSettings(updated);
      } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ reminder_settings: updated });
        if (chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'UPDATE_REMINDERS' });
        }
      }

      settings = updated;
      updateFormState(settings);
      closeModal();
      showToast('Reminder preferences saved!', 'success');
    });
  }
}