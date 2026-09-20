/**
 * DailyLog Dashboard Controller
 */
document.addEventListener('DOMContentLoaded', async () => {
  await DailyLogStorage.initDemoIfEmpty();

  let currentDateKey = DailyLogStorage.getTodayKey();
  let currentDayLog = null;
  let allLogsCache = await DailyLogStorage.getAllLogs();
  let settings = await DailyLogStorage.getSettings();

  // Calendar State
  const today = new Date();
  let calMonth = today.getMonth();
  let calYear = today.getFullYear();

  applyTheme(settings.theme || 'dark');

  // DOM Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const toastContainer = document.getElementById('toastContainer');

  // Journal DOM Elements
  const journalDisplayDate = document.getElementById('journalDisplayDate');
  const journalDateTag = document.getElementById('journalDateTag');
  const journalFilenameDisplay = document.getElementById('journalFilenameDisplay');
  const journalProgressText = document.getElementById('journalProgressText');
  const journalProgressPct = document.getElementById('journalProgressPct');
  const journalProgressFill = document.getElementById('journalProgressFill');

  const journalSectionSelect = document.getElementById('journalSectionSelect');
  const journalPrioritySelect = document.getElementById('journalPrioritySelect');
  const journalTaskInput = document.getElementById('journalTaskInput');
  const btnJournalAddTask = document.getElementById('btnJournalAddTask');

  const journalSectionsContainer = document.getElementById('journalSectionsContainer');
  const sectionInputRow = document.getElementById('sectionInputRow');
  const dashboardNewSecInput = document.getElementById('dashboardNewSecInput');
  const btnDashboardShowNewSec = document.getElementById('btnDashboardShowNewSec');
  const btnDashboardSaveSec = document.getElementById('btnDashboardSaveSec');
  const btnDashboardCancelSec = document.getElementById('btnDashboardCancelSec');

  const journalNotesTextarea = document.getElementById('journalNotesTextarea');
  const journalNotesSavedStatus = document.getElementById('journalNotesSavedStatus');

  const btnDownloadTxt = document.getElementById('btnDownloadTxt');
  const btnCopyJournalTxt = document.getElementById('btnCopyJournalTxt');
  const btnCopyJournalMd = document.getElementById('btnCopyJournalMd');

  // Calendar DOM Elements
  const calendarMonthYear = document.getElementById('calendarMonthYear');
  const calendarGridDays = document.getElementById('calendarGridDays');
  const btnCalPrev = document.getElementById('btnCalPrev');
  const btnCalNext = document.getElementById('btnCalNext');
  const btnJumpToToday = document.getElementById('btnJumpToToday');

  // Stats DOM Elements
  const statTotalDays = document.getElementById('statTotalDays');
  const statTotalTasks = document.getElementById('statTotalTasks');
  const statCompletedRate = document.getElementById('statCompletedRate');

  // Search DOM Elements
  const historySearchInput = document.getElementById('historySearchInput');
  const searchResultsContainer = document.getElementById('searchResultsContainer');

  // Standup DOM Elements
  const standupDateSelect = document.getElementById('standupDateSelect');
  const btnRegenerateStandup = document.getElementById('btnRegenerateStandup');
  const btnCopyStandupText = document.getElementById('btnCopyStandupText');
  const standupPreviewArea = document.getElementById('standupPreviewArea');

  // Export DOM Elements
  const btnExportTodayTxt = document.getElementById('btnExportTodayTxt');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnExportMasterMd = document.getElementById('btnExportMasterMd');
  const btnTriggerImport = document.getElementById('btnTriggerImport');
  const importJsonFileInput = document.getElementById('importJsonFileInput');

  // Settings DOM Elements
  const settingDefaultSection = document.getElementById('settingDefaultSection');
  const settingThemeSelect = document.getElementById('settingThemeSelect');
  const settingCarryOver = document.getElementById('settingCarryOver');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const btnToggleTheme = document.getElementById('btnToggleTheme');
  const themeBtnText = document.getElementById('themeBtnText');

  let notesDebounce = null;

  // Tab Navigation Handling
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      navItems.forEach(n => n.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab)?.classList.add('active');

      if (targetTab === 'tab-standup') {
        generateStandupView();
      }
    });
  });

  // Load Day Journal
  async function loadJournal(dateKey) {
    currentDateKey = dateKey;
    allLogsCache = await DailyLogStorage.getAllLogs();
    currentDayLog = await DailyLogStorage.getDayLog(dateKey);

    const isToday = dateKey === DailyLogStorage.getTodayKey();
    journalDisplayDate.textContent = DailyLogStorage.formatDisplayDate(dateKey);
    journalDateTag.textContent = isToday ? 'Today' : 'Archived';
    journalDateTag.className = isToday ? 'badge badge-pending' : 'badge badge-progress';
    journalFilenameDisplay.textContent = `Filename: ${DailyLogStorage.formatDateFilename(dateKey)}`;

    journalNotesTextarea.value = currentDayLog.notes || '';
    journalNotesSavedStatus.textContent = 'Saved';

    renderSectionDropdown();
    renderSections();
    updateProgress();
    renderCalendar();
    updateStats();
  }

  function renderSectionDropdown() {
    journalSectionSelect.innerHTML = '';
    if (!currentDayLog.sections || currentDayLog.sections.length === 0) {
      const opt = document.createElement('option');
      opt.value = 'default';
      opt.textContent = '1. General Tasks';
      journalSectionSelect.appendChild(opt);
      return;
    }
    currentDayLog.sections.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.id;
      opt.textContent = sec.title;
      journalSectionSelect.appendChild(opt);
    });
  }

  function renderSections() {
    journalSectionsContainer.innerHTML = '';

    if (!currentDayLog.sections || currentDayLog.sections.length === 0) {
      journalSectionsContainer.innerHTML = `
        <div class="empty-state">
          <p>No project sections for this day yet.</p>
        </div>
      `;
      return;
    }

    currentDayLog.sections.forEach(sec => {
      const card = document.createElement('div');
      card.className = 'section-box';
      card.dataset.sectionId = sec.id;

      const completedInSec = (sec.tasks || []).filter(t => t.status === 'completed').length;
      const totalInSec = (sec.tasks || []).length;

      card.innerHTML = `
        <div class="sec-title-row">
          <div class="sec-title-left">
            <h3 class="sec-title-text" title="Click to rename">${escapeHtml(sec.title)}</h3>
            <span class="badge badge-pending">${completedInSec} / ${totalInSec}</span>
          </div>
          <div class="sec-title-actions">
            <button class="btn-icon btn-sm btn-delete-section" title="Delete section">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="sec-tasks-list" id="dashTasks_${sec.id}" style="display:flex; flex-direction:column; gap:6px;"></div>
      `;

      // Inline rename section
      const titleEl = card.querySelector('.sec-title-text');
      titleEl.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'input-text';
        input.value = sec.title;
        titleEl.replaceWith(input);
        input.focus();
        const saveRename = async () => {
          const val = input.value.trim();
          if (val) {
            currentDayLog = await DailyLogStorage.updateSectionTitle(currentDateKey, sec.id, val);
          }
          renderSectionDropdown();
          renderSections();
        };
        input.addEventListener('blur', saveRename);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') saveRename();
          if (e.key === 'Escape') renderSections();
        });
      });

      // Delete Section
      card.querySelector('.btn-delete-section').addEventListener('click', async () => {
        if (confirm(`Delete section "${sec.title}"?`)) {
          currentDayLog = await DailyLogStorage.deleteSection(currentDateKey, sec.id);
          renderSectionDropdown();
          renderSections();
          updateProgress();
          updateStats();
          showToast('Section deleted', 'info');
        }
      });

      const tasksList = card.querySelector(`#dashTasks_${sec.id}`);

      if (!sec.tasks || sec.tasks.length === 0) {
        const empty = document.createElement('div');
        empty.style.color = 'var(--text-muted)';
        empty.style.fontSize = '12px';
        empty.textContent = '- No tasks entered yet';
        tasksList.appendChild(empty);
      } else {
        sec.tasks.forEach(task => {
          const row = document.createElement('div');
          row.className = `task-row ${task.status === 'completed' ? 'completed' : ''}`;

          let priorityBadge = '';
          if (task.priority === 'blocker') {
            priorityBadge = '<span class="badge badge-blocker">Blocker</span>';
          } else if (task.priority === 'high') {
            priorityBadge = '<span class="badge badge-high">High</span>';
          }

          row.innerHTML = `
            <input type="checkbox" class="custom-checkbox task-check" ${task.status === 'completed' ? 'checked' : ''}>
            <span class="task-text" title="Click to edit">${escapeHtml(task.text)}</span>
            ${priorityBadge}
            <div class="task-actions">
              <button class="btn-icon btn-sm btn-del-task" title="Delete">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          `;

          row.querySelector('.task-check').addEventListener('change', async (e) => {
            const newStatus = e.target.checked ? 'completed' : 'pending';
            const res = await DailyLogStorage.updateTask(currentDateKey, task.id, { status: newStatus });
            if (res) {
              currentDayLog = res.dayLog;
              row.classList.toggle('completed', e.target.checked);
              updateProgress();
              updateStats();
            }
          });

          row.querySelector('.btn-del-task').addEventListener('click', async () => {
            currentDayLog = await DailyLogStorage.deleteTask(currentDateKey, task.id);
            renderSections();
            updateProgress();
            updateStats();
          });

          const textSpan = row.querySelector('.task-text');
          textSpan.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'input-text';
            input.value = task.text;
            textSpan.replaceWith(input);
            input.focus();
            const saveTask = async () => {
              const val = input.value.trim();
              if (val && val !== task.text) {
                const res = await DailyLogStorage.updateTask(currentDateKey, task.id, { text: val });
                if (res) currentDayLog = res.dayLog;
              }
              renderSections();
            };
            input.addEventListener('blur', saveTask);
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') saveTask();
              if (e.key === 'Escape') renderSections();
            });
          });

          tasksList.appendChild(row);
        });
      }

      journalSectionsContainer.appendChild(card);
    });
  }

  function updateProgress() {
    let total = 0;
    let completed = 0;
    if (currentDayLog && currentDayLog.sections) {
      for (const s of currentDayLog.sections) {
        for (const t of (s.tasks || [])) {
          total++;
          if (t.status === 'completed') completed++;
        }
      }
    }
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
    journalProgressText.textContent = `${completed} of ${total} tasks completed`;
    journalProgressPct.textContent = `${pct}%`;
    journalProgressFill.style.width = `${pct}%`;
  }

  // Add Task
  async function handleAddTask() {
    const text = journalTaskInput.value.trim();
    if (!text) return;
    const secId = journalSectionSelect.value;
    const prio = journalPrioritySelect.value;
    const res = await DailyLogStorage.addTask(currentDateKey, secId, text, prio);
    currentDayLog = res.dayLog;
    journalTaskInput.value = '';
    renderSectionDropdown();
    journalSectionSelect.value = secId;
    renderSections();
    updateProgress();
    updateStats();
    showToast('Task added to journal', 'success');
  }

  btnJournalAddTask.addEventListener('click', handleAddTask);
  journalTaskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddTask();
  });

  // Section Add
  btnDashboardShowNewSec.addEventListener('click', () => {
    btnDashboardShowNewSec.classList.add('hidden');
    sectionInputRow.classList.remove('hidden');
    dashboardNewSecInput.value = '';
    dashboardNewSecInput.focus();
  });

  btnDashboardCancelSec.addEventListener('click', () => {
    btnDashboardShowNewSec.classList.remove('hidden');
    sectionInputRow.classList.add('hidden');
  });

  btnDashboardSaveSec.addEventListener('click', async () => {
    const title = dashboardNewSecInput.value.trim();
    if (!title) return;
    const res = await DailyLogStorage.addSection(currentDateKey, title);
    currentDayLog = res.dayLog;
    btnDashboardShowNewSec.classList.remove('hidden');
    sectionInputRow.classList.add('hidden');
    renderSectionDropdown();
    journalSectionSelect.value = res.section.id;
    renderSections();
    showToast(`Created section "${res.section.title}"`, 'success');
  });

  dashboardNewSecInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnDashboardSaveSec.click();
    if (e.key === 'Escape') btnDashboardCancelSec.click();
  });

  // Notes Auto-save
  journalNotesTextarea.addEventListener('input', () => {
    journalNotesSavedStatus.textContent = 'Saving...';
    clearTimeout(notesDebounce);
    notesDebounce = setTimeout(async () => {
      await DailyLogStorage.saveNotes(currentDateKey, journalNotesTextarea.value);
      journalNotesSavedStatus.textContent = 'Saved';
    }, 500);
  });

  // Calendar Rendering
  function renderCalendar() {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    calendarMonthYear.textContent = `${months[calMonth]} ${calYear}`;
    calendarGridDays.innerHTML = '';

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayStr = DailyLogStorage.getTodayKey();

    // Empty slots before 1st of month
    for (let i = 0; i < firstDay; i++) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'cal-day empty';
      calendarGridDays.appendChild(emptyDiv);
    }

    // Days of month
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEl = document.createElement('div');
      dayEl.className = 'cal-day';
      dayEl.textContent = d;

      if (dayStr === currentDateKey) dayEl.classList.add('active-day');
      if (dayStr === todayStr) dayEl.classList.add('today-marker');
      if (allLogsCache[dayStr] && allLogsCache[dayStr].sections && allLogsCache[dayStr].sections.length > 0) {
        dayEl.classList.add('has-log');
      }

      dayEl.addEventListener('click', () => {
        loadJournal(dayStr);
      });

      calendarGridDays.appendChild(dayEl);
    }
  }

  btnCalPrev.addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) {
      calMonth = 11;
      calYear--;
    }
    renderCalendar();
  });

  btnCalNext.addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) {
      calMonth = 0;
      calYear++;
    }
    renderCalendar();
  });

  btnJumpToToday.addEventListener('click', () => {
    const now = new Date();
    calMonth = now.getMonth();
    calYear = now.getFullYear();
    loadJournal(DailyLogStorage.getTodayKey());
  });

  // Stats
  function updateStats() {
    let daysCount = 0;
    let totalTasks = 0;
    let completedTasks = 0;

    for (const [key, log] of Object.entries(allLogsCache)) {
      if (log && log.sections) {
        let hasTasksInDay = false;
        for (const s of log.sections) {
          for (const t of (s.tasks || [])) {
            hasTasksInDay = true;
            totalTasks++;
            if (t.status === 'completed') completedTasks++;
          }
        }
        if (hasTasksInDay) daysCount++;
      }
    }

    statTotalDays.textContent = daysCount;
    statTotalTasks.textContent = totalTasks;
    const rate = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
    statCompletedRate.textContent = `${rate}%`;
  }

  // Search History
  historySearchInput.addEventListener('input', async () => {
    const q = historySearchInput.value.trim();
    if (!q) {
      searchResultsContainer.innerHTML = '<div class="empty-state"><p>Type in the search box to find past tasks.</p></div>';
      return;
    }

    const matches = await DailyLogStorage.searchLogs(q);
    if (matches.length === 0) {
      searchResultsContainer.innerHTML = `<div class="empty-state"><p>No tasks matched "<strong>${escapeHtml(q)}</strong>"</p></div>`;
      return;
    }

    searchResultsContainer.innerHTML = '';
    matches.forEach(item => {
      const card = document.createElement('div');
      card.className = 'search-result-card';
      
      let tasksListHtml = '';
      item.matchingTasks.forEach(mt => {
        const mark = mt.task.status === 'completed' ? '✓' : '○';
        tasksListHtml += `<div style="font-size:12.5px; color:var(--text-secondary); margin-left:8px;">${mark} <strong>${escapeHtml(mt.section)}</strong>: ${escapeHtml(mt.task.text)}</div>`;
      });

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="search-res-date">${item.displayDate}</span>
          <span class="badge badge-pending">${item.matchingTasks.length} match(es)</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${tasksListHtml}
        </div>
      `;

      card.addEventListener('click', () => {
        // Jump to journal tab for this day
        document.querySelector('.nav-item[data-tab="tab-journal"]').click();
        loadJournal(item.date);
      });

      searchResultsContainer.appendChild(card);
    });
  });

  // Standup Generator
  standupDateSelect.value = DailyLogStorage.getTodayKey();

  async function generateStandupView() {
    const refDate = standupDateSelect.value || DailyLogStorage.getTodayKey();
    const todayLog = await DailyLogStorage.getDayLog(refDate);

    // Calculate previous date
    const d = new Date(refDate);
    d.setDate(d.getDate() - 1);
    const prevKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const prevLog = await DailyLogStorage.getDayLog(prevKey);

    const standupText = DailyLogFormatters.toStandup(todayLog, prevLog);
    standupPreviewArea.value = standupText;
  }

  btnRegenerateStandup.addEventListener('click', generateStandupView);
  btnCopyStandupText.addEventListener('click', async () => {
    const success = await DailyLogFormatters.copyToClipboard(standupPreviewArea.value);
    if (success) showToast('Standup update copied to clipboard!', 'success');
  });

  // Copy Exporters in Journal
  btnCopyJournalTxt.addEventListener('click', async () => {
    const text = DailyLogFormatters.toPlainText(currentDayLog);
    const success = await DailyLogFormatters.copyToClipboard(text);
    if (success) showToast('Copied daily .TXT log to clipboard!', 'success');
  });

  btnCopyJournalMd.addEventListener('click', async () => {
    const md = DailyLogFormatters.toMarkdown(currentDayLog, DailyLogStorage.formatDisplayDate(currentDateKey));
    const success = await DailyLogFormatters.copyToClipboard(md);
    if (success) showToast('Copied Markdown to clipboard!', 'success');
  });

  // Download File Helper
  function triggerFileDownload(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  btnDownloadTxt.addEventListener('click', () => {
    const filename = DailyLogStorage.formatDateFilename(currentDateKey);
    const content = DailyLogFormatters.toPlainText(currentDayLog);
    triggerFileDownload(filename, content, 'text/plain;charset=utf-8');
    showToast(`Downloaded ${filename}`, 'success');
  });

  btnExportTodayTxt.addEventListener('click', () => {
    const filename = DailyLogStorage.formatDateFilename(DailyLogStorage.getTodayKey());
    const content = DailyLogFormatters.toPlainText(allLogsCache[DailyLogStorage.getTodayKey()]);
    triggerFileDownload(filename, content, 'text/plain;charset=utf-8');
    showToast(`Downloaded ${filename}`, 'success');
  });

  btnExportJson.addEventListener('click', () => {
    const data = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      logs: allLogsCache,
      settings: settings
    };
    triggerFileDownload(`DailyLog-Backup-${DailyLogStorage.getTodayKey()}.json`, JSON.stringify(data, null, 2), 'application/json');
    showToast('JSON backup downloaded', 'success');
  });

  btnExportMasterMd.addEventListener('click', () => {
    let masterMd = "# 📚 Master Work Log & Archive\n\n";
    const sortedDates = Object.keys(allLogsCache).sort().reverse();
    for (const d of sortedDates) {
      masterMd += DailyLogFormatters.toMarkdown(allLogsCache[d], DailyLogStorage.formatDisplayDate(d)) + "\n---\n\n";
    }
    triggerFileDownload(`Master-WorkLog-${DailyLogStorage.getTodayKey()}.md`, masterMd, 'text/markdown;charset=utf-8');
    showToast('Master Markdown document downloaded', 'success');
  });

  // Import JSON Backup
  btnTriggerImport.addEventListener('click', () => {
    importJsonFileInput.click();
  });

  importJsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed && parsed.logs) {
          const merged = { ...allLogsCache, ...parsed.logs };
          await DailyLogStorage.set({ logs: merged });
          if (parsed.settings) {
            await DailyLogStorage.saveSettings(parsed.settings);
          }
          await loadJournal(currentDateKey);
          showToast('Backup restored successfully!', 'success');
        } else {
          showToast('Invalid backup file format', 'error');
        }
      } catch (err) {
        showToast('Failed to parse JSON file', 'error');
      }
    };
    reader.readAsText(file);
  });

  // Settings
  settingDefaultSection.value = settings.defaultSection || 'PMS - Development & Tasks';
  settingThemeSelect.value = settings.theme || 'dark';
  settingCarryOver.checked = !!settings.autoCarryOver;

  btnSaveSettings.addEventListener('click', async () => {
    const updated = await DailyLogStorage.saveSettings({
      defaultSection: settingDefaultSection.value.trim(),
      theme: settingThemeSelect.value,
      autoCarryOver: settingCarryOver.checked
    });
    settings = updated;
    applyTheme(settings.theme);
    showToast('Settings saved successfully', 'success');
  });

  btnToggleTheme.addEventListener('click', async () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    settings = await DailyLogStorage.saveSettings({ theme: next });
    settingThemeSelect.value = next;
  });

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeBtnText) {
      themeBtnText.textContent = theme === 'dark' ? '🌙 Dark Theme' : '☀️ Light Theme';
    }
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <span>${escapeHtml(message)}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 2200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }

  // Initial Boot
  await loadJournal(currentDateKey);
});
