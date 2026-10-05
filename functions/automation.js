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
  const fullFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: 'numeric', day: 'numeric',
    weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'
  });
  function israelParts(ts) {
    return Object.fromEntries(fullFormatter.formatToParts(new Date(ts)).map(p => [p.type, p.value]));
  }
  function israelOffset(ts) {
    const p = israelParts(ts);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
  }
  // UTC timestamp of a given Israel wall-clock time (handles daylight saving).
  function israelTime(year, month, day, hour, minute) {
    const wall = Date.UTC(year, month - 1, day, hour, minute);
    let ts = wall - israelOffset(wall);
    ts = wall - israelOffset(ts);
    return ts;
  }
  const SCHEDULE = { Tue: ['close', 14, 0], Fri: ['reset', 23, 50] };
  // Scheduled events in (since, now], oldest first. Covers the last 8 days.
  function dueEvents(now, since = 0) {
    const events = [];
    for (let back = 0; back <= 8; back++) {
      const p = israelParts(now - back * 86400000);
      const entry = SCHEDULE[p.weekday];
      if (!entry) continue;
      const scheduledAt = israelTime(Number(p.year), Number(p.month), Number(p.day), entry[1], entry[2]);
      if (scheduledAt > since && scheduledAt <= now) events.push({ action: entry[0], scheduledAt });
    }
    return events.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }
  // Runs every event that came due since the last one, from whichever browser opens the site first.
  // io: { getSettings(), claim(action, scheduledAt) -> bool, clearSchedules(), release(action, scheduledAt) }
  async function runCatchUp(io, now) {
    const settings = (await io.getSettings()) || {};
    if (settings.weeklyAutomationEnabled !== true) return;
    const since = Math.max(Number(settings.weeklyAutomationLastEventAt || 0), Number(settings.weeklyAutomationEnabledAt || 0));
    for (const event of dueEvents(now, since)) {
      if (!(await io.claim(event.action, event.scheduledAt))) continue;
      if (event.action !== 'reset') continue;
      try { await io.clearSchedules(); }
      catch (err) { await io.release(event.action, event.scheduledAt); throw err; }
    }
  }
  const api = { isSubmissionWindowClosed, applyAutomationEvent, dueEvents, runCatchUp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SidorAutomation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
