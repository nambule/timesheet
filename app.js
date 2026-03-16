// Timesheet Codex - simple offline SPA using localStorage

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const START_SORT_DEBOUNCE_MS = 400;
const REORDER_PREMOVE_DELAY_MS = 1000;
const REORDER_LANDING_MS = 700;

// -------- Data Model --------
// Entry: { id, project, comment, minutes, start }
// Day data key: ts:YYYY-MM-DD
// Meta key (global): ts:meta -> { projects: string[], commentShortcuts: string[] }

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
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
    if(!raw) return { projects: [], commentShortcuts: [] };
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
    return { projects: meta.projects, commentShortcuts: meta.commentShortcuts };
  }catch(e){
    console.error('Load meta error', e);
    return { projects: [], commentShortcuts: [] };
  }
}
function saveMeta(meta){
  localStorage.setItem('ts:meta', JSON.stringify({
    projects: meta.projects||[],
    commentShortcuts: meta.commentShortcuts||[]
  }));
}
function ensureProject(project){
  const p = (project||'').trim(); if(!p) return;
  if(!state.meta.projects.includes(p)){
    state.meta.projects.push(p);
    state.meta.projects.sort((a,b)=> a.localeCompare(b));
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

function computeDurationMinutes(start, end){
  const sOk = /^\d{1,2}:\d{2}$/.test(start||'');
  const eOk = /^\d{1,2}:\d{2}$/.test(end||'');
  if(!sOk || !eOk) return 0;
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if(e >= s) return e - s;
  return (24*60 - s) + e; // overnight wrap
}

function visibleMinutes(e){
  // New rule: duration = from this start to the following task start (by time)
  const startOk = /^\d{1,2}:\d{2}$/.test(e.start||'');
  if(!startOk){
    // legacy minutes mode
    return (e.minutes||0);
  }
  const currM = hhmmToMinutes(e.start);
  const next = (state.data.entries||[])
    .filter(x => x.id !== e.id && /^\d{1,2}:\d{2}$/.test(x.start||''))
    .map(x => hhmmToMinutes(x.start))
    .filter(m => m > currM)
    .sort((a,b)=> a-b)[0];
  if(next === undefined) return 0;
  return next - currM;
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
  data: { entries: [], projects: [] },
  meta: { projects: [], commentShortcuts: [] },
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
  pendingMoveId: null,
  pendingMoveDirection: null,
  reorderDelayHandle: null,
  reorderCleanupHandle: null,
  reorderToken: 0,
  movementDirection: null, // 'up' or 'down'
  lastSortedEntry: null, // Track last moved entry for animation
  showMovementIndicators: true,
  ghostPlaceholder: null,
  ghostPlaceholderTimer: null,
};

// -------- Rendering --------
function render(){
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
    const isPendingMove = state.pendingMoveId === e.id;
    const isJustSorted = state.lastSortedEntry === e.id;
    const movementDirection = (isPendingMove ? state.pendingMoveDirection : state.movementDirection);
    if((isPendingMove || isJustSorted) && movementDirection){
      node.classList.add(movementDirection === 'up' ? 'moving-up' : 'moving-down');
    }
    if(isPendingMove){
      node.classList.add('reorder-waiting');
    }
    if(isJustSorted){
      node.classList.add('just-sorted', 'focused-after-sort');
    }
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
    const minsEl = $('.duration-min', node);
    if(minsEl) minsEl.textContent = minutesToHHMM(visibleMinutes(e));

    // no running visual (timer removed)
    if((isPendingMove || isJustSorted) && state.showMovementIndicators){
      const movementIndicator = document.createElement('div');
      movementIndicator.className = 'movement-indicator';
      movementIndicator.setAttribute('aria-hidden', 'true');
      node.appendChild(movementIndicator);
    }

    // Events
    // Project typing
    inputProject.addEventListener('input', ()=>{
      e.project = inputProject.value;
      // If no start time yet, set it to now when user begins typing
      if(!e.start){
        e.start = nowHHMM();
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
        e.start = nowHHMM();
        ensureUniqueStart(e);
        delete state.rounding[e.id]; delete state.roundingStart[e.id];
        resortEntriesWithGhost(e.id);
      }
      openTimePickerFor(inputStart);
    });
    inputStart.addEventListener('click', ()=>{
      if(!e.start){
        e.start = nowHHMM();
        ensureUniqueStart(e);
        delete state.rounding[e.id]; delete state.roundingStart[e.id];
        resortEntriesWithGhost(e.id);
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
        e.start = nowHHMM();
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
  performEnhancedSort(entryId);
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
      : (isToday ? nowHHMM() : ''),
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
  cancelPendingReorder();
}

function performEnhancedSort(focusId, controlSelector){
  const entryList = $('#entryList');
  const movePlan = focusId ? planEntryMove(focusId) : null;
  const placeholderSnapshot = movePlan?.willMove ? captureGhostPlaceholderSnapshot(focusId) : null;
  const token = ++state.reorderToken;

  cancelPendingReorder();

  if(entryList){
    entryList.classList.add('sorting');
  }

  if(!movePlan || !movePlan.willMove){
    runSortedRender({
      focusId,
      controlSelector,
      placeholderSnapshot: null,
      movementDirection: null,
      token,
    });
    return;
  }

  state.pendingMoveId = focusId;
  state.pendingMoveDirection = movePlan.direction;
  render();
  updateSummaryUI();

  state.reorderDelayHandle = setTimeout(()=>{
    if(token !== state.reorderToken) return;
    state.pendingMoveId = null;
    state.pendingMoveDirection = null;
    runSortedRender({
      focusId,
      controlSelector,
      placeholderSnapshot,
      movementDirection: movePlan.direction,
      token,
    });
  }, REORDER_PREMOVE_DELAY_MS);
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
  performEnhancedSort(focusId, controlSelector);
}

function adjustMinutes(id, delta){
  // Repurpose +/- to shift the start time of the focused entry
  adjustStart(id, delta);
}

function adjustStart(id, delta){
  const e = state.data.entries.find(x=>x.id===id); if(!e) return;
  const dir = delta >= 0 ? 1 : -1;
  const nowTs = Date.now();
  const st = state.roundingStart[id] || { stage: 0, lastDir: dir, at: nowTs };
  if(st.lastDir !== dir){ st.stage = 0; }

  // Helpers for strict rounding forward/backward
  const ceilUp = (m, step) => {
    const rem = m % step; return m + (rem === 0 ? step : (step - rem));
  };
  const floorDown = (m, step) => {
    const rem = m % step; return m - (rem === 0 ? step : rem);
  };

  const day = 24*60;
  let startMCurrent = e.start ? hhmmToMinutes(e.start) : hhmmToMinutes(nowHHMM());
  let startMNew = startMCurrent;
  if(st.stage === 0){
    // First click: align start to 5-min grid and check if we've reached a quarter
    startMNew = dir > 0 ? ceilUp(startMCurrent, 5) : floorDown(startMCurrent, 5);
    // Check if we're at a quarter-hour mark (00, 15, 30, 45)
    const minutesInHour = startMNew % 60;
    if(minutesInHour % 15 === 0){
      st.stage = 1; // Switch to 15-min increments
    } else {
      st.stage = 0; // Continue with 5-min increments
    }
  } else {
    // Subsequent clicks: step by 15 minutes (quarter-hour increments)
    startMNew = startMCurrent + dir*15;
  }

  startMNew = ((startMNew % day) + day) % day;
  e.start = minutesToHHMMDay(startMNew);
  ensureUniqueStart(e, dir);

  st.lastDir = dir; st.at = nowTs; state.roundingStart[id] = st;
  persist();
  
  performEnhancedSort(e.id, delta >= 0 ? '.btn-start-inc' : '.btn-start-dec');
}

function cancelPendingReorder(){
  if(state.reorderDelayHandle){
    clearTimeout(state.reorderDelayHandle);
    state.reorderDelayHandle = null;
  }
  if(state.reorderCleanupHandle){
    clearTimeout(state.reorderCleanupHandle);
    state.reorderCleanupHandle = null;
  }
  state.pendingMoveId = null;
  state.pendingMoveDirection = null;
  state.lastSortedEntry = null;
  state.movementDirection = null;
  const entryList = $('#entryList');
  if(entryList){
    entryList.classList.remove('sorting');
  }
}

function compareEntriesByStart(a, b){
  const as = /^\d{1,2}:\d{2}$/.test(a.e.start || '');
  const bs = /^\d{1,2}:\d{2}$/.test(b.e.start || '');
  if(as && bs){
    const da = hhmmToMinutes(a.e.start);
    const db = hhmmToMinutes(b.e.start);
    if(da !== db) return db - da;
    return a.i - b.i;
  }
  if(as && !bs) return 1;
  if(!as && bs) return -1;
  return a.i - b.i;
}

function planEntryMove(entryId){
  const currentIndex = state.data.entries.findIndex(entry => entry.id === entryId);
  if(currentIndex === -1) return null;
  const withIdx = state.data.entries.map((e, i)=> ({ e, i }));
  withIdx.sort(compareEntriesByStart);
  const newIndex = withIdx.findIndex(item => item.e.id === entryId);
  if(newIndex === -1) return null;
  return {
    currentIndex,
    newIndex,
    willMove: newIndex !== currentIndex,
    direction: newIndex < currentIndex ? 'up' : 'down',
  };
}

function runSortedRender({ focusId, controlSelector, placeholderSnapshot, movementDirection, token }){
  sortEntriesByStartInPlace();
  persist();
  if(placeholderSnapshot && focusId){
    const newIndex = state.data.entries.findIndex(entry => entry.id === focusId);
    if(newIndex !== -1 && newIndex !== placeholderSnapshot.index){
      state.ghostPlaceholder = placeholderSnapshot;
    }
  }

  state.lastSortedEntry = movementDirection ? focusId : null;
  state.movementDirection = movementDirection;
  render();
  updateSummaryUI();
  restoreSortedFocus(focusId, controlSelector);

  state.reorderDelayHandle = null;
  state.reorderCleanupHandle = setTimeout(()=>{
    if(token !== state.reorderToken) return;
    state.lastSortedEntry = null;
    state.movementDirection = null;
    const row = focusId ? findRow(focusId) : null;
    row?.classList.remove('moving-up', 'moving-down', 'just-sorted', 'focused-after-sort');
    const entryList = $('#entryList');
    entryList?.classList.remove('sorting');
    state.reorderCleanupHandle = null;
  }, movementDirection ? REORDER_LANDING_MS : 0);
}

function restoreSortedFocus(focusId, controlSelector){
  if(!focusId) return;
  const row = findRow(focusId);
  if(!row) return;
  if(controlSelector){
    const control = row.querySelector(controlSelector);
    control?.focus();
    return;
  }

  const fieldSelector = state.focusedField === 'project'
    ? '.input-project'
    : state.focusedField === 'comment'
      ? '.input-comment'
      : state.focusedField === 'start'
        ? '.input-start'
        : null;
  if(fieldSelector){
    row.querySelector(fieldSelector)?.focus();
  }
}

// removed adjustEnd and closeOpenTasksNow (no end time in the model)

function ensureUniqueStart(entry, preferredDir = 1){
  if(!entry) return false;
  const hasValidStart = /^\d{1,2}:\d{2}$/.test(entry.start || '');
  if(!hasValidStart) return false;

  const dir = preferredDir >= 0 ? 1 : -1;
  const step = 15;
  const day = 24 * 60;
  let minutes = hhmmToMinutes(entry.start);
  const maxIterations = Math.ceil(day / step);
  let changed = false;

  for(let i = 0; i < maxIterations; i++){
    const conflict = state.data.entries.some(other => (
      other.id !== entry.id &&
      /^\d{1,2}:\d{2}$/.test(other.start || '') &&
      hhmmToMinutes(other.start) === minutes
    ));
    if(!conflict) break;

    minutes = (minutes + dir * step + day) % day;
    entry.start = minutesToHHMMDay(minutes);
    changed = true;
  }

  return changed;
}

// sort entries in place by start time descending (newest first, invalid/empty start goes first, keep relative order)
function sortEntriesByStartInPlace(){
  const withIdx = state.data.entries.map((e, i)=>({e,i}));
  withIdx.sort(compareEntriesByStart);
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
function groupByProject(){
  const acc = new Map();
  for(const e of state.data.entries){
    // Skip pause activities in the recap
    const isPause = ((e.project||'').trim().toLowerCase() === 'pause');
    if(isPause) continue;

    const project = (e.project||'Sans projet').trim() || 'Sans projet';
    const key = project;
    acc.set(key, (acc.get(key)||0) + visibleMinutes(e));
  }
  return Array.from(acc.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
}

// running minutes removed (no live timers)

function updateSummaryUI(){
  const list = $('#summaryList'); if(!list) return;
  const rows = groupByProject();
  list.innerHTML = '';
  let total = 0;
  for(const [project, minutes] of rows){
    total += minutes;
    const div = document.createElement('div');
    div.className = 'summary-row';
    const safeProject = escapeHtml(project);
    div.innerHTML = `
      <div>${safeProject}</div>
      <div>
        ${minutesToHHMM(minutes)}
        <button class="secondary btn-copy-comments" data-project="${safeProject}" title="Copier les commentaires">Copier les commentaires</button>
      </div>
    `;
    list.appendChild(div);
  }
  $('#summaryTotal').textContent = `Total: ${minutesToHHMM(total)}`;
  // Wire copy buttons
  $$('.btn-copy-comments', list).forEach(btn => {
    btn.addEventListener('click', async ()=>{
      const proj = btn.dataset.project || '';
      await copyProjectComments(proj, btn);
    });
  });
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

  $('#btnAdd')?.addEventListener('click', ()=> addEntry());
  $('#btnAddBreak')?.addEventListener('click', ()=> addPause());

  // Quick select project buttons are now dynamically generated in render()

  // Quick select comment buttons are now dynamically generated in render()
  $('#btnSummary').addEventListener('click', ()=>{
    updateSummaryUI();
    $('#summarySection').hidden = false;
    $('#summarySection').scrollIntoView({behavior:'smooth'});
  });
  $('#btnCloseSummary').addEventListener('click', ()=>{
    $('#summarySection').hidden = true;
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
      // focus the input for quick add
      $('#newProjectInput')?.focus();
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
    saveMeta(state.meta);
  }

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

  // No live timers; no periodic tick needed
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
  // Render projects settings
  const projectsList = $('#projectsSettingsList');
  projectsList.innerHTML = '';
  for(const p of state.meta.projects){
    const li = document.createElement('div');
    li.className = 'settings-row';
    li.innerHTML = `
      <input type="text" class="settings-project" value="${escapeHtml(p)}" />
      <button class="btn-del-project" title="Supprimer">×</button>
    `;
    const input = li.querySelector('.settings-project');
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
      if(idx>=0){ state.meta.projects.splice(idx,1,newName); state.meta.projects.sort((a,b)=> a.localeCompare(b)); saveMeta(state.meta); }
      // Update datalist and quick-select buttons
      render();
      renderSettings();
    });
    btnDel.addEventListener('click', ()=>{
      const idx = state.meta.projects.indexOf(p);
      if(idx>=0){ state.meta.projects.splice(idx,1); saveMeta(state.meta); }
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
    btn.textContent = p;
    btn.addEventListener('click', handleQuickProjectSelect);
    container.appendChild(btn);
  }
}

function handleQuickProjectSelect(ev){
  const project = ev.currentTarget.dataset.project;
  const emptyEntry = state.data.entries.find(e => e.project.trim() === '');
  
  // If every entry already has a project, create a new entry for this pill.
  if (!emptyEntry) {
    addEntry({ project });
    const row = findRow(state.focusedId);
    if(row){ $('.input-comment', row)?.focus(); }
    return;
  }

  // Otherwise, if an entry is selected, fill that entry directly.
  if (state.focusedId) {
    const entry = state.data.entries.find(e => e.id === state.focusedId);
    if (entry) {
      entry.project = project;
      // If no start time yet, set it to now when user selects a project
      if (!entry.start) {
        entry.start = nowHHMM();
        ensureUniqueStart(entry);
      }
      persist();
      render();
      setFocused(entry.id, 'comment');
      // Move focus to the comment field so the next action can continue on the same entry.
      const row = findRow(entry.id);
      if (row) {
        const inputComment = $('.input-comment', row);
        inputComment?.focus();
      }
      return;
    }
  }
  
  emptyEntry.project = project;
  if (!emptyEntry.start) {
    emptyEntry.start = nowHHMM();
    ensureUniqueStart(emptyEntry);
  }
  persist();
  render();
  setFocused(emptyEntry.id, 'comment');
  const row = findRow(emptyEntry.id);
  if(row){ $('.input-comment', row)?.focus(); }
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

async function copyProjectComments(projectDisplayName, btn){
  const isSansProjet = (projectDisplayName || '').trim() === 'Sans projet';
  const matched = (state.data.entries||[]).filter(e=>{
    const p = (e.project||'').trim();
    return isSansProjet ? p === '' : p === projectDisplayName;
  });
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
