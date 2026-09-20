
function init() {
  const btn = document.getElementById('btnPickFolder');
  const statusBox = document.getElementById('statusBox');

  if (window.DailyLogLocalSync) {
    window.DailyLogLocalSync.isConnected().then(isConn => {
      if (isConn) {
        statusBox.className = 'status-box status-success';
        statusBox.style.display = 'block';
        statusBox.innerHTML = '<strong>Already Connected!</strong><br>DailyLog is currently linked to your local journal folder. You can re-select if you wish to change it.';
      }
    }).catch(e => console.warn('Connection check notice:', e));
  }

  if (btn) {
    btn.addEventListener('click', async () => {
      console.log('[DailyLog Setup] Button clicked');
      try {
        btn.disabled = true;
        btn.innerText = 'Opening Folder Picker in Windows...';

        const handle = await window.DailyLogLocalSync.connectFolder();

        statusBox.className = 'status-box status-success';
        statusBox.style.display = 'block';
        statusBox.innerHTML = '<strong>Folder selected! Scanning existing date files...</strong>';

        // Auto-import all tasks from local folder into extension storage
        let importedCount = 0;
        try {
          const today = new Date().toISOString().split('T')[0];
          const allDiskTasks = await window.DailyLogLocalSync.readAllTasksForMonth(today);

          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            await new Promise((resolve) => {
              chrome.storage.local.get(['worklog_tasks'], (res) => {
                let existing = res.worklog_tasks || [];
                allDiskTasks.forEach(dt => {
                  const match = existing.find(t =>
                    t.date === dt.date &&
                    (t.description || t.text || '').trim().toLowerCase() === (dt.description || dt.text || '').trim().toLowerCase()
                  );
                  if (!match) {
                    existing.push(dt);
                    importedCount++;
                  }
                });
                chrome.storage.local.set({ worklog_tasks: existing, local_sync_active: true }, resolve);
                localStorage.setItem('worklog_tasks', JSON.stringify(existing));
              });
            });
          }
        } catch (importErr) {
          console.warn('[DailyLog Setup] Month import notice:', importErr);
        }

        statusBox.className = 'status-box status-success';
        statusBox.style.display = 'block';
        statusBox.innerHTML = '<strong>Successfully Connected!</strong><br>' +
          'Linked to folder: <code>' + (handle.name || 'Data') + '</code>.<br>' +
          (importedCount > 0 ? 'Imported <b>' + importedCount + '</b> tasks from your existing journal files!<br>' : '') +
          'Auto-sync is now active. You may close this tab.';
        btn.style.display = 'none';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn-connect';
        closeBtn.style.marginTop = '16px';
        closeBtn.innerText = 'Close Setup Tab';
        closeBtn.onclick = () => window.close();
        statusBox.appendChild(closeBtn);

        setTimeout(() => {
          window.close();
        }, 3000);
      } catch (err) {
        console.error('[DailyLog Setup] Error selecting folder:', err);
        btn.disabled = false;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Select D:\\Personal\\Data Folder';

        statusBox.className = 'status-box status-error';
        statusBox.style.display = 'block';
        if (err.name === 'AbortError') {
          statusBox.innerHTML = 'Folder selection was canceled. Click the button above to try again.';
        } else {
          statusBox.innerHTML = '<strong>Connection Error:</strong> ' + err.message;
        }
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
