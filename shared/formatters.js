/**
 * DailyLog Formatters
 * Converts task logs to Plain Text (matching daily journal format), Markdown, or Standup format.
 */
const DailyLogFormatters = {

  /**
   * Plain Text (Exact match to standard .txt daily logs)
   */
  toPlainText(dayLog, includeStatus = false) {
    if (!dayLog || !dayLog.sections || dayLog.sections.length === 0) {
      return "Today's Task:\n(No tasks recorded for today yet)\n";
    }

    let output = "Today's Task:\n";

    dayLog.sections.forEach((sec, idx) => {
      let title = sec.title.trim();
      if (!title.endsWith(':')) {
        title += ':';
      }
      output += `${title}\n`;

      if (sec.tasks && sec.tasks.length > 0) {
        sec.tasks.forEach(t => {
          let mark = '';
          if (includeStatus) {
            mark = t.status === 'completed' ? ' [x]' : ' [ ]';
          }
          output += `   - ${t.text}${mark}\n`;
        });
      } else {
        output += `   - (Pending tasks)\n`;
      }

      if (idx < dayLog.sections.length - 1) {
        output += "\n";
      }
    });

    if (dayLog.notes && dayLog.notes.trim()) {
      output += `\nNotes & Action Items:\n${dayLog.notes.trim()}\n`;
    }

    return output;
  },

  /**
   * Markdown (Ideal for Slack, GitHub PR descriptions, Jira, Teams)
   */
  toMarkdown(dayLog, dateDisplay) {
    if (!dayLog || !dayLog.sections || dayLog.sections.length === 0) {
      return `### 📋 Daily Task Log (${dateDisplay || 'Today'})\n\n*No tasks logged yet.*\n`;
    }

    let output = `### 📋 Daily Work Log — ${dateDisplay || dayLog.date}\n\n`;

    dayLog.sections.forEach(sec => {
      output += `#### ${sec.title}\n`;
      if (sec.tasks && sec.tasks.length > 0) {
        sec.tasks.forEach(t => {
          const checked = t.status === 'completed' ? 'x' : ' ';
          const priorityTag = t.priority === 'blocker' ? ' **[BLOCKER]**' : (t.priority === 'high' ? ' **[HIGH]**' : '');
          output += `- [${checked}] ${t.text}${priorityTag}\n`;
        });
      } else {
        output += `- [ ] (No tasks entered)\n`;
      }
      output += "\n";
    });

    if (dayLog.notes && dayLog.notes.trim()) {
      output += `> **Notes:** ${dayLog.notes.trim()}\n`;
    }

    return output;
  },

  /**
   * Daily Standup Formatter (Yesterday's accomplishments, Today's focus, Blockers)
   */
  toStandup(todayLog, yesterdayLog) {
    let output = `### 🚀 Daily Standup Update (${todayLog.date})\n\n`;

    // 1. What was completed yesterday or today
    const completedTasks = [];
    const sourceLog = yesterdayLog || todayLog;
    if (sourceLog && sourceLog.sections) {
      for (const sec of sourceLog.sections) {
        for (const t of (sec.tasks || [])) {
          if (t.status === 'completed') {
            completedTasks.push(`${sec.title.replace(/^\d+\.\s*/, '').replace(/:$/, '')}: ${t.text}`);
          }
        }
      }
    }

    output += "**✅ What I completed recently:**\n";
    if (completedTasks.length > 0) {
      completedTasks.forEach(item => output += `- ${item}\n`);
    } else {
      output += "- Progress on assigned backlog tasks and code reviews\n";
    }
    output += "\n";

    // 2. What I'm working on today
    const todayTasks = [];
    const blockers = [];
    if (todayLog && todayLog.sections) {
      for (const sec of todayLog.sections) {
        for (const t of (sec.tasks || [])) {
          if (t.status !== 'completed') {
            todayTasks.push(`${sec.title.replace(/^\d+\.\s*/, '').replace(/:$/, '')}: ${t.text}`);
          }
          if (t.priority === 'blocker' || t.status === 'blocker') {
            blockers.push(`${t.text}`);
          }
        }
      }
    }

    output += "**⏳ What I'm working on today:**\n";
    if (todayTasks.length > 0) {
      todayTasks.forEach(item => output += `- ${item}\n`);
    } else {
      output += "- Continuing planned sprint activities\n";
    }
    output += "\n";

    // 3. Blockers
    output += "**⚠️ Blockers / Impediments:**\n";
    if (blockers.length > 0) {
      blockers.forEach(b => output += `- ${b}\n`);
    } else {
      output += "- None\n";
    }

    return output;
  },

  /**
   * Copy string to clipboard with fallback
   */
  async copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('Navigator clipboard failed, using fallback:', err);
      }
    }

    // Textarea fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
};

if (typeof window !== 'undefined') {
  window.DailyLogFormatters = DailyLogFormatters;
}
