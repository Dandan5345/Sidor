(function (root) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  function isSubmissionWindowClosed(now = new Date()) {
    const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    return (day === 2 && minute >= 840) || day === 3 || day === 4 || (day === 5 && minute < 1430);
  }
  function applyAutomationEvent(current, action, scheduledAt) {
    if (!current || !Number.isFinite(scheduledAt)) return;
    const settings = current.settings || {};
    if (settings.weeklyAutomationEnabled !== true) return;
    if (Number(settings.weeklyAutomationLastEventAt || 0) >= scheduledAt) return;
    if (Number(settings.weeklyAutomationEnabledAt || 0) > scheduledAt) return;
    if (action !== 'close' && action !== 'reset') throw new Error('Unknown automation event');
    const next = { ...current, settings: { ...settings,
      weeklyAutomationEnabled: true,
      allowScheduleSubmission: action === 'close' ? 'לא' : 'כן',
      weeklyAutomationLastEventAt: scheduledAt,
      weeklyAutomationLastEvent: action
    } };
    if (action === 'reset') next.schedules = null;
    return next;
  }
  const api = { isSubmissionWindowClosed, applyAutomationEvent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SidorAutomation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
