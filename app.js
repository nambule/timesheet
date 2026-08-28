// Timesheet - simple offline SPA using localStorage

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const START_SORT_DEBOUNCE_MS = 400;
const IMMEDIATE_SORT_TRIGGERS = ['btn-start-inc', 'btn-start-dec'];
const GROUP_COLOR_PALETTE = ['#6d4aff', '#0f8fa3', '#d97706', '#2563eb', '#be185d', '#4f46e5', '#0f766e'];
const DEFAULT_PROJECT_GROUPS = [
  { id: 'pm-cpo', name: 'PM + CPO', color: '#6d4aff' },
  { id: 'adm', name: 'ADM', color: '#0f8fa3' },
  { id: 'other', name: 'Autres', color: '#d97706' },
];

function defaultGroupIdForProject(project){
  if(['PM', 'CPO'].includes(project)) return 'pm-cpo';
  if(project === 'ADM') return 'adm';
  return 'other';
}

function normalizeProjectGroups(meta){
  const storedGroups = Array.isArray(meta.projectGroups) && meta.projectGroups.length
    ? meta.projectGroups
        .filter(group => group && group.id && group.name)
        .map((group, index) => ({
          id: String(group.id),
          name: String(group.name),
          color: /^#[0-9a-f]{6}$/i.test(group.color || '')
            ? group.color
            : GROUP_COLOR_PALETTE[index % GROUP_COLOR_PALETTE.length],
        }))
    : [];
  const groups = storedGroups.length
    ? storedGroups
    : DEFAULT_PROJECT_GROUPS.map(group => ({ ...group }));
  const validIds = new Set(groups.map(group => group.id));
  const fallbackId = validIds.has('other') ? 'other' : groups[0].id;
  const assignments = {};
  for(const project of meta.projects || []){
    const assignedId = meta.projectGroupAssignments?.[project];
    assignments[project] = validIds.has(assignedId)
      ? assignedId
      : (validIds.has(defaultGroupIdForProject(project)) ? defaultGroupIdForProject(project) : fallbackId);
  }
  return { groups, assignments };
}

function projectGroup(project){
  const groups = state.meta.projectGroups || [];
  const assignedId = state.meta.projectGroupAssignments?.[project];
  return groups.find(group => group.id === assignedId)
    || groups.find(group => group.id === 'other')
    || groups[0]
    || { id: 'ungrouped', name: 'Sans groupe', color: GROUP_COLOR_PALETTE[0] };
}

function projectColor(project){
  return projectGroup(project).color;
}

// -------- Data Model --------
// Entry: { id, project, comment, minutes, start }
// Day data key: ts:YYYY-MM-DD
// Meta key (global): ts:meta -> projects, shortcuts, groups and project assignments

function todayISO() {
  return dateToISO(new Date());
}

function dateToISO(d){
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function isoToLocalDate(dateStr){
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function weekRangeISO(anchorDate = todayISO()){
  const anchor = isoToLocalDate(anchorDate);
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { start: dateToISO(monday), end: dateToISO(sunday) };
}

function monthRangeISO(anchorDate = todayISO()){
  const anchor = isoToLocalDate(anchorDate);
  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: dateToISO(firstDay), end: dateToISO(lastDay) };
}

function currentWeekRangeISO(){
  return weekRangeISO(todayISO());
}

function storageKey(dateStr){
  return `ts:${dateStr}`;
}

function loadDay(dateStr){
  try{
    const raw = localStorage.getItem(storageKey(dateStr));
    if(!raw) return { entries: [], projects: [] };
    const data = JSON.parse(raw);
    data.entries = data.entries || [];
    data.projects = data.projects || [];
    return data;
  }catch(e){
    console.error('Load error', e);
    return { entries: [], projects: [] };
  }
}

function saveDay(dateStr, data){
  localStorage.setItem(storageKey(dateStr), JSON.stringify(data));
}

function loadMeta(){
  try{
    const raw = localStorage.getItem('ts:meta');
    if(!raw){
      return {
        projects: [],
        commentShortcuts: [],
        projectGroups: DEFAULT_PROJECT_GROUPS.map(group => ({ ...group })),
        projectGroupAssignments: {},
      };
    }
    const meta = JSON.parse(raw);
    // Migration from legacy structure { clients, projectsByClient }
    if(!meta.projects){
      const set = new Set();
      const pbc = meta.projectsByClient || {};
      Object.keys(pbc).forEach(cli => (pbc[cli]||[]).forEach(p => set.add(String(p))));
      meta.projects = Array.from(set).sort((a,b)=> a.localeCompare(b));
    }
    meta.projects = meta.projects || [];
    meta.commentShortcuts = meta.commentShortcuts || [];
    const normalizedGroups = normalizeProjectGroups(meta);
    return {
      projects: meta.projects,
      commentShortcuts: meta.commentShortcuts,
      projectGroups: normalizedGroups.groups,
      projectGroupAssignments: normalizedGroups.assignments,
    };
  }catch(e){
    console.error('Load meta error', e);
    return {
      projects: [],
      commentShortcuts: [],
      projectGroups: DEFAULT_PROJECT_GROUPS.map(group => ({ ...group })),
      projectGroupAssignments: {},
    };
  }
}
function saveMeta(meta){
  localStorage.setItem('ts:meta', JSON.stringify({
    projects: meta.projects||[],
    commentShortcuts: meta.commentShortcuts||[],
    projectGroups: meta.projectGroups||[],
    projectGroupAssignments: meta.projectGroupAssignments||{}
  }));
}
function ensureProject(project){
  const p = (project||'').trim(); if(!p) return;
  if(!state.meta.projects.includes(p)){
    state.meta.projects.push(p);
    state.meta.projects.sort((a,b)=> a.localeCompare(b));
    const group = state.meta.projectGroups.find(item => item.id === 'other') || state.meta.projectGroups[0];
    if(group) state.meta.projectGroupAssignments[p] = group.id;
    saveMeta(state.meta);
  }
}

function ensureCommentShortcut(shortcut){
  const s = (shortcut||'').trim(); if(!s) return;
  if(!state.meta.commentShortcuts.includes(s)){
    state.meta.commentShortcuts.push(s);
    state.meta.commentShortcuts.sort((a,b)=> a.localeCompare(b));
    saveMeta(state.meta);
  }
}

function makeId(){
  return Math.random().toString(36).slice(2,9);
}

function minutesToHHMM(min){
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m/60);
  const mm = m % 60;
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function hhmmToMinutes(str){
  if(!str) return 0;
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return 0;
  const h = parseInt(m[1],10); const mm = parseInt(m[2],10);
  return h*60 + mm;
}

function minutesToHHMMDay(m){
  const h = Math.floor(m/60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function nowHHMM(){
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function roundMinutesToNearestQuarter(minutes){
  const dayMinutes = 24 * 60;
  const normalized = ((minutes % dayMinutes) + dayMinutes) % dayMinutes;
  return Math.round(normalized / 15) * 15 % dayMinutes;
}

function nowRoundedHHMM(){
  return minutesToHHMMDay(roundMinutesToNearestQuarter(hhmmToMinutes(nowHHMM())));
}

function computeDurationMinutes(start, end){
  const sOk = /^\d{1,2}:\d{2}$/.test(start||'');
  const eOk = /^\d{1,2}:\d{2}$/.test(end||'');
  if(!sOk || !eOk) return 0;
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if(e >= s) return e - s;
  return (24*60 - s) + e; // overnight wrap
}

function visibleMinutesForDay(entries, e){
  // New rule: duration = from this start to the following task start (by time)
  const startOk = /^\d{1,2}:\d{2}$/.test(e.start||'');
  if(!startOk){
    // legacy minutes mode
    return (e.minutes||0);
  }
  const currM = hhmmToMinutes(e.start);
  const next = (entries||[])
    .filter(x => x.id !== e.id && /^\d{1,2}:\d{2}$/.test(x.start||''))
    .map(x => hhmmToMinutes(x.start))
    .filter(m => m > currM)
    .sort((a,b)=> a-b)[0];
  if(next === undefined) return 0;
  return next - currM;
}

function visibleMinutes(e){
  return visibleMinutesForDay(state.data.entries, e);
}

function hasStartConflict(entry){
  if(!entry || !/^\d{1,2}:\d{2}$/.test(entry.start || '')) return false;
  const entryMinutes = hhmmToMinutes(entry.start);
  return state.data.entries.some(other => (
    other.id !== entry.id &&
    /^\d{1,2}:\d{2}$/.test(other.start || '') &&
    hhmmToMinutes(other.start) === entryMinutes
  ));
}

function isLastStartConflict(entry){
  if(!hasStartConflict(entry)) return false;
  const entryMinutes = hhmmToMinutes(entry.start);
  const duplicates = state.data.entries.filter(other => (
    /^\d{1,2}:\d{2}$/.test(other.start || '') &&
    hhmmToMinutes(other.start) === entryMinutes
  ));
  return duplicates[duplicates.length - 1]?.id === entry.id;
}

// Simple, fast comment suggestions using only current day data
function getFrequentComments(limitDays = 30, maxItems = 20, forProject = null){
  const freq = new Map();

  // Only scan current day's entries for speed
  for(const e of state.data.entries){
    const c = (e.comment||'').trim();
    if(!c) continue;

    // If filtering by project, only include comments from that project
    if(forProject !== null){
      const entryProject = (e.project||'').trim();
      if(entryProject.toLowerCase() !== forProject.toLowerCase()) continue;
    }

    freq.set(c, (freq.get(c)||0)+1);
  }

  return Array.from(freq.entries())
    .sort((a,b)=> b[1]-a[1])
    .slice(0, maxItems)
    .map(([k])=>k);
}

// Update comment suggestions for a specific entry based on its project
function updateCommentSuggestions(entryId) {
  const entry = state.data.entries.find(e => e.id === entryId);
  if (!entry) return;

  const project = (entry.project || '').trim();
  if (!project) {
    // If no project, use global suggestions
    const commentDL = $('#commentList');
    if (commentDL) {
      commentDL.innerHTML = '';
      for (const c of getFrequentComments()) {
        const opt = document.createElement('option');
        opt.value = c;
        commentDL.appendChild(opt);
      }
    }
    return;
  }

  // Get project-specific suggestions
  const projectComments = getFrequentComments(30, 20, project);
  const commentDL = $('#commentList');
  if (commentDL) {
    commentDL.innerHTML = '';
    for (const c of projectComments) {
      const opt = document.createElement('option');
      opt.value = c;
      commentDL.appendChild(opt);
    }
  }
}

// -------- UI State --------
const state = {
  date: todayISO(),
  activeView: window.location.hash === '#statistiques' ? 'stats' : 'entry',
  summaryPeriodMode: 'week',
  data: { entries: [], projects: [] },
  meta: { projects: [], commentShortcuts: [], projectGroups: [], projectGroupAssignments: {} },
  tickHandle: null,
  focusedId: null,
  focusedField: null, // Track which field is focused: 'project', 'comment', 'start', or null
  suggestions: [],
  timePicker: { el: null, currentInput: null },
  rounding: {}, // ephemeral per-entry rounding (keyboard minutes): { [id]: { stage, lastDir, at } }
  roundingStart: {}, // per-entry rounding state for Start +/- buttons
  sortPending: false,
  sortDebounceHandle: null,
  sortPendingFocusId: null,
  sortPendingControlSelector: null,
  // Enhanced reordering tracking
  isImmediateSort: false,
  movementDirection: null, // 'up' or 'down'
  lastSortedEntry: null, // Track last moved entry for animation
  showMovementIndicators: true,
  ghostPlaceholder: null,
  ghostPlaceholderTimer: null,
};

// -------- Rendering --------
function updateDateContext(){
  const isToday = state.date === todayISO();
  const entryToolbar = $('.entry-toolbar');
  const status = $('#btnToday');
  const label = $('#dayStatusLabel');
  const datePicker = $('#datePicker');
  if(!entryToolbar || !status || !label || !datePicker) return;

  entryToolbar.classList.toggle('is-other-day', !isToday);
  status.classList.toggle('is-today', isToday);
  status.classList.toggle('is-other-day', !isToday);
  status.disabled = isToday;
  label.textContent = isToday ? 'Aujourd’hui' : 'Pas aujourd’hui · Revenir';
  status.title = isToday ? 'Vous saisissez la journée en cours' : 'Revenir à aujourd’hui';
  datePicker.title = isToday ? 'Journée en cours' : 'Attention : cette date n’est pas aujourd’hui';
}

function viewFromLocation(){
  return window.location.hash === '#statistiques' ? 'stats' : 'entry';
}

function setActiveView(view){
  const activeView = view === 'stats' ? 'stats' : 'entry';
  state.activeView = activeView;
  const isStats = activeView === 'stats';
  const entryView = $('#entryView');
  const statsView = $('#summarySection');
  const entryTab = $('#tabEntryView');
  const statsTab = $('#tabStatsView');
  if(!entryView || !statsView || !entryTab || !statsTab) return;

  entryView.hidden = isStats;
  statsView.hidden = !isStats;
  document.body.classList.toggle('is-stats-view', isStats);
  entryTab.setAttribute('aria-selected', String(!isStats));
  statsTab.setAttribute('aria-selected', String(isStats));
  entryTab.tabIndex = isStats ? -1 : 0;
  statsTab.tabIndex = isStats ? 0 : -1;
  if(isStats) updateSummaryUI();
  updateDateContext();
}

function navigateToView(view){
  const hash = view === 'stats' ? '#statistiques' : '#saisie';
  if(window.location.hash === hash){
    setActiveView(view);
  } else {
    window.location.hash = hash;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render(){
  updateDateContext();
  const list = $('#entryList');
  list.innerHTML = '';

  // project datalist (global list)
  const projectDL = $('#projectList'); projectDL.innerHTML = '';
  for(const p of state.meta.projects){ const opt = document.createElement('option'); opt.value = p; projectDL.appendChild(opt); }

  // Render quick-select project buttons dynamically
  renderQuickSelectButtons();

  // Render comment shortcut buttons dynamically
  renderCommentShortcutsButtons();

  // comments datalist is now handled dynamically by updateCommentSuggestions()

  const tmpl = document.getElementById('entryTemplate');
  state.data.entries.forEach((e, idx)=>{
    const node = tmpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = e.id;
    if(state.focusedId === e.id) node.classList.add('focused');
    const startConflict = hasStartConflict(e);
    if(startConflict) node.classList.add('has-start-conflict');
    if(isLastStartConflict(e)) node.classList.add('has-start-conflict-label');
    // Style "Pause" entries differently (case-insensitive match on project)
    const isPause = ((e.project||'').trim().toLowerCase() === 'pause');
    if(isPause) node.classList.add('pause');

    const inputProject = $('.input-project', node);
    const inputComment = $('.input-comment', node);
    const inputStart = $('.input-start', node);
    const btnStartInc = $('.btn-start-inc', node);
    const btnStartDec = $('.btn-start-dec', node);
    // no end buttons
    // duration +/- buttons removed
    const btnDel = $('.btn-del', node);

    inputProject.value = e.project || '';
    inputComment.value = e.comment || '';
    inputStart.value = e.start || '';
    inputStart.setAttribute('aria-invalid', startConflict ? 'true' : 'false');
    inputStart.title = startConflict ? 'Deux entrées ont la même heure de début. Modifiez-en une.' : '';
    const minsEl = $('.duration-min', node);
    if(minsEl) minsEl.textContent = minutesToHHMM(visibleMinutes(e));

    // no running visual (timer removed)

    // Events
    // Project typing
    inputProject.addEventListener('input', ()=>{
      e.project = inputProject.value;
      // If no start time yet, set it to now when user begins typing
      if(!e.start){
        e.start = nowRoundedHHMM();
        ensureUniqueStart(e);
        const row = findRow(e.id);
        if(row){ $('.input-start', row).value = e.start; }
      }
      persist();
      // Toggle pause styling live while typing
      const row = findRow(e.id);
      if(row){
        const pauseNow = ((e.project||'').trim().toLowerCase() === 'pause');
        row.classList.toggle('pause', pauseNow);
      }
      // Update duration label (durations depend on following start)
      const mins = visibleMinutes(e);
      const minsEl = $('.duration-min', findRow(e.id)); if(minsEl) minsEl.textContent = minutesToHHMM(mins);
      // Update comment suggestions based on current project
      updateCommentSuggestions(e.id);
      updateSummaryUI();
    });
    // Project change
    inputProject.addEventListener('change', ()=>{
      e.project = inputProject.value.trim();
      // Back-compat legacy per-day project list
      if(e.project){
        const set = new Set(state.data.projects || []); set.add(e.project); state.data.projects = [...set];
      }
      if(e.project) ensureProject(e.project);
      persist();
      // Ensure pause styling aligns with final value
      const row = findRow(e.id);
      if(row){ row.classList.toggle('pause', ((e.project||'').trim().toLowerCase() === 'pause')); }
      // Update comment suggestions based on final project value
      updateCommentSuggestions(e.id);
      updateSummaryUI();
      // After choosing a project, move cursor to the corresponding comment field
      inputComment?.focus();
    });

    // When focusing project, ensure global list is available
    inputProject.addEventListener('focus', ()=>{
      // nothing special; datalist is global
    });

    // Show time picker on click/focus and set default current time if empty
    const ensureUIRowUpdate = ()=>{
      const row = findRow(e.id);
      if(row){
        const mins = visibleMinutes(e);
        const minsEl = $('.duration-min', row); if(minsEl) minsEl.textContent = minutesToHHMM(mins);
        $('.input-start', row).value = e.start || '';
        // no end field
      }
    };
    inputStart.addEventListener('focus', ()=>{
      if(!e.start){
        e.start = nowRoundedHHMM();
        ensureUniqueStart(e);
        delete state.rounding[e.id]; delete state.roundingStart[e.id];
        resortEntriesWithGhost(e.id);
        openTimePickerForEntry(e.id);
        return;
      }
      openTimePickerFor(inputStart);
    });
    inputStart.addEventListener('click', ()=>{
      if(!e.start){
        e.start = nowRoundedHHMM();
        ensureUniqueStart(e);
        delete state.rounding[e.id]; delete state.roundingStart[e.id];
        resortEntriesWithGhost(e.id);
        openTimePickerForEntry(e.id);
        return;
      }
      openTimePickerFor(inputStart);
    });
    // no inputEnd

    // Start change -> recompute durations
    inputStart.addEventListener('change', ()=>{
      const v = inputStart.value.trim();
      if(!/^\d{1,2}:\d{2}$/.test(v)){ inputStart.value = e.start || ''; return; }
      const prevStart = e.start;
      e.start = v;
      let preferredDir = 1;
      if(/^\d{1,2}:\d{2}$/.test(prevStart || '') && /^\d{1,2}:\d{2}$/.test(e.start || '')){
        const prevMinutes = hhmmToMinutes(prevStart);
        const newMinutes = hhmmToMinutes(e.start);
        if(newMinutes < prevMinutes){
          preferredDir = -1;
        } else if(newMinutes > prevMinutes){
          preferredDir = 1;
        }
      }
      ensureUniqueStart(e, preferredDir);
      inputStart.value = e.start;
      // Reset rounding stages for this entry after manual change
      delete state.rounding[e.id];
      delete state.roundingStart[e.id];
      cancelDeferredSort();
      resortEntriesWithGhost(e.id);
    });
    // no inputEnd change
    // no custom suggestion popover for project

    inputComment.addEventListener('focus', ()=>{
      // Update comment suggestions when focusing on comment field
      updateCommentSuggestions(e.id);
    });

    inputComment.addEventListener('input', ()=>{
      e.comment = inputComment.value;
      if(!e.start){
        e.start = nowRoundedHHMM();
        ensureUniqueStart(e);
        const row = findRow(e.id);
        if(row){ $('.input-start', row).value = e.start; }
      }
      persist();
      const mins = visibleMinutes(e);
      const minsEl = $('.duration-min', findRow(e.id)); if(minsEl) minsEl.textContent = minutesToHHMM(mins);
      // native datalist provides suggestions; no custom popover
      updateSummaryUI();
    });


    // Duration is computed; no manual change handler

    // duration +/- buttons removed
    btnStartInc.addEventListener('click', ()=> adjustStart(e.id, +15));
    btnStartDec.addEventListener('click', ()=> adjustStart(e.id, -15));
    btnDel.addEventListener('click', ()=> removeEntry(e.id));

    // no custom suggestion click handlers

    // Row focus tracking
    node.addEventListener('click', ()=> setFocused(e.id));
    inputProject.addEventListener('focus', ()=> setFocused(e.id, 'project'));
    inputComment.addEventListener('focus', ()=> setFocused(e.id, 'comment'));
    inputStart.addEventListener('focus', ()=> setFocused(e.id, 'start'));

    list.appendChild(node);
  });
  renderGhostPlaceholder(list);
  updateDailyRecapUI();
}

function captureGhostPlaceholderSnapshot(entryId){
  const list = $('#entryList');
  if(!list) return null;
  const row = findRow(entryId);
  if(!row) return null;
  const entries = Array.from(list.querySelectorAll('.entry'));
  const index = entries.indexOf(row);
  if(index === -1) return null;
  const rect = row.getBoundingClientRect();
  return {
    index,
    height: rect.height || row.offsetHeight || 0,
  };
}

function renderGhostPlaceholder(list){
  if(!list) return;
  const snapshot = state.ghostPlaceholder;
  if(!snapshot) return;
  state.ghostPlaceholder = null;

  const placeholder = document.createElement('div');
  placeholder.className = 'ghost-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  const minHeight = Math.max(56, Math.round(snapshot.height || 0));
  placeholder.style.height = `${minHeight}px`;
  placeholder.style.minHeight = `${minHeight}px`;
  placeholder.innerHTML = `<div class="ghost-pill">Position précédente</div>`;

  const entries = Array.from(list.querySelectorAll('.entry'));
  const reference = entries[snapshot.index];
  if(reference && reference.parentNode){
    reference.parentNode.insertBefore(placeholder, reference);
  } else {
    list.appendChild(placeholder);
  }

  requestAnimationFrame(()=> placeholder.classList.add('visible'));
  if(state.ghostPlaceholderTimer){
    clearTimeout(state.ghostPlaceholderTimer);
    state.ghostPlaceholderTimer = null;
  }
  state.ghostPlaceholderTimer = setTimeout(()=>{
    placeholder.classList.add('fade-out');
    setTimeout(()=> placeholder.remove(), 250);
    state.ghostPlaceholderTimer = null;
  }, 1200);
}

function resortEntriesWithGhost(entryId){
  const snapshot = entryId ? captureGhostPlaceholderSnapshot(entryId) : null;
  sortEntriesByStartInPlace();
  persist();
  if(snapshot && entryId){
    const newIndex = state.data.entries.findIndex(entry => entry.id === entryId);
    if(newIndex !== -1 && newIndex !== snapshot.index){
      state.ghostPlaceholder = snapshot;
    }
  }
  render();
  updateSummaryUI();
}

function openTimePickerForEntry(entryId){
  const row = findRow(entryId);
  const input = row ? $('.input-start', row) : null;
  if(input) openTimePickerFor(input);
}

// No custom popover suggestions; rely on native datalist

function addEntry(prefill={}){
  const targetDate = state.date;
  const isToday = targetDate === todayISO();
  const entry = {
    id: makeId(),
    project: prefill.project || '',
    comment: prefill.comment || '',
    minutes: prefill.minutes ?? 0,
    start: prefill.start !== undefined
      ? prefill.start
      : (isToday ? nowRoundedHHMM() : ''),
  };
  state.data.entries.push(entry);
  ensureUniqueStart(entry);
  sortEntriesByStartInPlace();
  persist();
  render();
  setFocused(entry.id);
  // Focus project right away for quick typing
  const row = findRow(entry.id); if(row){ $('.input-project', row)?.focus(); }
}

// Add a single empty entry (no start time yet). Used when a day has no entries.
function addEmptyEntry(){
  const entry = {
    id: makeId(),
    project: '',
    comment: '',
    minutes: 0,
    start: '',
  };
  state.data.entries.push(entry);
  persist();
  render(); updateSummaryUI();
  setFocused(entry.id);
}

function removeEntry(id){
  const i = state.data.entries.findIndex(e=>e.id===id);
  if(i>=0){
    const entry = state.data.entries[i];
    state.data.entries.splice(i,1);
    persist();
    render();
    updateSummaryUI();
  }
}

// duplicate feature removed

function scheduleDeferredSort(focusId, controlSelector, isImmediate = false){
  if(state.sortDebounceHandle){
    clearTimeout(state.sortDebounceHandle);
  }
  
  if(isImmediate){
    // Immediate sorting for quick adjustments
    state.isImmediateSort = true;
    performEnhancedSort(focusId, controlSelector);
  } else {
    // Debounced sorting for manual typing
    state.sortDebounceHandle = setTimeout(()=> flushDeferredSort(), START_SORT_DEBOUNCE_MS);
    state.sortPending = true;
    if(focusId){
      state.sortPendingFocusId = focusId;
    }
    if(controlSelector){
      state.sortPendingControlSelector = controlSelector;
    }
  }
}

function cancelDeferredSort(){
  if(state.sortDebounceHandle){
    clearTimeout(state.sortDebounceHandle);
    state.sortDebounceHandle = null;
  }
  state.sortPending = false;
  state.sortPendingFocusId = null;
  state.sortPendingControlSelector = null;
  state.isImmediateSort = false;
}

function performEnhancedSort(focusId, controlSelector, movementDirection = null){
  const entryList = $('#entryList');
  const placeholderSnapshot = focusId ? captureGhostPlaceholderSnapshot(focusId) : null;
  
  // Show visual feedback during sorting
  if(entryList){
    entryList.classList.add('sorting');
  }
  
  // Track the entry being moved for animation
  if(focusId && movementDirection){
    state.movementDirection = movementDirection;
    state.lastSortedEntry = focusId;
  }
  
  // Perform the actual sorting
  sortEntriesByStartInPlace();
  persist();
  if(placeholderSnapshot && focusId){
    const newIndex = state.data.entries.findIndex(entry => entry.id === focusId);
    if(newIndex !== -1 && newIndex !== placeholderSnapshot.index){
      state.ghostPlaceholder = placeholderSnapshot;
    }
  }
  
  // Render with animation
  render();
  updateSummaryUI();
  
  // Clean up visual feedback
  if(entryList){
    setTimeout(() => {
      entryList.classList.remove('sorting');
    }, 300);
  }
  
  // Enhanced focus management
  if(focusId){
    const row = findRow(focusId);
    if(row){
      // Add focus animation
      row.classList.add('focused-after-sort');
      
      // Focus the appropriate control
      if(controlSelector){
        const btn = row.querySelector(controlSelector);
        btn?.focus();
      }
      
      // Remove animation class after animation completes
      setTimeout(() => {
        row.classList.remove('focused-after-sort');
      }, 800);
    }
  }
}

function flushDeferredSort(){
  if(state.sortDebounceHandle){
    clearTimeout(state.sortDebounceHandle);
    state.sortDebounceHandle = null;
  }
  if(!state.sortPending) return;
  state.sortPending = false;
  const focusId = state.sortPendingFocusId;
  const controlSelector = state.sortPendingControlSelector;
  state.sortPendingFocusId = null;
  state.sortPendingControlSelector = null;
  const placeholderSnapshot = focusId ? captureGhostPlaceholderSnapshot(focusId) : null;
  
  // Add visual feedback during reordering
  const entryList = $('#entryList');
  if(entryList){
    entryList.classList.add('sorting');
  }
  
  // Small delay to show the sorting state
  setTimeout(() => {
    sortEntriesByStartInPlace();
    persist();
    if(placeholderSnapshot && focusId){
      const newIndex = state.data.entries.findIndex(entry => entry.id === focusId);
      if(newIndex !== -1 && newIndex !== placeholderSnapshot.index){
        state.ghostPlaceholder = placeholderSnapshot;
      }
    }
    render();
    updateSummaryUI();
    
    if(entryList){
      entryList.classList.remove('sorting');
    }
    
    if(focusId){
      const row = findRow(focusId);
      // Keep the same row highlighted/focused after resort
      if(row){
        row.classList.add('focused');
        if(controlSelector){
          const btn = row.querySelector(controlSelector);
          btn?.focus();
        }
      }
    }
  }, 150);
}

function adjustMinutes(id, delta){
  // Repurpose +/- to shift the start time of the focused entry
  adjustStart(id, delta);
}

function adjustStart(id, delta){
  const e = state.data.entries.find(x=>x.id===id); if(!e) return;
  const dir = delta >= 0 ? 1 : -1;
  const day = 24*60;
  let startMCurrent = e.start ? hhmmToMinutes(e.start) : hhmmToMinutes(nowRoundedHHMM());
  let startMNew = startMCurrent + dir * 15;
  startMNew = ((startMNew % day) + day) % day;
  e.start = minutesToHHMMDay(startMNew);
  ensureUniqueStart(e, dir);
  delete state.roundingStart[id];
  persist();
  
  // Determine movement direction for immediate visual feedback
  const newIndex = state.data.entries.findIndex(entry => entry.id === e.id);
  // For immediate feedback, we'll sort and render immediately for +/- button clicks
  performEnhancedSort(e.id, delta >= 0 ? '.btn-start-inc' : '.btn-start-dec', dir > 0 ? 'down' : 'up');
}

// removed adjustEnd and closeOpenTasksNow (no end time in the model)

function ensureUniqueStart(entry, preferredDir = 1){
  return hasStartConflict(entry);
}

// sort entries in place by start time descending (newest first, invalid/empty start goes first, keep relative order)
function sortEntriesByStartInPlace(){
  const withIdx = state.data.entries.map((e, i)=>({e,i}));
  withIdx.sort((a,b)=>{
    const as = /^\d{1,2}:\d{2}$/.test(a.e.start||'');
    const bs = /^\d{1,2}:\d{2}$/.test(b.e.start||'');
    if(as && bs){
      const da = hhmmToMinutes(a.e.start);
      const db = hhmmToMinutes(b.e.start);
      if(da !== db) return db - da;
      return a.i - b.i; // stable for identical starts
    }
    if(as && !bs) return 1;
    if(!as && bs) return -1;
    return a.i - b.i;
  });
  state.data.entries = withIdx.map(x=>x.e);
}

// timer feature removed (toggleTimer/stopAllTimers)

function setFocused(id, field = null){
  state.focusedId = id;
  state.focusedField = field;
  // Update comment suggestions when an entry gets focused
  if(id) updateCommentSuggestions(id);
}
function findRow(id){ return $(`.entry[data-id="${id}"]`); }

function persist(){
  saveDay(state.date, state.data);
}

// -------- Summary --------
function groupEntriesByProject(entries){
  const acc = new Map();
  for(const e of entries){
    // Skip pause activities in the recap
    const isPause = ((e.project||'').trim().toLowerCase() === 'pause');
    if(isPause) continue;

    const project = (e.project||'Sans projet').trim() || 'Sans projet';
    acc.set(project, (acc.get(project)||0) + visibleMinutesForDay(entries, e));
  }
  return Array.from(acc.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
}

function groupByProject(){
  return groupEntriesByProject(state.data.entries);
}

function updateDailyRecapUI(){
  const list = $('#dailyRecapList');
  const totalElement = $('#dailyRecapTotal');
  const empty = $('#dailyRecapEmpty');
  if(!list || !totalElement || !empty) return;

  const rows = groupByProject().filter(([, minutes]) => minutes > 0);
  const total = rows.reduce((sum, [, minutes]) => sum + minutes, 0);
  list.innerHTML = '';

  for(const [project, minutes] of rows){
    const row = document.createElement('div');
    row.className = 'daily-recap-row';
    row.style.setProperty('--project-color', projectColor(project));
    row.setAttribute('role', 'listitem');

    const projectName = document.createElement('div');
    projectName.className = 'daily-recap-project';
    projectName.textContent = project;
    const duration = document.createElement('span');
    duration.className = 'daily-recap-duration';
    duration.textContent = minutesToHHMM(minutes);
    const copyButton = document.createElement('button');
    copyButton.className = 'secondary daily-recap-copy';
    copyButton.type = 'button';
    copyButton.textContent = 'Copier les commentaires';
    copyButton.title = `Copier les commentaires de ${project}`;
    copyButton.addEventListener('click', ()=> copyProjectComments(project, copyButton));
    row.append(projectName, duration, copyButton);
    list.appendChild(row);
  }

  totalElement.textContent = minutesToHHMM(total);
  empty.hidden = rows.length > 0;
}

function storedDaysInRange(startDate, endDate){
  const dates = new Set();
  for(let i = 0; i < localStorage.length; i++){
    const key = localStorage.key(i) || '';
    const match = key.match(/^ts:(\d{4}-\d{2}-\d{2})$/);
    if(match && match[1] >= startDate && match[1] <= endDate){
      dates.add(match[1]);
    }
  }
  if(state.date >= startDate && state.date <= endDate){
    dates.add(state.date);
  }
  return Array.from(dates).sort().map(date => ({
    date,
    data: date === state.date ? state.data : loadDay(date),
  }));
}

function summarizePeriod(startDate, endDate){
  const totals = new Map();
  let dayCount = 0;

  for(const day of storedDaysInRange(startDate, endDate)){
    const entries = day.data.entries || [];
    const activeEntries = entries.filter(e => ((e.project||'').trim().toLowerCase() !== 'pause'));
    if(activeEntries.some(e => e.start || e.project || e.comment || e.minutes)) dayCount += 1;

    for(const [project, minutes] of groupEntriesByProject(entries)){
      totals.set(project, (totals.get(project)||0) + minutes);
    }
  }

  const rows = Array.from(totals.entries())
    .filter(([, minutes]) => minutes > 0)
    .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = rows.reduce((sum, [, minutes]) => sum + minutes, 0);
  return { rows, total, dayCount };
}

function formatSummaryDate(dateStr){
  const date = isoToLocalDate(dateStr);
  return new Intl.DateTimeFormat('fr-CH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function summaryPeriodModeForRange(startDate, endDate){
  const week = weekRangeISO(startDate);
  if(week.start === startDate && week.end === endDate) return 'week';
  const month = monthRangeISO(startDate);
  if(month.start === startDate && month.end === endDate) return 'month';
  return 'custom';
}

function formatWeekPeriodLabel(startDate, endDate){
  const start = isoToLocalDate(startDate);
  const end = isoToLocalDate(endDate);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();
  const startOptions = sameMonth
    ? { day: 'numeric' }
    : { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) };
  const endOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  const startLabel = new Intl.DateTimeFormat('fr-CH', startOptions).format(start);
  const endLabel = new Intl.DateTimeFormat('fr-CH', endOptions).format(end);
  return `${startLabel} – ${endLabel}`;
}

function updateSummaryPeriodControls(startDate, endDate){
  const weekButton = $('#btnPeriodWeek');
  const monthButton = $('#btnPeriodMonth');
  const previousButton = $('#btnPreviousPeriod');
  const nextButton = $('#btnNextPeriod');
  const label = $('#summaryPeriodLabel');
  if(!weekButton || !monthButton || !previousButton || !nextButton || !label) return;

  const mode = summaryPeriodModeForRange(startDate, endDate);
  state.summaryPeriodMode = mode;
  weekButton.setAttribute('aria-pressed', String(mode === 'week'));
  monthButton.setAttribute('aria-pressed', String(mode === 'month'));
  previousButton.disabled = mode === 'custom';
  nextButton.disabled = mode === 'custom';
  previousButton.title = mode === 'month' ? 'Mois précédent' : 'Semaine précédente';
  nextButton.title = mode === 'month' ? 'Mois suivant' : 'Semaine suivante';
  previousButton.setAttribute('aria-label', previousButton.title);
  nextButton.setAttribute('aria-label', nextButton.title);

  if(mode === 'week'){
    label.textContent = formatWeekPeriodLabel(startDate, endDate);
  } else if(mode === 'month'){
    label.textContent = new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric' })
      .format(isoToLocalDate(startDate));
  } else {
    label.textContent = 'Période personnalisée';
  }
}

function setSummaryPeriod(mode, anchorDate = todayISO()){
  const range = mode === 'month' ? monthRangeISO(anchorDate) : weekRangeISO(anchorDate);
  $('#summaryStartDate').value = range.start;
  $('#summaryEndDate').value = range.end;
  const customPeriod = $('#summaryCustomPeriod');
  if(customPeriod) customPeriod.open = false;
  state.summaryPeriodMode = mode;
  updateSummaryUI();
}

function shiftSummaryPeriod(delta){
  if(!['week', 'month'].includes(state.summaryPeriodMode)) return;
  const startDate = $('#summaryStartDate').value;
  const anchor = isoToLocalDate(startDate);
  if(state.summaryPeriodMode === 'month'){
    anchor.setMonth(anchor.getMonth() + delta, 1);
  } else {
    anchor.setDate(anchor.getDate() + (delta * 7));
  }
  setSummaryPeriod(state.summaryPeriodMode, dateToISO(anchor));
}

// running minutes removed (no live timers)

function updateSummaryUI(){
  updateDailyRecapUI();
  const list = $('#summaryList'); if(!list) return;
  const groupList = $('#summaryGroupList');
  const startInput = $('#summaryStartDate');
  const endInput = $('#summaryEndDate');
  const error = $('#summaryRangeError');
  const empty = $('#summaryEmpty');
  const currentWeek = currentWeekRangeISO();
  if(!startInput.value) startInput.value = currentWeek.start;
  if(!endInput.value) endInput.value = currentWeek.end;

  const startDate = startInput.value;
  const endDate = endInput.value;
  updateSummaryPeriodControls(startDate, endDate);
  list.innerHTML = '';
  if(groupList) groupList.innerHTML = '';
  const validDate = /^\d{4}-\d{2}-\d{2}$/;
  if(!validDate.test(startDate) || !validDate.test(endDate) || startDate > endDate){
    error.textContent = 'La date de début doit être antérieure ou égale à la date de fin.';
    error.hidden = false;
    empty.hidden = true;
    $('#summaryTotal').textContent = '00:00';
    $('#summaryProjectCount').textContent = '0';
    $('#summaryDayCount').textContent = '0';
    $('#summaryRangeLabel').textContent = '';
    $$('.summary-breakdown', $('#summarySection')).forEach(section => { section.hidden = true; });
    return;
  }

  error.hidden = true;
  const { rows, total, dayCount } = summarizePeriod(startDate, endDate);
  const groupTotals = new Map();
  for(const [project, minutes] of rows){
    const group = projectGroup(project);
    const current = groupTotals.get(group.id) || { group, minutes: 0 };
    current.minutes += minutes;
    groupTotals.set(group.id, current);
  }
  const groupOrder = new Map(state.meta.projectGroups.map((group, index) => [group.id, index]));
  const groupedRows = Array.from(groupTotals.values()).sort((a, b) =>
    (b.minutes - a.minutes) || ((groupOrder.get(a.group.id) ?? 0) - (groupOrder.get(b.group.id) ?? 0))
  );
  for(const { group, minutes } of groupedRows){
    const percentage = total ? (minutes / total) * 100 : 0;
    const percentageText = `${new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 1 }).format(percentage)} %`;
    const durationText = minutesToHHMM(minutes);
    const row = document.createElement('div');
    row.className = 'summary-group-row';
    row.style.setProperty('--project-color', group.color);
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', `${group.name} : ${percentageText}, ${durationText}`);

    const heading = document.createElement('div');
    heading.className = 'summary-group-heading';
    const name = document.createElement('strong');
    name.className = 'summary-group-name';
    name.textContent = group.name;
    const metrics = document.createElement('div');
    metrics.className = 'summary-group-metrics';
    const percentageLabel = document.createElement('span');
    percentageLabel.className = 'summary-group-percentage';
    percentageLabel.textContent = percentageText;
    const duration = document.createElement('span');
    duration.className = 'summary-group-duration';
    duration.textContent = durationText;
    metrics.append(percentageLabel, duration);
    heading.append(name, metrics);

    const bar = document.createElement('div');
    bar.className = 'summary-bar';
    bar.setAttribute('aria-hidden', 'true');
    const barFill = document.createElement('span');
    barFill.className = 'summary-bar-fill';
    barFill.style.width = `${percentage}%`;
    bar.appendChild(barFill);
    row.append(heading, bar);
    groupList?.appendChild(row);
  }
  for(const [project, minutes] of rows){
    const div = document.createElement('div');
    div.className = 'summary-row';
    div.style.setProperty('--project-color', projectColor(project));
    div.setAttribute('role', 'listitem');

    const projectBlock = document.createElement('div');
    projectBlock.className = 'summary-project';
    const projectHeading = document.createElement('div');
    projectHeading.className = 'summary-project-heading';
    const projectName = document.createElement('div');
    projectName.className = 'summary-project-name';
    projectName.textContent = project;
    const groupName = document.createElement('span');
    groupName.className = 'summary-project-group';
    groupName.textContent = projectGroup(project).name;
    projectHeading.append(projectName, groupName);
    const bar = document.createElement('div');
    bar.className = 'summary-bar';
    bar.setAttribute('aria-hidden', 'true');
    const barFill = document.createElement('span');
    barFill.className = 'summary-bar-fill';
    const percentage = total ? (minutes / total) * 100 : 0;
    barFill.style.width = `${percentage}%`;
    bar.appendChild(barFill);
    projectBlock.append(projectHeading, bar);

    const meta = document.createElement('div');
    meta.className = 'summary-row-meta';
    const duration = document.createElement('span');
    duration.className = 'summary-duration';
    duration.textContent = minutesToHHMM(minutes);
    duration.title = `Durée : ${duration.textContent}`;
    const percentageLabel = document.createElement('span');
    percentageLabel.className = 'summary-percentage';
    percentageLabel.textContent = `${new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 1 }).format(percentage)} %`;
    percentageLabel.title = `Part du temps : ${percentageLabel.textContent}`;
    const copyButton = document.createElement('button');
    copyButton.className = 'secondary btn-copy-comments';
    copyButton.type = 'button';
    copyButton.title = 'Copier les commentaires de ce projet sur la période';
    copyButton.textContent = 'Copier les commentaires';
    copyButton.addEventListener('click', ()=> copyProjectComments(project, copyButton, startDate, endDate));
    meta.append(percentageLabel, duration, copyButton);
    div.append(projectBlock, meta);
    list.appendChild(div);
  }
  empty.hidden = rows.length > 0;
  $$('.summary-breakdown', $('#summarySection')).forEach(section => { section.hidden = rows.length === 0; });
  $('#summaryTotal').textContent = minutesToHHMM(total);
  $('#summaryProjectCount').textContent = String(rows.length);
  $('#summaryDayCount').textContent = String(dayCount);
  $('#summaryRangeLabel').textContent = startDate === endDate
    ? formatSummaryDate(startDate)
    : `Du ${formatSummaryDate(startDate)} au ${formatSummaryDate(endDate)}`;
}

function escapeHtml(s){
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return (s||'').replace(/[&<>"]/g, (c)=> map[c] || c);
}

// -------- CSV Export --------
function exportCSV(){
  // Columns: Date, Projet, Commentaire, Début, Fin
  const lines = [ ['Date','Projet','Commentaire','Début','Fin'] ];

  // Sort all entries by start time for proper end time calculation
  const sortedEntries = [...state.data.entries].sort((a, b) => {
    const aHasStart = /^\d{1,2}:\d{2}$/.test(a.start || '');
    const bHasStart = /^\d{1,2}:\d{2}$/.test(b.start || '');
    if (aHasStart && bHasStart) {
      return hhmmToMinutes(a.start) - hhmmToMinutes(b.start);
    }
    if (aHasStart && !bHasStart) return -1;
    if (!aHasStart && bHasStart) return 1;
    return 0;
  });

  // Filter out pause activities for export, but keep them for end time calculation
  const nonPauseEntries = sortedEntries.filter(e => {
    const isPause = ((e.project||'').trim().toLowerCase() === 'pause');
    return !isPause;
  });

  for(let i = 0; i < nonPauseEntries.length; i++){
    const e = nonPauseEntries[i];
    let endTime = '';

    // Find the next activity (including pauses) in the sorted list to calculate end time
    const currentIndex = sortedEntries.indexOf(e);
    if(currentIndex >= 0 && currentIndex < sortedEntries.length - 1){
      const nextEntry = sortedEntries[currentIndex + 1];
      if(/^\d{1,2}:\d{2}$/.test(nextEntry.start || '')){
        endTime = nextEntry.start;
      }
    }

    lines.push([
      state.date,
      e.project||'',
      e.comment||'',
      e.start||'',
      endTime
    ]);
  }

  // Summary lines (excluding pauses)
  lines.push([]);
  lines.push(['Projet','Total minutes','Total HH:MM']);
  const nonPauseGroups = groupByProject().filter(([project]) =>
    project.toLowerCase() !== 'pause'
  );
  for(const [project, minutes] of nonPauseGroups){
    lines.push([ project, String(minutes), minutesToHHMM(minutes) ]);
  }

  const csv = lines.map(row => row.map(cell => '"'+String(cell).replace(/"/g,'""')+'"').join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `timesheet_${state.date}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function copyToExcel(){
  // Sort all entries by start time for proper end time calculation
  const sortedEntries = [...state.data.entries].sort((a, b) => {
    const aHasStart = /^\d{1,2}:\d{2}$/.test(a.start || '');
    const bHasStart = /^\d{1,2}:\d{2}$/.test(b.start || '');
    if (aHasStart && bHasStart) {
      return hhmmToMinutes(a.start) - hhmmToMinutes(b.start);
    }
    if (aHasStart && !bHasStart) return -1;
    if (!aHasStart && bHasStart) return 1;
    return 0;
  });

  // Filter out pause activities for export, but keep them for end time calculation
  const nonPauseEntries = sortedEntries.filter(e => {
    const isPause = ((e.project||'').trim().toLowerCase() === 'pause');
    return !isPause;
  });

  const lines = [];
  for(let i = 0; i < nonPauseEntries.length; i++){
    const e = nonPauseEntries[i];
    let endTime = '';

    // Find the next activity (including pauses) in the sorted list to calculate end time
    const currentIndex = sortedEntries.indexOf(e);
    if(currentIndex >= 0 && currentIndex < sortedEntries.length - 1){
      const nextEntry = sortedEntries[currentIndex + 1];
      if(/^\d{1,2}:\d{2}$/.test(nextEntry.start || '')){
        endTime = nextEntry.start;
      }
    }

    lines.push([
      state.date,
      e.project||'',
      e.comment||'',
      e.start||'',
      endTime
    ]);
  }

  // Format for Excel: tab-separated values (better than semicolon-separated for international Excel)
  const excelData = lines.map(row => row.join('\t')).join('\n');
  copyText(excelData);
  
  // Show feedback to user
  const btn = $('#btnExport');
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = 'Copié !';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 1500);
  }
}

function exportFullYearCSV(){
  const currentYear = new Date().getFullYear();
  const lines = [ ['Date','Projet','Commentaire','Début','Fin'] ];

  // Collect all entries from all days of the current year
  const allEntries = [];
  for(let month = 0; month < 12; month++){
    for(let day = 1; day <= 31; day++){
      const dateStr = `${currentYear}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const dayData = loadDay(dateStr);
      if(dayData.entries && dayData.entries.length > 0){
        dayData.entries.forEach(entry => {
          allEntries.push({
            date: dateStr,
            ...entry
          });
        });
      }
    }
  }

  // Sort all entries by date and start time
  allEntries.sort((a, b) => {
    if(a.date !== b.date) return a.date.localeCompare(b.date);
    const aHasStart = /^\d{1,2}:\d{2}$/.test(a.start || '');
    const bHasStart = /^\d{1,2}:\d{2}$/.test(b.start || '');
    if (aHasStart && bHasStart) {
      return hhmmToMinutes(a.start) - hhmmToMinutes(b.start);
    }
    if (aHasStart && !bHasStart) return -1;
    if (!aHasStart && bHasStart) return 1;
    return 0;
  });

  // Group by date for end time calculation
  const entriesByDate = {};
  allEntries.forEach(entry => {
    if(!entriesByDate[entry.date]) entriesByDate[entry.date] = [];
    entriesByDate[entry.date].push(entry);
  });

  // Process each date's entries
  Object.keys(entriesByDate).sort().forEach(date => {
    const dayEntries = entriesByDate[date];
    // Sort entries within the day
    dayEntries.sort((a, b) => {
      const aHasStart = /^\d{1,2}:\d{2}$/.test(a.start || '');
      const bHasStart = /^\d{1,2}:\d{2}$/.test(b.start || '');
      if (aHasStart && bHasStart) {
        return hhmmToMinutes(a.start) - hhmmToMinutes(b.start);
      }
      if (aHasStart && !bHasStart) return -1;
      if (!aHasStart && bHasStart) return 1;
      return 0;
    });

    // Filter out pause activities for export, but keep them for end time calculation
    const nonPauseEntries = dayEntries.filter(e => {
      const isPause = ((e.project||'').trim().toLowerCase() === 'pause');
      return !isPause;
    });

    for(let i = 0; i < nonPauseEntries.length; i++){
      const e = nonPauseEntries[i];
      let endTime = '';

      // Find the next activity (including pauses) in the sorted list to calculate end time
      const currentIndex = dayEntries.indexOf(e);
      if(currentIndex >= 0 && currentIndex < dayEntries.length - 1){
        const nextEntry = dayEntries[currentIndex + 1];
        if(/^\d{1,2}:\d{2}$/.test(nextEntry.start || '')){
          endTime = nextEntry.start;
        }
      }

      lines.push([
        e.date,
        e.project||'',
        e.comment||'',
        e.start||'',
        endTime
      ]);
    }
  });

  // Summary lines (excluding pauses) for the entire year
  lines.push([]);
  lines.push(['Projet','Total minutes','Total HH:MM']);
  const yearGroups = new Map();
  allEntries.forEach(e => {
    // Skip pause activities in the recap
    const isPause = ((e.project||'').trim().toLowerCase() === 'pause');
    if(isPause) return;

    const project = (e.project||'Sans projet').trim() || 'Sans projet';
    const key = project;
    // Calculate duration for each entry
    const dayEntries = entriesByDate[e.date];
    const currentIndex = dayEntries.indexOf(e);
    let duration = 0;
    if(/^\d{1,2}:\d{2}$/.test(e.start || '')){
      const next = dayEntries.slice(currentIndex + 1).find(x => /^\d{1,2}:\d{2}$/.test(x.start || ''));
      if(next){
        duration = hhmmToMinutes(next.start) - hhmmToMinutes(e.start);
      }
    }
    yearGroups.set(key, (yearGroups.get(key)||0) + duration);
  });
  Array.from(yearGroups.entries()).sort((a,b)=> a[0].localeCompare(b[0])).forEach(([project, minutes]) => {
    lines.push([ project, String(minutes), minutesToHHMM(minutes) ]);
  });

  const csv = lines.map(row => row.map(cell => '"'+String(cell).replace(/"/g,'""')+'"').join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `timesheet_${currentYear}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// -------- Keyboard Shortcuts --------
function handleGlobalKeys(ev){
  if(state.activeView !== 'entry') return;
  const tag = (ev.target && ev.target.tagName) || '';
  const typing = ['INPUT','TEXTAREA'].includes(tag);
  const key = ev.key.toLowerCase();

  // Enter: no longer adds a new task

  // One-hand friendly shortcuts
  if(!typing && key === 'a'){ ev.preventDefault(); addEntry(); return; }

  if(!typing && (key === 'j' || ev.key === 'ArrowDown')){
    ev.preventDefault(); moveFocus(1); return;
  }
  if(!typing && (key === 'k' || ev.key === 'ArrowUp')){
    ev.preventDefault(); moveFocus(-1); return;
  }

  // Day navigation
  if(!typing && (key === 'h' || (ev.ctrlKey && ev.key === 'ArrowLeft'))){ ev.preventDefault(); shiftDay(-1); return; }
  if(!typing && (key === 'l' || (ev.ctrlKey && ev.key === 'ArrowRight'))){ ev.preventDefault(); shiftDay(+1); return; }

  // Space no longer mapped (timer removed)
  if(!typing && (ev.key === '+' || ev.key === '=')){ // + key (shift or not)
    ev.preventDefault(); if(state.focusedId) adjustMinutes(state.focusedId, +15); return;
  }
  if(!typing && (ev.key === '-' || ev.key === '_')){
    ev.preventDefault(); if(state.focusedId) adjustMinutes(state.focusedId, -15); return;
  }
  if(!typing && key === 'p'){ // focus project
    ev.preventDefault(); focusField(state.focusedId, '.input-project'); return;
  }
  if(!typing && key === 'c'){ // focus comment
    ev.preventDefault(); focusField(state.focusedId, '.input-comment'); return;
  }
}

function moveFocus(dir){
  const ids = state.data.entries.map(e=>e.id);
  if(ids.length === 0){ return; }
  let idx = Math.max(0, ids.indexOf(state.focusedId));
  idx = Math.min(ids.length-1, Math.max(0, idx + dir));
  const id = ids[idx];
  setFocused(id);
  const row = findRow(id); row?.scrollIntoView({block:'nearest'});
}

function focusField(id, sel){
  const row = findRow(id); if(!row) return;
  const input = $(sel, row); input?.focus(); input?.select?.();
}

// -------- Init & Events --------
function init(){
  const datePicker = $('#datePicker');
  datePicker.value = state.date;
  datePicker.addEventListener('change', ()=>{
    flushDeferredSort();
    state.date = datePicker.value || todayISO();
    state.data = loadDay(state.date);
    sortEntriesByStartInPlace();
    // Ensure at least one empty entry on a new day
    if((state.data.entries||[]).length === 0){
      addEmptyEntry();
      return; // addEmptyEntry renders and focuses; summary updated below on tick
    }
    state.focusedId = null;
    render(); updateSummaryUI();
  });

  $('#btnPrevDay').addEventListener('click', ()=> shiftDay(-1));
  $('#btnNextDay').addEventListener('click', ()=> shiftDay(+1));
  $('#btnToday').addEventListener('click', ()=>{
    if(state.date === todayISO()) return;
    datePicker.value = todayISO();
    datePicker.dispatchEvent(new Event('change', { bubbles: true }));
  });

  $('#btnAdd')?.addEventListener('click', ()=> addEntry());
  $('#btnAddBreak')?.addEventListener('click', ()=> addPause());

  // Quick select project and comment buttons are generated in render().
  $('#tabEntryView').addEventListener('click', ()=> navigateToView('entry'));
  $('#tabStatsView').addEventListener('click', ()=> navigateToView('stats'));
  $('#viewSwitcher').addEventListener('keydown', (ev)=>{
    if(!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const nextView = ['ArrowRight', 'End'].includes(ev.key) ? 'stats' : 'entry';
    navigateToView(nextView);
    requestAnimationFrame(()=> $(nextView === 'stats' ? '#tabStatsView' : '#tabEntryView')?.focus());
  });
  window.addEventListener('hashchange', ()=> setActiveView(viewFromLocation()));
  $('#btnPeriodWeek').addEventListener('click', ()=> setSummaryPeriod('week'));
  $('#btnPeriodMonth').addEventListener('click', ()=> setSummaryPeriod('month'));
  $('#btnPreviousPeriod').addEventListener('click', ()=> shiftSummaryPeriod(-1));
  $('#btnNextPeriod').addEventListener('click', ()=> shiftSummaryPeriod(1));
  $('#summaryRangeForm').addEventListener('submit', (ev)=>{
    ev.preventDefault();
    updateSummaryUI();
  });
  $('#btnExport').addEventListener('click', copyToExcel);
  $('#btnExportFullYear').addEventListener('click', exportFullYearCSV);
  // Settings popin
  const btnSettings = $('#btnSettings');
  const modal = $('#settingsModal');
  const btnCloseSettings = $('#btnCloseSettings');
  btnSettings?.addEventListener('click', ()=>{
    if(modal){
      renderSettings();
      modal.hidden = false;
      // Start at the first setting without scrolling past the group controls.
      $('#settingsSection').scrollTop = 0;
      $('#newProjectGroupInput')?.focus({ preventScroll: true });
    }
  });
  btnCloseSettings?.addEventListener('click', ()=>{ if(modal) modal.hidden = true; });
  // Close on backdrop click (but not when clicking inside modal content)
  modal?.addEventListener('mousedown', (ev)=>{
    if(ev.target === modal){
      modal.hidden = true;
    }
  });
  // Stop modal content clicks from closing modal
  $('.modal', modal)?.addEventListener('mousedown', (ev)=>{
    ev.stopPropagation();
  });
  // Close on Escape
  document.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape' && modal && !modal.hidden){ modal.hidden = true; }});

  // Settings controls inside modal
  $('#btnAddProject')?.addEventListener('click', ()=> addProjectFromInput());
  $('#newProjectInput')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); addProjectFromInput(); }});
  $('#btnAddProjectGroup')?.addEventListener('click', ()=> addProjectGroupFromInput());
  $('#newProjectGroupInput')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); addProjectGroupFromInput(); }});
  $('#btnAddCommentShortcut')?.addEventListener('click', ()=> addCommentShortcutFromInput());
  $('#newCommentShortcutInput')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); addCommentShortcutFromInput(); }});

  document.addEventListener('keydown', handleGlobalKeys);

  // Load meta & data
  state.meta = loadMeta();
  state.data = loadDay(state.date);
  
  // Initialize with default projects if none exist
  if(state.meta.projects.length === 0){
    const defaultProjects = ['CPO', 'PM', 'FER', 'CDA', 'NOV', 'MRH', 'ADM'];
    state.meta.projects = defaultProjects;
  }

  for(const project of state.meta.projects){
    if(!state.meta.projectGroupAssignments[project]){
      const preferredId = defaultGroupIdForProject(project);
      const group = state.meta.projectGroups.find(item => item.id === preferredId) || state.meta.projectGroups[0];
      if(group) state.meta.projectGroupAssignments[project] = group.id;
    }
  }
  saveMeta(state.meta);

  // Initialize with default comment shortcuts if none exist
  if(state.meta.commentShortcuts.length === 0){
    const defaultComments = ['IA', 'GTA', 'KM', 'RGPD', 'GESTPROC'];
    state.meta.commentShortcuts = defaultComments;
    saveMeta(state.meta);
  }
  
  sortEntriesByStartInPlace();
  if((state.data.entries||[]).length === 0){
    addEmptyEntry();
  } else {
    render(); updateSummaryUI();
  }

  // Initialize comment suggestions with global suggestions
  const commentDL = $('#commentList');
  if(commentDL){
    commentDL.innerHTML = '';
    for(const c of getFrequentComments()){
      const opt = document.createElement('option');
      opt.value = c;
      commentDL.appendChild(opt);
    }
  }

  // Build time picker once
  buildTimePicker();

  setActiveView(viewFromLocation());

  // Keep the day warning accurate when the app stays open across midnight.
  state.tickHandle = window.setInterval(updateDateContext, 60_000);
}

window.addEventListener('DOMContentLoaded', init);

// Quick helper to add a pause entry
function addPause(){
  addEntry({ project: 'Pause', comment: 'Pause' });
}

//

// ------ Time Picker (07:00 → 21:00 every 15m) ------
function generateQuarterTimes(){
  const out = [];
  for(let m=7*60; m<=21*60; m+=15){
    const h = Math.floor(m/60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`);
  }
  return out;
}

function buildTimePicker(){
  const el = document.createElement('div');
  el.id = 'timePicker';
  el.className = 'time-picker';
  el.style.display = 'none';
  const times = generateQuarterTimes();
  times.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = t;
    btn.dataset.value = t;
    btn.addEventListener('click', ()=>{
      const inp = state.timePicker.currentInput;
      if(inp){
        inp.value = t;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        hideTimePicker();
      }
    });
    el.appendChild(btn);
  });
  document.body.appendChild(el);
  state.timePicker.el = el;

  // close on outside click
  document.addEventListener('mousedown', (ev)=>{
    const tp = state.timePicker.el; if(!tp) return;
    if(tp.style.display === 'none') return;
    if(!(tp.contains(ev.target) || state.timePicker.currentInput === ev.target)){
      hideTimePicker();
    }
  });
  // close on escape
  document.addEventListener('keydown', (ev)=>{ if(ev.key === 'Escape') hideTimePicker(); });
  // reposition on scroll/resize
  window.addEventListener('scroll', ()=>{ if(state.timePicker.el && state.timePicker.el.style.display !== 'none'){ positionTimePicker(); } }, true);
  window.addEventListener('resize', ()=>{ if(state.timePicker.el && state.timePicker.el.style.display !== 'none'){ positionTimePicker(); } });
}

function openTimePickerFor(input){
  if(!state.timePicker.el) return;
  state.timePicker.currentInput = input;
  // highlight current value
  const val = (input.value||'').trim();
  $$('.time-picker button').forEach(btn=>{
    if(btn.dataset.value === val){ btn.classList.add('active'); }
    else{ btn.classList.remove('active'); }
  });
  state.timePicker.el.style.display = 'block';
  positionTimePicker();
}

function positionTimePicker(){
  const el = state.timePicker.el; const inp = state.timePicker.currentInput;
  if(!el || !inp) return;
  const rect = inp.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 6;
  const left = rect.left + window.scrollX;
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

function hideTimePicker(){
  if(!state.timePicker.el) return;
  state.timePicker.el.style.display = 'none';
  state.timePicker.currentInput = null;
}

// ------ Helpers for day navigation & project list ------
function shiftDay(delta){
  flushDeferredSort();
  const d = new Date(state.date);
  d.setDate(d.getDate() + delta);
  const pad = (n)=> String(n).padStart(2,'0');
  state.date = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  $('#datePicker').value = state.date;
  state.data = loadDay(state.date);
  sortEntriesByStartInPlace();
  if((state.data.entries||[]).length === 0){
    addEmptyEntry();
    return; // addEmptyEntry handles render/focus
  }
  state.focusedId = null;
  render(); updateSummaryUI();
}

// ------ Settings (Projects) ------
function renderSettings(){
  const groupsList = $('#projectGroupsSettingsList');
  groupsList.innerHTML = '';
  for(const group of state.meta.projectGroups){
    const row = document.createElement('div');
    row.className = 'settings-row settings-group-row';
    row.innerHTML = `
      <input type="color" class="settings-group-color" value="${escapeHtml(group.color)}" aria-label="Couleur du groupe ${escapeHtml(group.name)}" />
      <input type="text" class="settings-group-name" value="${escapeHtml(group.name)}" aria-label="Nom du groupe" />
      <button class="btn-del-project-group" title="Supprimer le groupe" aria-label="Supprimer le groupe ${escapeHtml(group.name)}">×</button>
    `;
    const colorInput = $('.settings-group-color', row);
    const nameInput = $('.settings-group-name', row);
    const deleteButton = $('.btn-del-project-group', row);
    deleteButton.disabled = state.meta.projectGroups.length === 1;

    colorInput.addEventListener('input', ()=>{
      group.color = colorInput.value;
      saveMeta(state.meta);
      render();
      updateSummaryUI();
    });
    nameInput.addEventListener('change', ()=>{
      const newName = nameInput.value.trim();
      if(!newName || state.meta.projectGroups.some(item => item.id !== group.id && item.name === newName)){
        nameInput.value = group.name;
        return;
      }
      group.name = newName;
      saveMeta(state.meta);
      render();
      updateSummaryUI();
      renderSettings();
    });
    deleteButton.addEventListener('click', ()=>{
      if(state.meta.projectGroups.length === 1) return;
      state.meta.projectGroups = state.meta.projectGroups.filter(item => item.id !== group.id);
      const fallbackId = state.meta.projectGroups[0].id;
      for(const project of state.meta.projects){
        if(state.meta.projectGroupAssignments[project] === group.id){
          state.meta.projectGroupAssignments[project] = fallbackId;
        }
      }
      saveMeta(state.meta);
      render();
      updateSummaryUI();
      renderSettings();
    });
    groupsList.appendChild(row);
  }

  // Render projects settings
  const projectsList = $('#projectsSettingsList');
  projectsList.innerHTML = '';
  for(const p of state.meta.projects){
    const li = document.createElement('div');
    li.className = 'settings-row settings-project-row';
    const groupOptions = state.meta.projectGroups.map(group => `
      <option value="${escapeHtml(group.id)}" ${state.meta.projectGroupAssignments[p] === group.id ? 'selected' : ''}>${escapeHtml(group.name)}</option>
    `).join('');
    li.innerHTML = `
      <input type="text" class="settings-project" value="${escapeHtml(p)}" />
      <select class="settings-project-group" aria-label="Groupe du projet ${escapeHtml(p)}">${groupOptions}</select>
      <button class="btn-del-project" title="Supprimer">×</button>
    `;
    const input = li.querySelector('.settings-project');
    const groupSelect = li.querySelector('.settings-project-group');
    const btnDel = li.querySelector('.btn-del-project');
    input.addEventListener('change', ()=>{
      const newName = input.value.trim();
      const oldName = p;
      if(!newName){ input.value = oldName; return; }
      if(newName === oldName) return;
      // Rename keeping uniqueness
      if(state.meta.projects.includes(newName)){
        input.value = oldName; return;
      }
      const idx = state.meta.projects.indexOf(oldName);
      if(idx>=0){
        state.meta.projects.splice(idx,1,newName);
        state.meta.projects.sort((a,b)=> a.localeCompare(b));
        state.meta.projectGroupAssignments[newName] = state.meta.projectGroupAssignments[oldName];
        delete state.meta.projectGroupAssignments[oldName];
        saveMeta(state.meta);
      }
      // Update datalist and quick-select buttons
      render();
      renderSettings();
    });
    groupSelect.addEventListener('change', ()=>{
      state.meta.projectGroupAssignments[p] = groupSelect.value;
      saveMeta(state.meta);
      render();
      updateSummaryUI();
    });
    btnDel.addEventListener('click', ()=>{
      const idx = state.meta.projects.indexOf(p);
      if(idx>=0){
        state.meta.projects.splice(idx,1);
        delete state.meta.projectGroupAssignments[p];
        saveMeta(state.meta);
      }
      render();
      renderSettings();
    });
    projectsList.appendChild(li);
  }

  // Render comment shortcuts settings
  const shortcutsList = $('#commentShortcutsSettingsList');
  shortcutsList.innerHTML = '';
  for(const shortcut of state.meta.commentShortcuts){
    const li = document.createElement('div');
    li.className = 'settings-row';
    li.innerHTML = `
      <input type="text" class="settings-comment-shortcut" value="${escapeHtml(shortcut)}" />
      <button class="btn-del-comment-shortcut" title="Supprimer">×</button>
    `;
    const input = li.querySelector('.settings-comment-shortcut');
    const btnDel = li.querySelector('.btn-del-comment-shortcut');
    input.addEventListener('change', ()=>{
      const newName = input.value.trim();
      const oldName = shortcut;
      if(!newName){ input.value = oldName; return; }
      if(newName === oldName) return;
      // Rename keeping uniqueness
      if(state.meta.commentShortcuts.includes(newName)){
        input.value = oldName; return;
      }
      const idx = state.meta.commentShortcuts.indexOf(oldName);
      if(idx>=0){ state.meta.commentShortcuts.splice(idx,1,newName); state.meta.commentShortcuts.sort((a,b)=> a.localeCompare(b)); saveMeta(state.meta); }
      // Update quick-select comment buttons
      render();
      renderSettings();
    });
    btnDel.addEventListener('click', ()=>{
      const idx = state.meta.commentShortcuts.indexOf(shortcut);
      if(idx>=0){ state.meta.commentShortcuts.splice(idx,1); saveMeta(state.meta); }
      render();
      renderSettings();
    });
    shortcutsList.appendChild(li);
  }
}

function addProjectGroupFromInput(){
  const input = $('#newProjectGroupInput');
  const name = (input.value || '').trim();
  if(!name || state.meta.projectGroups.some(group => group.name === name)) return;
  const color = GROUP_COLOR_PALETTE[state.meta.projectGroups.length % GROUP_COLOR_PALETTE.length];
  state.meta.projectGroups.push({ id: `group-${makeId()}`, name, color });
  saveMeta(state.meta);
  input.value = '';
  renderSettings();
}

function addProjectFromInput(){
  const inp = $('#newProjectInput');
  const name = (inp.value||'').trim();
  if(!name) return;
  ensureProject(name);
  inp.value = '';
  render();
  renderSettings();
}

function addCommentShortcutFromInput(){
  const inp = $('#newCommentShortcutInput');
  const name = (inp.value||'').trim();
  if(!name) return;
  if(!state.meta.commentShortcuts.includes(name)){
    state.meta.commentShortcuts.push(name);
    state.meta.commentShortcuts.sort((a,b)=> a.localeCompare(b));
    saveMeta(state.meta);
  }
  inp.value = '';
  render();
  renderSettings();
}

function renderQuickSelectButtons(){
  const container = $('#quickProjectButtons');
  if(!container) return;
  
  container.innerHTML = '';
  
  // Add project buttons
  for(const p of state.meta.projects){
    const btn = document.createElement('button');
    btn.className = 'quick-btn';
    btn.dataset.project = p;
    btn.style.setProperty('--project-color', projectColor(p));
    btn.title = `Groupe : ${projectGroup(p).name}`;
    btn.textContent = p;
    btn.addEventListener('click', handleQuickProjectSelect);
    container.appendChild(btn);
  }
}

function handleQuickProjectSelect(ev){
  const project = ev.currentTarget.dataset.project;
  const focusedEntry = state.focusedId
    ? state.data.entries.find(e => e.id === state.focusedId)
    : null;
  
  // Prefer the current row when assigning a project to an empty project field.
  if (focusedEntry && (state.focusedField === 'project' || !(focusedEntry.project || '').trim())) {
    focusedEntry.project = project;
    // If no start time yet, set it to now when user selects a project
    if (!focusedEntry.start) {
      focusedEntry.start = nowRoundedHHMM();
      ensureUniqueStart(focusedEntry);
    }
    persist();
    render();
    setFocused(focusedEntry.id, 'project');
    // Keep focus on the project field after setting the value
    const row = findRow(focusedEntry.id);
    if (row) {
      const inputProject = $('.input-project', row);
      inputProject?.focus();
      // Trigger the change event to update suggestions and styling
      inputProject?.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return;
  }
  
  // Fall back to original behavior: fill empty entry or create new one
  // Check if there are any empty entries to fill first
  const emptyEntry = state.data.entries.find(e => e.project.trim() === '');
  if (emptyEntry) {
    emptyEntry.project = project;
    if (!emptyEntry.start) {
      emptyEntry.start = nowRoundedHHMM();
      ensureUniqueStart(emptyEntry);
    }
    persist();
    render();
    setFocused(emptyEntry.id);
    // Focus comment field after filling entry via project button
    const row = findRow(emptyEntry.id);
    if(row){ $('.input-comment', row)?.focus(); }
  } else {
    // Only create a new entry if no empty entries exist
    addEntry({ project: project });
    // Focus comment field after adding entry via project button
    const row = findRow(state.focusedId);
    if(row){ $('.input-comment', row)?.focus(); }
  }
}

function renderCommentShortcutsButtons(){
  const container = $('#quickCommentButtons');
  if(!container) return;
  
  container.innerHTML = '';
  
  // Add comment shortcut buttons
  for(const comment of state.meta.commentShortcuts){
    const btn = document.createElement('button');
    btn.className = 'quick-comment-btn';
    btn.dataset.comment = comment;
    btn.textContent = comment;
    btn.addEventListener('click', handleQuickCommentSelect);
    container.appendChild(btn);
  }
}

function handleQuickCommentSelect(ev){
  const comment = ev.currentTarget.dataset.comment;
  // Find the currently focused entry
  const focusedEntry = state.data.entries.find(e => e.id === state.focusedId);
  if (focusedEntry) {
    const row = findRow(focusedEntry.id);
    if (row) {
      const inputComment = $('.input-comment', row);
      if (inputComment) {
        const currentValue = inputComment.value.trim();
        const newValue = currentValue ? `${currentValue} [${comment}]` : `[${comment}]`;
        inputComment.value = newValue;
        inputComment.dispatchEvent(new Event('input', { bubbles: true }));
        inputComment.focus();
      }
    }
  }
}

// ------ Clipboard helpers (summary) ------
async function copyText(text){
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      return true;
    }
  }catch(_){ /* fallback below */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0'; ta.style.left='-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = true;
  try{ document.execCommand('copy'); }
  catch(_){ ok = false; }
  document.body.removeChild(ta);
  return ok;
}

async function copyProjectComments(projectDisplayName, btn, startDate = state.date, endDate = state.date){
  const isSansProjet = (projectDisplayName || '').trim() === 'Sans projet';
  const matched = storedDaysInRange(startDate, endDate).flatMap(day =>
    (day.data.entries||[]).filter(e=>{
      const p = (e.project||'').trim();
      return isSansProjet ? p === '' : p === projectDisplayName;
    })
  );
  const comments = matched.map(e => (e.comment||'').trim()).filter(Boolean);
  const text = comments.join('\n');
  const ok = await copyText(text);
  if(btn){
    const old = btn.textContent;
    btn.textContent = ok ? 'Copié !' : 'Échec copie';
    btn.disabled = true;
    setTimeout(()=>{ btn.textContent = old; btn.disabled = false; }, 1200);
  }
}
