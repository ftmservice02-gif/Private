// Minimal iCalendar (.ics) reader for the Google Calendar "secret address in
// iCal format" feed — just enough for calendar.html's month grid: VEVENT
// summary + date span, EXDATE, and the common RRULE shapes (DAILY/WEEKLY
// [+BYDAY]/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL). Date math is done on
// plain YYYY-MM-DD strings via UTC so the server's timezone can't shift a day.

const DAY = 86400000;

function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

function unescapeText(v) {
  return String(v || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (s, n) => ymd(new Date(parseYmd(s).getTime() + n * DAY));

// DTSTART/DTEND value -> { date: "YYYY-MM-DD", allDay, midnight }. A trailing Z
// means UTC, so it's converted to the server's local wall-clock date; a TZID
// value is already wall-clock in the calendar's own zone, so its date part is
// used as-is.
function parseIcsDate(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value || "");
  if (!m) return null;
  if (m[4] === undefined) return { date: `${m[1]}-${m[2]}-${m[3]}`, allDay: true, midnight: false };
  if (m[7]) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, allDay: false, midnight: d.getHours() === 0 && d.getMinutes() === 0 };
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, allDay: false, midnight: m[4] === "00" && m[5] === "00" };
}

function parseIcs(text) {
  const events = [];
  let cur = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue; }
    if (line === "END:VEVENT") {
      if (cur && cur.start) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const name = line.slice(0, idx).split(";")[0].toUpperCase();
    const value = line.slice(idx + 1);
    if (name === "SUMMARY") cur.summary = unescapeText(value);
    else if (name === "DTSTART") cur.start = parseIcsDate(value);
    else if (name === "DTEND") cur.end = parseIcsDate(value);
    else if (name === "RRULE") cur.rrule = value;
    else if (name === "EXDATE") value.split(",").forEach((v) => { const d = parseIcsDate(v); if (d) cur.exdates.push(d.date); });
    else if (name === "STATUS") cur.status = value.toUpperCase();
    else if (name === "RECURRENCE-ID") cur.isOverride = true;
  }
  return events.filter((e) => e.status !== "CANCELLED");
}

const BYDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRrule(rule) {
  const o = {};
  rule.split(";").forEach((p) => { const [k, v] = p.split("="); o[k] = v; });
  const until = o.UNTIL ? parseIcsDate(o.UNTIL) : null;
  return {
    freq: o.FREQ, interval: Math.max(1, parseInt(o.INTERVAL, 10) || 1),
    count: o.COUNT ? parseInt(o.COUNT, 10) : null, until: until ? until.date : null,
    byday: o.BYDAY ? o.BYDAY.split(",").map((d) => BYDAY[d.slice(-2)]).filter((n) => n !== undefined) : null,
  };
}

// Every occurrence's start date (YYYY-MM-DD), stopping once past `to`.
function occurrenceStarts(ev, to) {
  const first = ev.start.date;
  if (!ev.rrule) return [first];
  const r = parseRrule(ev.rrule);
  const out = [];
  const limit = r.until && r.until < to ? r.until : to;
  const push = (d) => { if (d >= first && d <= limit && (r.count === null || out.length < r.count)) out.push(d); };
  let guard = 0;
  if (r.freq === "DAILY") {
    for (let d = first; d <= limit && guard++ < 5000; d = addDays(d, r.interval)) push(d);
  } else if (r.freq === "WEEKLY") {
    const days = r.byday && r.byday.length ? r.byday : [parseYmd(first).getUTCDay()];
    const weekStart = addDays(first, -parseYmd(first).getUTCDay());
    for (let w = weekStart; w <= limit && guard++ < 2000; w = addDays(w, 7 * r.interval)) {
      days.slice().sort().forEach((dow) => push(addDays(w, dow)));
    }
  } else if (r.freq === "MONTHLY" || r.freq === "YEARLY") {
    const base = parseYmd(first);
    const step = r.freq === "MONTHLY" ? r.interval : 12 * r.interval;
    for (let i = 0; guard++ < 1200; i++) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i * step, base.getUTCDate()));
      if (d.getUTCDate() !== base.getUTCDate()) continue; // e.g. the 31st in a 30-day month
      const s = ymd(d);
      if (s > limit) break;
      push(s);
    }
  } else {
    return [first];
  }
  return out;
}

// Events (with recurrences expanded) that touch [from, to] -> [{title, startDate, endDate}].
function expandEvents(events, from, to) {
  const out = [];
  for (const ev of events) {
    let spanDays = 0;
    if (ev.end) {
      let endDate = ev.end.date;
      if (ev.end.allDay || ev.end.midnight) endDate = addDays(endDate, -1); // DTEND is exclusive
      spanDays = Math.max(0, Math.round((parseYmd(endDate) - parseYmd(ev.start.date)) / DAY));
    }
    const skip = new Set(ev.exdates);
    for (const s of occurrenceStarts(ev, to)) {
      if (skip.has(s)) continue;
      const e = addDays(s, spanDays);
      if (e < from || s > to) continue;
      out.push({ title: ev.summary || "(no title)", startDate: s, endDate: e, allDay: ev.start.allDay });
      if (out.length >= 3000) return out;
    }
  }
  return out;
}

module.exports = { parseIcs, expandEvents };
