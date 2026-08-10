// ---------- axis / tier configuration ----------
const AXES = {
  depressive: {
    key: "depressive",
    label: "Depressive",
    lineColor: "#5B7C99",
    tierOrder: ["minor", "medium", "severe"],
    tierMeta: {
      minor:  { label: "Minor",  weight: 1, color: "#7C9070", soft: "#EAEFE5" },
      medium: { label: "Medium", weight: 2, color: "#B98A2E", soft: "#F3E9D2" },
      severe: { label: "Severe", weight: 3, color: "#9C4A3A", soft: "#F1DFDA" },
    },
  },
  hypomanic: {
    key: "hypomanic",
    label: "Hypomanic",
    lineColor: "#B85A82",
    tierOrder: ["emerging", "peak"],
    tierMeta: {
      emerging: { label: "Emerging", weight: 1, color: "#C79A56", soft: "#F3E9D2" },
      peak:     { label: "Peak",     weight: 2, color: "#9C4A3A", soft: "#F1DFDA" },
    },
  },
};

const SPIRAL_ITEM_ID = "core-spiral";
const SPIRAL_DECAY = [50, 40, 30, 20, 10]; // percent of the spiral day's own score, added as a decaying boost for the next 5 days

const DEFAULT_TIERS = {
  depressive: {
    minor: ["Day felt like obligation", "Downplayed own desires", "Didn't seek recreation", "Evening fragility"],
    medium: ["Sleep schedule drifting", "Diminished appetite", "Skipping routines (or considered it)", "Avoided messages", "Brain fog", "Falling short of own standards"],
    severe: ["Watching clock, dreading sleep", "Emotional spiral", "Zoning out mid-task", "Thoughts of SH"],
  },
  hypomanic: {
    emerging: [
      "Proud of sleeping well",
      "Texted old friends randomly",
      "Took on extra work",
      "Creative urgency",
      "Envisioned others' adoration",
      "Overcommitment to long-term ideas",
      "Excessive affection",
    ],
    peak: [
      "Overwhelming euphoria",
      "Racing, intense thoughts",
      "Grandiosity (God's gift/famous/everyone looks up to me)",
      "Hyperfocused, irritated if interrupted",
    ],
  },
};

const WEATHER_OPTIONS = [
  { id: "sun", label: "\u2600\ufe0f Sunny", bandColor: "#E3C168" },
  { id: "cloud", label: "\u26c5 Partly cloudy", bandColor: "#C9D3D8" },
  { id: "overcast", label: "\u2601\ufe0f Overcast", bandColor: "#A7B0B6" },
  { id: "rain", label: "\ud83c\udf27\ufe0f Rain", bandColor: "#6E93B0" },
  { id: "storm", label: "\u26c8\ufe0f Storm", bandColor: "#4B5E76" },
  { id: "snow", label: "\u2744\ufe0f Snow", bandColor: "#D7E6EE" },
  { id: "fog", label: "\ud83c\udf2b\ufe0f Fog", bandColor: "#BEC7C9" },
  { id: "wind", label: "\ud83d\udca8 Windy", bandColor: "#8FBFB0" },
];

const TIERS_KEY = "tally:tiers";
const ENTRY_PREFIX = "tally:entry:";

// ---------- helpers ----------
function uid(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function todayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function shortDate(dt) {
  return `${dt.getMonth() + 1}/${dt.getDate()}/${String(dt.getFullYear()).slice(-2)}`;
}
function emptyChecks() {
  return { depressive: { minor: [], medium: [], severe: [] }, hypomanic: { emerging: [], peak: [] } };
}
function computeAxisScore(checksAxis, tierConfigAxis, axisDef) {
  let num = 0, den = 0;
  axisDef.tierOrder.forEach((t) => {
    const total = (tierConfigAxis[t] || []).length;
    if (total === 0) return;
    const checked = (checksAxis[t] || []).length;
    num += (checked / total) * axisDef.tierMeta[t].weight;
    den += axisDef.tierMeta[t].weight;
  });
  return den === 0 ? 0 : Math.round((num / den) * 100);
}
function hasAnyHypomanicChecks(checks) {
  return AXES.hypomanic.tierOrder.some((t) => (checks.hypomanic[t] || []).length > 0);
}

// find the most recent prior day (within the SPIRAL_DECAY window) that had the
// emotional-spiral item checked; returns { offset, anchorScore } or null.
// anchorScore is that spiral day's own score (from its own checkboxes), since
// the floor should taper down *from how bad that day actually was*, not a flat number.
function findMostRecentSpiral(dateKey) {
  const target = parseDateKey(dateKey);
  let best = null;
  Object.values(state.entries).forEach((e) => {
    if (e.date >= dateKey) return;
    const tierSet = e.criteriaSnapshot || state.tiers;
    const severeItems = (tierSet.depressive && tierSet.depressive.severe) || [];
    const spiralItem = severeItems.find((it) => it.id === SPIRAL_ITEM_ID);
    if (!spiralItem) return;
    if (!(e.checks.depressive.severe || []).includes(spiralItem.id)) return;
    const offsetDays = Math.round((target - parseDateKey(e.date)) / 86400000);
    if (offsetDays >= 1 && offsetDays <= SPIRAL_DECAY.length) {
      if (!best || offsetDays < best.offset) {
        const anchorScore = computeAxisScore(e.checks.depressive, tierSet.depressive, AXES.depressive);
        best = { offset: offsetDays, anchorScore };
      }
    }
  });
  return best;
}
function spiralBoostFor(dateKey) {
  const found = findMostRecentSpiral(dateKey);
  if (!found) return { offset: null, boostAmount: 0 };
  const pct = SPIRAL_DECAY[found.offset - 1] / 100;
  return { offset: found.offset, boostAmount: Math.round(found.anchorScore * pct) };
}
function depressiveScoreWithBoost(dateKey, checksDepressive, tierConfigDepressive) {
  const base = computeAxisScore(checksDepressive, tierConfigDepressive, AXES.depressive);
  const { offset, boostAmount } = spiralBoostFor(dateKey);
  return { score: Math.min(100, base + boostAmount), offset };
}
function depressiveScoreForEntry(entry) {
  const tierSet = entry.criteriaSnapshot || state.tiers;
  return depressiveScoreWithBoost(entry.date, entry.checks.depressive, tierSet.depressive).score;
}
const SCORE_BANDS = {
  depressive: [
    { max: 15, label: "clear", color: "#7C9070" },
    { max: 30, label: "mild", color: "#D4A72E" },
    { max: 50, label: "moderate", color: "#C2793E" },
    { max: 75, label: "heavy", color: "#AE5540" },
    { max: 100, label: "severe", color: "#6B2430" },
  ],
  hypomanic: [
    { max: 12, label: "clear", color: "#7C9070" },
    { max: 25, label: "mild", color: "#D4A72E" },
    { max: 45, label: "moderate", color: "#C2793E" },
    { max: 70, label: "heavy", color: "#AE5540" },
    { max: 100, label: "severe", color: "#6B2430" },
  ],
};
function scoreBand(axisKey, s) {
  const bands = SCORE_BANDS[axisKey] || SCORE_BANDS.depressive;
  for (const b of bands) { if (s <= b.max) return b; }
  return bands[bands.length - 1];
}
function scoreColor(axisKey, s) { return scoreBand(axisKey, s).color; }
function scoreLabel(axisKey, s) { return scoreBand(axisKey, s).label; }
function escapeHtml(s) { const div = document.createElement("div"); div.textContent = s; return div.innerHTML; }

// ---------- storage ----------
const HYPOMANIC_WORDING_MIGRATION = {
  "Sleeping well, feel proud of it": "Proud of sleeping well",
  "Reaching out to friends out of nowhere": "Texted old friends randomly",
  "Taking on more projects than usual": "Took on extra work",
  "Frantic urge to start a big project right now": "Creative urgency",
  "Imagining people being impressed by / adoring what I'm making": "Envisioned others' adoration",
  "Overcommitting to things I can't follow through on later": "Overcommitment to long-term ideas",
  "Getting intensely attached, too much too fast": "Excessive affection",
  "Feeling literally high / euphoric": "Overwhelming euphoria",
  "Racing thoughts, getting more intense": "Racing, intense thoughts",
  "\u201cGod's gift\u201d / famous / everyone-looks-up-to-me thinking": "Grandiosity (God's gift/famous/everyone looks up to me)",
  "Hyperfocused for hours straight \u2014 skipping food/water/bathroom, irritated if interrupted": "Hyperfocused, irritated if interrupted",
};
function migrateHypomanicWording(tiers) {
  let changed = false;
  if (tiers && tiers.hypomanic) {
    ["emerging", "peak"].forEach((t) => {
      (tiers.hypomanic[t] || []).forEach((item) => {
        if (HYPOMANIC_WORDING_MIGRATION[item.text]) {
          item.text = HYPOMANIC_WORDING_MIGRATION[item.text];
          changed = true;
        }
      });
    });
  }
  return changed;
}

function loadTiers() {
  const raw = localStorage.getItem(TIERS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (migrateHypomanicWording(parsed)) localStorage.setItem(TIERS_KEY, JSON.stringify(parsed));
      return parsed;
    } catch (e) {}
  }
  const fresh = {};
  Object.keys(AXES).forEach((axisKey) => {
    fresh[axisKey] = {};
    AXES[axisKey].tierOrder.forEach((t) => {
      fresh[axisKey][t] = DEFAULT_TIERS[axisKey][t].map((text) => ({
        id: (axisKey === "depressive" && t === "severe" && text === "Emotional spiral") ? SPIRAL_ITEM_ID : uid(t),
        text,
      }));
    });
  });
  localStorage.setItem(TIERS_KEY, JSON.stringify(fresh));
  return fresh;
}
function saveTiers(tiers) { localStorage.setItem(TIERS_KEY, JSON.stringify(tiers)); }
function loadAllEntries() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(ENTRY_PREFIX)) {
      try { out[key.slice(ENTRY_PREFIX.length)] = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    }
  }
  return out;
}
function saveEntryToDisk(dateKey, entry) { localStorage.setItem(ENTRY_PREFIX + dateKey, JSON.stringify(entry)); }
function deleteEntryFromDisk(dateKey) { localStorage.removeItem(ENTRY_PREFIX + dateKey); }

const BACKUP_KEY = "tally:lastBackup";
const LEGACY_KEY = "tally:legacy";
function loadLegacyData() {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  // first run: seed from the bundled dataset, once, then never touch it again
  const seed = (typeof LEGACY_DATA !== "undefined") ? LEGACY_DATA : [];
  localStorage.setItem(LEGACY_KEY, JSON.stringify(seed));
  return seed;
}
const BACKUP_REMINDER_DAYS = 30;
function getLastBackup() { return localStorage.getItem(BACKUP_KEY); }
function markBackedUp() { localStorage.setItem(BACKUP_KEY, new Date().toISOString()); }
function daysSince(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function exportBackup() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tiers: state.tiers,
    entries: state.entries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tally-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markBackedUp();
  render();
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(reader.result); } catch (e) {
      alert("That file doesn't look like a valid Tally backup.");
      return;
    }
    if (!parsed || typeof parsed.entries !== "object" || typeof parsed.tiers !== "object") {
      alert("That file doesn't look like a valid Tally backup.");
      return;
    }
    const entryCount = Object.keys(parsed.entries).length;
    const ok = confirm(
      `Import ${entryCount} entr${entryCount === 1 ? "y" : "ies"} and replace your current criteria lists? ` +
      `Entries with the same date as ones you already have will be overwritten.`
    );
    if (!ok) return;
    Object.keys(parsed.entries).forEach((key) => {
      saveEntryToDisk(key, parsed.entries[key]);
    });
    state.entries = { ...state.entries, ...parsed.entries };
    state.tiers = parsed.tiers;
    saveTiers(state.tiers);
    currentEntryChecksAndNote();
    render();
    alert("Import complete.");
  };
  reader.readAsText(file);
}

// ---------- state ----------
const _now = new Date();
let state = {
  tiers: loadTiers(),
  entries: loadAllEntries(),
  legacy: loadLegacyData(),
  tab: "today",
  selectedKey: todayKey(),
  checks: emptyChecks(),
  hypomanicExpanded: false,
  strangeOpen: false, strangeText: "",
  eventOpen: false, eventText: "",
  note: "",
  weather: [],
  calendarYear: _now.getFullYear(),
  calendarMonth: _now.getMonth(), // 0-indexed
  logSearch: "",
  trendRange: "all",
  trendCustomStart: "",
  trendCustomEnd: "",
  archiveExpanded: false,
};

// the criteria list a given day should be viewed/edited against:
// an existing entry's own snapshot, or (for a fresh day) the live current tiers
function getActiveTierSet() {
  const existing = state.entries[state.selectedKey];
  return existing && existing.criteriaSnapshot ? existing.criteriaSnapshot : state.tiers;
}

function currentEntryChecksAndNote() {
  const existing = state.entries[state.selectedKey];
  if (existing) {
    state.checks = JSON.parse(JSON.stringify(existing.checks || emptyChecks()));
    state.note = existing.note || "";
    state.strangeOpen = !!existing.strangeOpen;
    state.strangeText = existing.strangeText || "";
    state.eventOpen = !!existing.eventOpen;
    state.eventText = existing.eventText || "";
    state.weather = existing.weather ? [...existing.weather] : [];
    state.hypomanicExpanded = hasAnyHypomanicChecks(state.checks);
  } else {
    state.checks = emptyChecks();
    state.note = "";
    state.strangeOpen = false; state.strangeText = "";
    state.eventOpen = false; state.eventText = "";
    state.weather = [];
    state.hypomanicExpanded = false;
  }
}
currentEntryChecksAndNote();

// ---------- render root ----------
function render() {
  const stripEl = document.getElementById("weekstrip");
  if (state.tab === "today") {
    stripEl.classList.remove("hidden");
    renderWeekStrip();
  } else {
    stripEl.classList.add("hidden");
  }
  renderTabBar();
  const view = document.getElementById("view");
  view.innerHTML = "";
  if (state.tab === "today") view.appendChild(renderToday());
  if (state.tab === "log") view.appendChild(renderLog());
  if (state.tab === "trends") view.appendChild(renderTrends());
  if (state.tab === "settings") view.appendChild(renderSettings());
}

function renderTabBar() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.tab);
  });
}

function renderWeekStrip() {
  const el = document.getElementById("weekstrip");
  el.innerHTML = "";
  const todayMid = parseDateKey(todayKey());
  const target = parseDateKey(state.selectedKey);
  const diffDays = Math.round((todayMid - target) / 86400000);
  const blockIndex = Math.max(0, Math.floor(diffDays / 7));
  const windowEnd = new Date(todayMid); windowEnd.setDate(windowEnd.getDate() - blockIndex * 7);

  for (let i = 6; i >= 0; i--) {
    const d = new Date(windowEnd); d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const entry = state.entries[key];
    const score = entry ? depressiveScoreForEntry(entry) : null;
    const size = score === null ? 10 : 14 + (score / 100) * 14;

    const dayEl = document.createElement("button");
    dayEl.className = "day" + (key === state.selectedKey ? " selected" : "");
    const dot = document.createElement("div");
    dot.className = "dot";
    dot.style.width = size + "px"; dot.style.height = size + "px";
    if (score !== null) dot.style.background = scoreColor("depressive", score);
    const label = document.createElement("span");
    label.className = "day-label";
    label.textContent = key.slice(8);
    dayEl.appendChild(dot); dayEl.appendChild(label);
    dayEl.onclick = () => { state.selectedKey = key; state.tab = "today"; currentEntryChecksAndNote(); render(); };
    el.appendChild(dayEl);
  }
}

// ---------- today view ----------
function renderToday() {
  const wrap = document.createElement("div");
  const isToday = state.selectedKey === todayKey();
  const tierSet = getActiveTierSet();

  const last = getLastBackup();
  const entryCount = Object.keys(state.entries).length;
  if (daysSince(last) >= BACKUP_REMINDER_DAYS && entryCount > 0) {
    const banner = document.createElement("button");
    banner.className = "backup-nudge";
    banner.innerHTML = `It's been a while since your last backup \u2014 export a copy \u2192`;
    banner.onclick = () => { state.tab = "settings"; render(); };
    wrap.appendChild(banner);
  }

  const streak = computeStreak();
  if (streak >= 2) {
    const pill = document.createElement("div");
    pill.className = "streak-pill";
    pill.textContent = `\ud83d\udd25 ${streak}-day streak`;
    wrap.appendChild(pill);
  }

  const nav = document.createElement("div");
  nav.className = "today-nav";
  nav.innerHTML = `
    <button id="prevDay">${chevron("left")}</button>
    <div class="today-title">
      <div class="day">${isToday ? "Today" : prettyDate(state.selectedKey)}</div>
      ${isToday ? "" : `<div class="date">${state.selectedKey}</div>`}
    </div>
    <button id="nextDay" ${isToday ? "disabled" : ""}>${chevron("right")}</button>
  `;
  wrap.appendChild(nav);

  // ---- Depressive axis (always visible) ----
  wrap.appendChild(renderDepressiveScoreCard(state.selectedKey, state.checks.depressive, tierSet.depressive));
  AXES.depressive.tierOrder.forEach((t) => {
    const items = (tierSet.depressive[t] || []).filter((it) => it.id !== SPIRAL_ITEM_ID);
    wrap.appendChild(renderTierSection("depressive", t, items));
    if (t === "severe") {
      const spiralItem = (tierSet.depressive[t] || []).find((it) => it.id === SPIRAL_ITEM_ID);
      if (spiralItem) wrap.appendChild(renderSpiralButton(spiralItem));
    }
  });

  // ---- Hypomanic axis (collapsed by default, neutral label) ----
  wrap.appendChild(renderHypomanicSection(tierSet));

  // ---- toggle-to-text: strange behaviors ----
  wrap.appendChild(renderToggleText({
    stateOpenKey: "strangeOpen",
    stateTextKey: "strangeText",
    label: "Anything unusual you noticed in yourself?",
    placeholder: "What did you notice\u2026",
  }));

  // ---- toggle-to-text: events ----
  wrap.appendChild(renderToggleText({
    stateOpenKey: "eventOpen",
    stateTextKey: "eventText",
    label: "Something going on today?",
    placeholder: "What's the event or situation\u2026",
  }));

  // ---- rumination / notes, always visible ----
  const notesLabel = document.createElement("div");
  notesLabel.className = "notes-label";
  notesLabel.textContent = "What's your brain stuck on?";
  wrap.appendChild(notesLabel);

  const textarea = document.createElement("textarea");
  textarea.className = "notes";
  textarea.placeholder = "The project, the show, the hike, whatever's on repeat\u2026";
  textarea.value = state.note;
  textarea.oninput = (e) => { state.note = e.target.value; };
  wrap.appendChild(textarea);

  // ---- weather, multi-select chips ----
  wrap.appendChild(renderWeatherChips());

  // ---- save ----
  const hasExisting = !!state.entries[state.selectedKey];
  const saveBtn = document.createElement("button");
  saveBtn.className = "save-btn";
  saveBtn.textContent = hasExisting ? "Update entry" : "Save entry";
  saveBtn.onclick = () => {
    const existing = state.entries[state.selectedKey];
    const criteriaSnapshot = existing && existing.criteriaSnapshot
      ? existing.criteriaSnapshot
      : JSON.parse(JSON.stringify(state.tiers));
    const entry = {
      date: state.selectedKey,
      checks: state.checks,
      note: state.note,
      strangeOpen: state.strangeOpen, strangeText: state.strangeOpen ? state.strangeText : "",
      eventOpen: state.eventOpen, eventText: state.eventOpen ? state.eventText : "",
      weather: state.weather,
      criteriaSnapshot,
      savedAt: new Date().toISOString(),
    };
    saveEntryToDisk(state.selectedKey, entry);
    state.entries[state.selectedKey] = entry;

    saveBtn.textContent = "Saved \u2713";
    saveBtn.classList.add("saved", "pop");
    spawnSaveSparkles(saveBtn);

    setTimeout(() => { render(); }, 1100);
  };
  wrap.appendChild(saveBtn);

  setTimeout(() => {
    const prev = document.getElementById("prevDay");
    const next = document.getElementById("nextDay");
    if (prev) prev.onclick = () => shiftDay(-1);
    if (next) next.onclick = () => shiftDay(1);
  }, 0);

  return wrap;
}

// current logging streak: counts consecutive entries where no gap between them
// missed 5+ days (same tolerance as the Trends line-break rule). Returns 0 if
// it's currently been 5+ days since the last entry (streak considered over).
function computeStreak() {
  const dates = Object.keys(state.entries).sort();
  if (!dates.length) return 0;
  const last = dates[dates.length - 1];
  const gapToToday = Math.round((parseDateKey(todayKey()) - parseDateKey(last)) / 86400000);
  const missedToToday = gapToToday - 1;
  if (missedToToday >= LINE_BREAK_MISSED_DAYS) return 0;
  let count = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    const gap = Math.round((parseDateKey(dates[i]) - parseDateKey(dates[i - 1])) / 86400000);
    const missed = gap - 1;
    if (missed < LINE_BREAK_MISSED_DAYS) count++; else break;
  }
  return count;
}

function shiftDay(delta) {
  const [y, m, d] = state.selectedKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  state.selectedKey = todayKey(dt);
  currentEntryChecksAndNote();
  render();
}

function spawnSaveSparkles(btn) {
  const colors = ["#7C9070", "#B98A2E", "#9C4A3A", "#5B7C99", "#C79A56"];
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
    const dist = 34 + Math.random() * 20;
    const tx = Math.cos(angle) * dist, ty = Math.sin(angle) * dist;
    const span = document.createElement("span");
    span.className = "save-sparkle";
    span.style.setProperty("--tx", tx + "px");
    span.style.setProperty("--ty", ty + "px");
    span.style.background = colors[i % colors.length];
    span.style.animationDelay = (Math.random() * 0.06) + "s";
    btn.appendChild(span);
    setTimeout(() => { if (span.parentNode) span.parentNode.removeChild(span); }, 900);
  }
}

function renderScoreCard(axisDef, checksAxis, tierConfigAxis) {
  const score = computeAxisScore(checksAxis, tierConfigAxis, axisDef);
  const card = document.createElement("div");
  card.className = `score-card score-card-${axisDef.key}`;
  card.innerHTML = `
    <div>
      <div class="label">${escapeHtml(axisDef.label)}</div>
      <div class="desc" style="color:${scoreColor(axisDef.key, score)}">${scoreLabel(axisDef.key, score)}</div>
    </div>
    <div class="num" style="color:${scoreColor(axisDef.key, score)}">${score}</div>
  `;
  return card;
}

function renderDepressiveScoreCard(dateKey, checksDepressive, tierConfigDepressive) {
  const wrap = document.createElement("div");
  const { score, offset } = depressiveScoreWithBoost(dateKey, checksDepressive, tierConfigDepressive);
  const card = document.createElement("div");
  card.className = "score-card score-card-depressive";
  card.innerHTML = `
    <div>
      <div class="label">${escapeHtml(AXES.depressive.label)}</div>
      <div class="desc" style="color:${scoreColor("depressive", score)}">${scoreLabel("depressive", score)}</div>
    </div>
    <div class="num" style="color:${scoreColor("depressive", score)}">${score}</div>
  `;
  wrap.appendChild(card);
  const ownSpiral = (checksDepressive.severe || []).includes(SPIRAL_ITEM_ID);
  if (ownSpiral) {
    const note = document.createElement("div");
    note.className = "spiral-note";
    note.textContent = "Spiral logged today";
    wrap.appendChild(note);
  }
  if (offset) {
    const note = document.createElement("div");
    note.className = "spiral-note";
    note.textContent = `still carrying a spiral from ${offset} day${offset > 1 ? "s" : ""} ago`;
    wrap.appendChild(note);
  }
  return wrap;
}

function renderSpiralButton(spiralItem) {
  const isOn = (state.checks.depressive.severe || []).includes(spiralItem.id);
  const btn = document.createElement("button");
  btn.className = "spiral-btn" + (isOn ? " on" : "");
  btn.innerHTML = `
    <span class="spiral-btn-icon">${isOn ? "\u25c9" : "\u25cb"}</span>
    <span class="spiral-btn-text">
      <span class="spiral-btn-title">Emotional spiral</span>
      <span class="spiral-btn-sub">full breakdown \u2014 tapers over the next 5 days</span>
    </span>
  `;
  btn.onclick = () => {
    const cur = state.checks.depressive.severe || [];
    state.checks.depressive.severe = cur.includes(spiralItem.id)
      ? cur.filter((x) => x !== spiralItem.id)
      : [...cur, spiralItem.id];
    render();
  };
  return btn;
}

function renderTierSection(axisKey, tier, items) {
  const axisDef = AXES[axisKey];
  const meta = axisDef.tierMeta[tier];
  const section = document.createElement("div");
  section.className = "tier";
  const head = document.createElement("div");
  head.className = "tier-head";
  head.innerHTML = `<span class="swatch" style="background:${meta.color}"></span><span class="name" style="color:${meta.color}">${meta.label}</span>`;
  section.appendChild(head);

  items.forEach((item) => {
    const isOn = (state.checks[axisKey][tier] || []).includes(item.id);
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.style.borderColor = isOn ? meta.color : "#E4E0D8";
    btn.style.background = isOn ? meta.soft : "#FFFFFF";
    btn.innerHTML = `
      <span class="box" style="border-color:${isOn ? meta.color : "#CFC9BC"};background:${isOn ? meta.color : "transparent"}">
        ${isOn ? checkSvg() : ""}
      </span>
      <span class="txt">${escapeHtml(item.text)}</span>
    `;
    btn.onclick = () => {
      const cur = state.checks[axisKey][tier] || [];
      state.checks[axisKey][tier] = cur.includes(item.id) ? cur.filter((x) => x !== item.id) : [...cur, item.id];
      render();
    };
    section.appendChild(btn);
  });
  return section;
}

function renderHypomanicSection(tierSet) {
  const wrap = document.createElement("div");
  wrap.className = "collapsible";

  const header = document.createElement("button");
  header.className = "collapsible-head";
  header.innerHTML = `
    <span class="collapsible-head-left">
      <span class="swatch"></span>
      <span class="collapsible-title">Energy & activity</span>
    </span>
    <span class="collapsible-chevron ${state.hypomanicExpanded ? "open" : ""}">${chevron("down")}</span>
  `;
  header.onclick = () => { state.hypomanicExpanded = !state.hypomanicExpanded; render(); };
  wrap.appendChild(header);

  if (state.hypomanicExpanded) {
    const body = document.createElement("div");
    body.className = "collapsible-body";
    body.appendChild(renderScoreCard(AXES.hypomanic, state.checks.hypomanic, tierSet.hypomanic));
    AXES.hypomanic.tierOrder.forEach((t) => body.appendChild(renderTierSection("hypomanic", t, tierSet.hypomanic[t] || [])));
    wrap.appendChild(body);
  }
  return wrap;
}

function renderToggleText({ stateOpenKey, stateTextKey, label, placeholder }) {
  const wrap = document.createElement("div");
  wrap.className = "toggle-block";

  const row = document.createElement("button");
  row.className = "toggle-row";
  const isOn = state[stateOpenKey];
  row.innerHTML = `
    <span class="toggle-label">${escapeHtml(label)}</span>
    <span class="switch ${isOn ? "on" : ""}"><span class="knob"></span></span>
  `;
  row.onclick = () => { state[stateOpenKey] = !state[stateOpenKey]; render(); };
  wrap.appendChild(row);

  if (isOn) {
    const ta = document.createElement("textarea");
    ta.className = "notes toggle-text";
    ta.placeholder = placeholder;
    ta.value = state[stateTextKey];
    ta.oninput = (e) => { state[stateTextKey] = e.target.value; };
    wrap.appendChild(ta);
  }
  return wrap;
}

function renderWeatherChips() {
  const wrap = document.createElement("div");
  wrap.className = "weather-block";
  const label = document.createElement("div");
  label.className = "notes-label";
  label.textContent = "Weather";
  wrap.appendChild(label);

  const chipRow = document.createElement("div");
  chipRow.className = "chip-row";
  WEATHER_OPTIONS.forEach((opt) => {
    const on = state.weather.includes(opt.id);
    const chip = document.createElement("button");
    chip.className = "chip" + (on ? " on" : "");
    chip.textContent = opt.label;
    chip.onclick = () => {
      state.weather = on ? state.weather.filter((w) => w !== opt.id) : [...state.weather, opt.id];
      render();
    };
    chipRow.appendChild(chip);
  });
  wrap.appendChild(chipRow);
  return wrap;
}

function checkSvg() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
}
function chevron(dir) {
  const map = { left: "15 18 9 12 15 6", right: "9 18 15 12 9 6", down: "6 9 12 15 18 9" };
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9A948A" stroke-width="2"><polyline points="${map[dir]}"/></svg>`;
}

// ---------- calendar (Log tab) ----------
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAY_LETTERS = ["S","M","T","W","T","F","S"];

function shiftCalendarMonth(delta) {
  let m = state.calendarMonth + delta;
  let y = state.calendarYear;
  if (m < 0) { m = 11; y -= 1; }
  if (m > 11) { m = 0; y += 1; }
  state.calendarMonth = m; state.calendarYear = y;
  render();
}

function renderCalendar() {
  const wrap = document.createElement("div");
  wrap.className = "calendar";

  const head = document.createElement("div");
  head.className = "calendar-head";
  head.innerHTML = `
    <button id="calPrev">${chevron("left")}</button>
    <span class="calendar-title">${MONTH_NAMES[state.calendarMonth]} ${state.calendarYear}</span>
    <button id="calNext">${chevron("right")}</button>
  `;
  wrap.appendChild(head);

  const weekdayRow = document.createElement("div");
  weekdayRow.className = "calendar-grid calendar-weekdays";
  WEEKDAY_LETTERS.forEach((l) => {
    const c = document.createElement("div");
    c.className = "calendar-weekday";
    c.textContent = l;
    weekdayRow.appendChild(c);
  });
  wrap.appendChild(weekdayRow);

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  const firstOfMonth = new Date(state.calendarYear, state.calendarMonth, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(state.calendarYear, state.calendarMonth + 1, 0).getDate();
  const todayStr = todayKey();

  for (let i = 0; i < startOffset; i++) {
    const filler = document.createElement("div");
    filler.className = "calendar-cell empty";
    grid.appendChild(filler);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = todayKey(new Date(state.calendarYear, state.calendarMonth, day));
    const entry = state.entries[key];
    const cell = document.createElement("button");
    cell.className = "calendar-cell";
    if (key === todayStr) cell.classList.add("is-today");

    let score = null;
    if (entry) {
      score = depressiveScoreForEntry(entry);
    }
    if (score !== null) {
      cell.style.background = scoreColor("depressive", score);
      cell.style.color = "rgba(255,255,255,0.9)";
    }
    cell.innerHTML = `<span class="calendar-daynum">${day}</span>`;
    if (entry) {
      cell.onclick = () => scrollToLogEntry(key);
    } else {
      cell.onclick = () => { state.selectedKey = key; state.tab = "today"; currentEntryChecksAndNote(); render(); };
    }
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);

  setTimeout(() => {
    const prev = document.getElementById("calPrev");
    const next = document.getElementById("calNext");
    if (prev) prev.onclick = () => shiftCalendarMonth(-1);
    if (next) next.onclick = () => shiftCalendarMonth(1);
  }, 0);

  return wrap;
}

function scrollToLogEntry(dateKey) {
  const el = document.getElementById(`log-${dateKey}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1200);
}

// ---------- log view ----------
function renderLog() {
  const wrap = document.createElement("div");
  wrap.appendChild(renderCalendar());

  const searchWrap = document.createElement("div");
  searchWrap.className = "log-search-wrap";
  searchWrap.innerHTML = `
    <input type="text" id="logSearchInput" class="log-search-input" placeholder="Search notes, events, unusual signs\u2026" value="${escapeHtml(state.logSearch)}" />
    ${state.logSearch ? `<button class="log-search-clear" id="logSearchClear">${xSvg()}</button>` : ""}
  `;
  wrap.appendChild(searchWrap);
  setTimeout(() => {
    const input = document.getElementById("logSearchInput");
    const clearBtn = document.getElementById("logSearchClear");
    if (input) {
      input.oninput = (e) => { state.logSearch = e.target.value; render(); };
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    if (clearBtn) clearBtn.onclick = () => { state.logSearch = ""; render(); };
  }, 0);

  const query = state.logSearch.trim().toLowerCase();
  const matchesSearch = (e) => {
    if (!query) return true;
    const fields = [e.note, e.strangeOpen ? e.strangeText : "", e.eventOpen ? e.eventText : ""];
    return fields.some((f) => (f || "").toLowerCase().includes(query));
  };

  const list = Object.values(state.entries).filter(matchesSearch).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "log-empty";
    empty.textContent = query
      ? "No entries match that search."
      : "Nothing here yet \u2014 your thread starts whenever you're ready.";
    wrap.appendChild(empty);
    return wrap;
  }
  list.forEach((e) => {
    const tierSet = e.criteriaSnapshot || state.tiers;
    const depScore = depressiveScoreForEntry(e);
    const spiralInfo = spiralBoostFor(e.date);
    const ownSpiral = (e.checks.depressive.severe || []).includes(SPIRAL_ITEM_ID);
    const showSpiralNote = !!spiralInfo.offset;
    const showHypo = hasAnyHypomanicChecks(e.checks);
    const hypoScore = showHypo ? computeAxisScore(e.checks.hypomanic, tierSet.hypomanic, AXES.hypomanic) : null;

    const checkedItems = [];
    AXES.depressive.tierOrder.forEach((t) => {
      (e.checks.depressive[t] || []).forEach((id) => {
        const it = (tierSet.depressive[t] || []).find((x) => x.id === id);
        if (it) checkedItems.push(it.text);
      });
    });
    const hypoItems = [];
    if (showHypo) {
      AXES.hypomanic.tierOrder.forEach((t) => {
        (e.checks.hypomanic[t] || []).forEach((id) => {
          const it = (tierSet.hypomanic[t] || []).find((x) => x.id === id);
          if (it) hypoItems.push(it.text);
        });
      });
    }

    const weatherStr = (e.weather || []).map((id) => {
      const opt = WEATHER_OPTIONS.find((w) => w.id === id);
      return opt ? opt.label.split(" ")[0] : "";
    }).join(" ");

    const card = document.createElement("div");
    card.className = "log-card";
    card.id = `log-${e.date}`;
    card.innerHTML = `
      <div>
        <div class="day">${prettyDate(e.date)} ${weatherStr ? `<span class="weather-inline">${weatherStr}</span>` : ""}</div>
        ${checkedItems.length ? `<div class="tags">${checkedItems.map(escapeHtml).join(" \u00b7 ")}</div>` : ""}
        ${ownSpiral ? `<div class="log-spiral-note">Spiral logged today</div>` : ""}
        ${showSpiralNote ? `<div class="log-spiral-note">still carrying a spiral from ${spiralInfo.offset} day${spiralInfo.offset > 1 ? "s" : ""} ago</div>` : ""}
        ${hypoItems.length ? `<div class="tags hypo-tags">${hypoItems.map(escapeHtml).join(" \u00b7 ")}</div>` : ""}
        ${e.strangeOpen && e.strangeText ? `<div class="field-label">Unusual</div><div class="note">${escapeHtml(e.strangeText)}</div>` : ""}
        ${e.eventOpen && e.eventText ? `<div class="field-label">Event</div><div class="note">${escapeHtml(e.eventText)}</div>` : ""}
        ${e.note ? `<div class="field-label">On my mind</div><div class="note">${escapeHtml(e.note)}</div>` : ""}
      </div>
      <div class="right">
        <div class="score-pair">
          <div class="score" style="color:${scoreColor("depressive", depScore)}">${depScore}</div>
          ${hypoScore !== null ? `<div class="score hypo-score" style="color:${AXES.hypomanic.lineColor}">${hypoScore}</div>` : ""}
        </div>
        <button class="del">${xSvg()}</button>
      </div>
    `;
    card.addEventListener("click", (ev) => {
      if (ev.target.closest(".del")) return;
      state.selectedKey = e.date; state.tab = "today"; currentEntryChecksAndNote(); render();
    });
    card.querySelector(".del").onclick = (ev) => {
      ev.stopPropagation();
      deleteEntryFromDisk(e.date);
      delete state.entries[e.date];
      if (state.selectedKey === e.date) currentEntryChecksAndNote();
      render();
    };
    wrap.appendChild(card);
  });
  return wrap;
}
function xSvg() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#CFC9BC" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
}

// ---------- trends view ----------
const TREND_RANGES = [
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

function filterByRange(data) {
  const range = state.trendRange || "all";
  if (range === "all") return data;
  const todayD = parseDateKey(todayKey());
  if (range === "30" || range === "90") {
    const cutoff = new Date(todayD);
    cutoff.setDate(cutoff.getDate() - (range === "30" ? 29 : 89));
    return data.filter((d) => parseDateKey(d.date) >= cutoff);
  }
  if (range === "year") {
    const jan1 = new Date(todayD.getFullYear(), 0, 1);
    return data.filter((d) => parseDateKey(d.date) >= jan1);
  }
  if (range === "custom") {
    const start = state.trendCustomStart ? parseDateKey(state.trendCustomStart) : null;
    const end = state.trendCustomEnd ? parseDateKey(state.trendCustomEnd) : null;
    return data.filter((d) => {
      const dt = parseDateKey(d.date);
      if (start && dt < start) return false;
      if (end && dt > end) return false;
      return true;
    });
  }
  return data;
}

function renderTrends() {
  const wrap = document.createElement("div");
  const sorted = Object.values(state.entries).sort((a, b) => (a.date < b.date ? -1 : 1));
  const allData = sorted.map((e) => {
    const tierSet = e.criteriaSnapshot || state.tiers;
    const showHypo = hasAnyHypomanicChecks(e.checks);
    return {
      date: e.date,
      label: e.date.slice(5),
      depressive: depressiveScoreForEntry(e),
      hypomanic: showHypo ? computeAxisScore(e.checks.hypomanic, tierSet.hypomanic, AXES.hypomanic) : null,
      weather: (e.weather && e.weather[0]) || null,
    };
  });

  if (allData.length === 0) {
    wrap.innerHTML = `<div class="trend-empty">Not enough dots yet to draw a line \u2014 a few more days and the picture starts to show.</div>`;
  } else {
    const data = filterByRange(allData);

    const rangeRow = document.createElement("div");
    rangeRow.className = "chip-row trend-range-row";
    TREND_RANGES.forEach((r) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (state.trendRange === r.id ? " on" : "");
      chip.textContent = r.label;
      chip.onclick = () => { state.trendRange = r.id; render(); };
      rangeRow.appendChild(chip);
    });
    wrap.appendChild(rangeRow);

    if (state.trendRange === "custom") {
      const customRow = document.createElement("div");
      customRow.className = "trend-custom-row";
      customRow.innerHTML = `
        <input type="date" id="trendStart" value="${state.trendCustomStart}" />
        <span class="trend-custom-sep">to</span>
        <input type="date" id="trendEnd" value="${state.trendCustomEnd}" />
      `;
      wrap.appendChild(customRow);
      setTimeout(() => {
        const s = document.getElementById("trendStart");
        const e = document.getElementById("trendEnd");
        if (s) s.onchange = (ev) => { state.trendCustomStart = ev.target.value; render(); };
        if (e) e.onchange = (ev) => { state.trendCustomEnd = ev.target.value; render(); };
      }, 0);
    }

    if (data.length === 0) {
      const empty = document.createElement("div");
      empty.className = "trend-empty";
      empty.textContent = "No entries in this time range.";
      wrap.appendChild(empty);
    } else {
      const card = document.createElement("div");
      card.className = "trend-card";
      card.innerHTML = `
        <div class="label">Intensity over time</div>
        <canvas id="chart"></canvas>
        <div class="legend">
          <span><span class="swatch" style="background:${AXES.depressive.lineColor}"></span>Depressive</span>
          <span><span class="swatch" style="background:${AXES.hypomanic.lineColor}"></span>Hypomanic</span>
        </div>
        <div class="legend weather-legend-note">weather shown as a band along the bottom</div>
      `;
      wrap.appendChild(card);

      const count = document.createElement("div");
      count.className = "trend-count";
      count.textContent = `${data.length} entries in view`;
      wrap.appendChild(count);

      setTimeout(() => drawChart(document.getElementById("chart"), data), 0);
    }
  }

  wrap.appendChild(renderArchiveSection());
  return wrap;
}

function renderArchiveSection() {
  const legacy = (state.legacy || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!legacy.length) return document.createElement("div");

  const wrap = document.createElement("div");
  wrap.className = "archive-collapsible";

  const header = document.createElement("button");
  header.className = "archive-head";
  header.innerHTML = `
    <span class="archive-head-left">
      <span class="archive-swatch"></span>
      <span class="archive-title">Archived history</span>
    </span>
    <span class="collapsible-chevron ${state.archiveExpanded ? "open" : ""}">${chevron("down")}</span>
  `;
  header.onclick = () => { state.archiveExpanded = !state.archiveExpanded; render(); };
  wrap.appendChild(header);

  if (state.archiveExpanded) {
    const body = document.createElement("div");
    body.className = "archive-body";
    const card = document.createElement("div");
    card.className = "archive-card";
    card.innerHTML = `
      <canvas id="archiveChart"></canvas>
      <div class="legend">
        <span><span class="swatch" style="background:${"var(--archive-depressive)"}"></span>Depressive (archived)</span>
        <span><span class="swatch" style="background:${"var(--archive-hypomanic)"}"></span>Hypomanic (archived)</span>
      </div>
      <div class="legend weather-legend-note">from your old measuring system \u2014 shown for the shape of your history, not directly comparable to current scores</div>
    `;
    body.appendChild(card);
    const count = document.createElement("div");
    count.className = "trend-count";
    count.textContent = `${legacy.length} archived entries`;
    body.appendChild(count);
    wrap.appendChild(body);
    setTimeout(() => drawArchiveChart(document.getElementById("archiveChart"), legacy), 0);
  }
  return wrap;
}

const LINE_BREAK_MISSED_DAYS = 5; // break the line if this many or more consecutive days were unlogged

function drawChart(canvas, liveData) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 300, h = 210;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const bandH = 8, bandGap = 5;
  const padL = 28, padR = 8, padT = 10, padB = 22 + bandH + bandGap;
  const plotW = w - padL - padR, plotH = h - padT - padB;

  const dates = liveData.map((d) => parseDateKey(d.date));
  const minDate = dates[0], maxDate = dates[dates.length - 1];
  const totalMs = Math.max(1, maxDate - minDate);
  const xForDate = (dt) => (dates.length === 1 ? padL + plotW / 2 : padL + ((dt - minDate) / totalMs) * plotW);

  ctx.strokeStyle = "#EFEBE3";
  ctx.fillStyle = "#9A948A";
  ctx.font = "10px -apple-system, sans-serif";
  [0, 25, 50, 75, 100].forEach((v) => {
    const y = padT + plotH - (v / 100) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(String(v), 2, y + 3);
  });

  const tickCount = Math.min(5, dates.length);
  for (let i = 0; i < tickCount; i++) {
    const t = tickCount === 1 ? 0 : i / (tickCount - 1);
    const dt = new Date(minDate.getTime() + t * totalMs);
    const x = padL + t * plotW;
    ctx.textAlign = i === 0 ? "left" : i === tickCount - 1 ? "right" : "center";
    ctx.fillText(shortDate(dt), x, h - 6);
  }

  function seriesFrom(key) {
    return liveData
      .map((d) => ({ date: parseDateKey(d.date), value: d[key] }))
      .filter((p) => p.value !== null && p.value !== undefined)
      .map((p) => ({ x: xForDate(p.date), y: padT + plotH - (p.value / 100) * plotH, date: p.date }));
  }

  function drawSeries(key, color) {
    const pts = seriesFrom(key);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i === 0) { ctx.moveTo(p.x, p.y); started = true; continue; }
      const prev = pts[i - 1];
      const gapDays = Math.round((p.date - prev.date) / 86400000);
      const missedDays = gapDays - 1;
      if (missedDays >= LINE_BREAK_MISSED_DAYS) {
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    if (started) ctx.stroke();
    pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill(); });
  }

  drawSeries("depressive", AXES.depressive.lineColor);
  drawSeries("hypomanic", AXES.hypomanic.lineColor);

  const bandY = padT + plotH + bandGap;
  const bandXs = dates.map(xForDate);
  liveData.forEach((d, i) => {
    const cx = bandXs[i];
    const leftGap = i === 0 ? cx : cx - bandXs[i - 1];
    const rightGap = i === bandXs.length - 1 ? (w - cx) : bandXs[i + 1] - cx;
    const segW = Math.max(2, Math.min(Math.min(leftGap, rightGap) * 0.8, 26));
    const opt = d.weather ? WEATHER_OPTIONS.find((wo) => wo.id === d.weather) : null;
    ctx.fillStyle = opt ? opt.bandColor : "#EFEBE3";
    let x0 = cx - segW / 2;
    x0 = Math.max(1, Math.min(x0, w - segW - 1));
    roundRect(ctx, x0, bandY, segW, bandH, 2);
    ctx.fill();
  });
}

function drawArchiveChart(canvas, legacyData) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 300, h = 190;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const padL = 28, padR = 8, padT = 10, padB = 22;
  const plotW = w - padL - padR, plotH = h - padT - padB;

  const dates = legacyData.map((d) => parseDateKey(d.date));
  const minDate = dates[0], maxDate = dates[dates.length - 1];
  const totalMs = Math.max(1, maxDate - minDate);
  const xForDate = (dt) => (dates.length === 1 ? padL + plotW / 2 : padL + ((dt - minDate) / totalMs) * plotW);

  ctx.strokeStyle = "#E7DBB8";
  ctx.fillStyle = "#A6976E";
  ctx.font = "10px -apple-system, sans-serif";
  [0, 25, 50, 75, 100].forEach((v) => {
    const y = padT + plotH - (v / 100) * plotH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(String(v), 2, y + 3);
  });

  const tickCount = Math.min(5, dates.length);
  for (let i = 0; i < tickCount; i++) {
    const t = tickCount === 1 ? 0 : i / (tickCount - 1);
    const dt = new Date(minDate.getTime() + t * totalMs);
    const x = padL + t * plotW;
    ctx.textAlign = i === 0 ? "left" : i === tickCount - 1 ? "right" : "center";
    ctx.fillText(shortDate(dt), x, h - 6);
  }

  function seriesFrom(key) {
    return legacyData
      .map((d) => ({ date: parseDateKey(d.date), value: d[key] }))
      .filter((p) => p.value !== null && p.value !== undefined)
      .map((p) => ({ x: xForDate(p.date), y: padT + plotH - (p.value / 100) * plotH, date: p.date }));
  }

  function drawSeries(key, color) {
    const pts = seriesFrom(key);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i === 0) { ctx.moveTo(p.x, p.y); started = true; continue; }
      const prev = pts[i - 1];
      const gapDays = Math.round((p.date - prev.date) / 86400000);
      const missedDays = gapDays - 1;
      if (missedDays >= LINE_BREAK_MISSED_DAYS) {
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    if (started) ctx.stroke();
    pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill(); });
  }

  drawSeries("depressive", "#7C93A8");
  drawSeries("hypomanic", "#B87C93");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function deleteAllData() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("tally:") && k !== LEGACY_KEY) keysToRemove.push(k);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  state.tiers = loadTiers();
  state.entries = {};
  state.selectedKey = todayKey();
  state.tab = "today";
  currentEntryChecksAndNote();
  render();
}

// ---------- settings view ----------
function renderSettings() {
  const wrap = document.createElement("div");

  // backup / import
  const backupCard = document.createElement("div");
  backupCard.className = "backup-card";
  const last = getLastBackup();
  const since = daysSince(last);
  const overdue = since >= BACKUP_REMINDER_DAYS;
  const entryCount = Object.keys(state.entries).length;

  const statusLine = last
    ? `Last backup ${since === 0 ? "today" : since === 1 ? "1 day ago" : since + " days ago"}.`
    : "You haven't backed up yet.";

  backupCard.innerHTML = `
    <div class="backup-head">Backup</div>
    ${overdue && entryCount > 0 ? `<div class="backup-reminder">It's been a while \u2014 worth exporting a fresh copy.</div>` : ""}
    <div class="backup-status">${statusLine}</div>
    <div class="backup-btn-row">
      <button class="backup-btn" id="exportBtn">Export JSON</button>
      <button class="backup-btn secondary" id="importBtn">Import JSON</button>
    </div>
    <input type="file" id="importFile" accept="application/json,.json" style="display:none" />
  `;
  wrap.appendChild(backupCard);

  const intro = document.createElement("div");
  intro.className = "settings-intro";
  intro.textContent = "Edit your criteria for each axis. Changes only affect new entries \u2014 past entries keep the criteria list they were logged against.";
  wrap.appendChild(intro);

  Object.keys(AXES).forEach((axisKey) => {
    const axisDef = AXES[axisKey];
    const axisHead = document.createElement("div");
    axisHead.className = "settings-axis-head";
    axisHead.textContent = axisDef.label;
    wrap.appendChild(axisHead);

    axisDef.tierOrder.forEach((t) => {
      const meta = axisDef.tierMeta[t];
      const section = document.createElement("div");
      section.className = "settings-tier";
      const head = document.createElement("div");
      head.className = "tier-head";
      head.innerHTML = `<span class="swatch" style="background:${meta.color}"></span><span class="name" style="color:${meta.color}">${meta.label} \u00b7 weight ${meta.weight}</span>`;
      section.appendChild(head);

      state.tiers[axisKey][t].forEach((item) => {
        if (item.id === SPIRAL_ITEM_ID) return; // built-in, not user-editable from the list
        const row = document.createElement("div");
        row.className = "settings-item-row";
        row.innerHTML = `<span>${escapeHtml(item.text)}</span><button>${xSvg()}</button>`;
        row.querySelector("button").onclick = () => {
          state.tiers[axisKey][t] = state.tiers[axisKey][t].filter((i) => i.id !== item.id);
          render();
        };
        section.appendChild(row);
      });
      if (axisKey === "depressive" && t === "severe") {
        const builtin = document.createElement("div");
        builtin.className = "settings-builtin-note";
        builtin.textContent = "Emotional spiral is built in \u2014 shown as its own button on the Today screen, tapers over 5 days, can't be removed here.";
        section.appendChild(builtin);
      }

      const addRow = document.createElement("div");
      addRow.className = "settings-add";
      const input = document.createElement("input");
      input.placeholder = "Add a sign\u2026";
      const addBtn = document.createElement("button");
      addBtn.style.background = meta.soft;
      addBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${meta.color}" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      const doAdd = () => {
        const text = input.value.trim();
        if (!text) return;
        state.tiers[axisKey][t].push({ id: uid(t), text });
        render();
      };
      addBtn.onclick = doAdd;
      input.onkeydown = (e) => { if (e.key === "Enter") doAdd(); };
      addRow.appendChild(input); addRow.appendChild(addBtn);
      section.appendChild(addRow);

      wrap.appendChild(section);
    });
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "settings-save";
  saveBtn.textContent = "Save changes";
  saveBtn.onclick = () => { saveTiers(state.tiers); render(); };
  wrap.appendChild(saveBtn);

  const dangerZone = document.createElement("div");
  dangerZone.className = "danger-zone";
  dangerZone.innerHTML = `
    <div class="danger-head">Danger zone</div>
    <button class="delete-all-btn" id="deleteAllBtn">Delete all data</button>
  `;
  wrap.appendChild(dangerZone);

  setTimeout(() => {
    const exportBtn = document.getElementById("exportBtn");
    const importBtn = document.getElementById("importBtn");
    const importFile = document.getElementById("importFile");
    const deleteAllBtn = document.getElementById("deleteAllBtn");
    if (exportBtn) exportBtn.onclick = exportBackup;
    if (importBtn) importBtn.onclick = () => importFile.click();
    if (importFile) importFile.onchange = (e) => {
      const file = e.target.files[0];
      if (file) importBackup(file);
      e.target.value = "";
    };
    if (deleteAllBtn) deleteAllBtn.onclick = () => {
      const ok1 = confirm(
        "This permanently deletes every entry and resets your criteria lists back to their defaults " +
        "(your archived pre-Tally history is kept). " +
        "This can't be undone \u2014 export a backup first if you want to keep anything. Delete everything?"
      );
      if (!ok1) return;
      const ok2 = confirm("Really sure? There's no undo for this.");
      if (!ok2) return;
      deleteAllData();
    };
  }, 0);

  return wrap;
}

// ---------- tab wiring ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => { state.tab = btn.dataset.tab; render(); });
});

// ---------- boot ----------
render();

// ---------- service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
