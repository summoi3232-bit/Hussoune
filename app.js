/* =========================================================
   الحصون الخمسة — رفيق الحفظ اليومي
   منهج الشيخ سعيد أبو العلا حمزة (القراءة، التحضير، الحفظ الجديد،
   مراجعة القريب، مراجعة البعيد) — بنفس الترتيب الأصلي.
   ========================================================= */

const STORAGE_KEY = 'husunAppData_v1';

const HISUN = [
  { id: 'reading',         icon: '📖', name: 'حصن القراءة' },
  { id: 'prep',            icon: '📝', name: 'حصن التحضير' },
  { id: 'newMemorization', icon: '🌱', name: 'حصن الحفظ الجديد' },
  { id: 'nearReview',      icon: '🔄', name: 'حصن مراجعة القريب' },
  { id: 'farReview',       icon: '🏛️', name: 'حصن مراجعة البعيد' },
];

const WEEKDAYS_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function defaultState() {
  return {
    settings: {
      dailyMemorize: 'صفحة واحدة',
      dailyRead: '٥ صفحات',
      reminders: { reading: '05:00', prep: '20:30', newMemorization: '05:30', nearReview: '13:00', farReview: '21:00' },
      remindersOn: { reading: true, prep: true, newMemorization: true, nearReview: true, farReview: true },
      theme: 'dark',
      fontSize: 'medium',
      nearReviewDays: 7,
      farBaseInterval: 5,
      farGrowth: 1.8,
      farCap: 90,
    },
    logs: {},
    memorizations: [],
    farQueue: [],
  };
}

let state = loadState();
let calendarCursor = new Date(); // month being viewed in calendar
let currentModalHisun = null;

/* ---------------- Storage ---------------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      settings: { ...base.settings, ...(parsed.settings || {}) },
      logs: parsed.logs || {},
      memorizations: parsed.memorizations || [],
      farQueue: parsed.farQueue || [],
    };
  } catch (e) {
    console.error('تعذر تحميل البيانات', e);
    return defaultState();
  }
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('تعذر حفظ البيانات', e);
    showToast('تعذر حفظ البيانات على هذا الجهاز');
  }
}

/* ---------------- Date helpers ---------------- */
function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function todayISO() { return toISO(new Date()); }
function addDaysISO(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
function daysBetween(isoA, isoB) {
  const a = fromISO(isoA), b = fromISO(isoB);
  return Math.round((b - a) / 86400000);
}
function hijriString(date) {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  } catch (e) {
    return '';
  }
}
function gregString(date) {
  return `${WEEKDAYS_AR[date.getDay()]} ${date.getDate()} ${MONTHS_AR[date.getMonth()]} ${date.getFullYear()}م`;
}

/* ---------------- Log access ---------------- */
function ensureLog(iso) {
  if (!state.logs[iso]) {
    state.logs[iso] = {
      reading: { pages: '', done: false },
      prep: { segment: '', notes: '', done: false },
      newMemorization: { amount: '', status: 'not_started', notes: '' },
      nearReviewDone: [],
      farReviewDone: [],
    };
  }
  return state.logs[iso];
}

/* ---------------- Review queues ---------------- */
function getNearReviewItems(iso) {
  const days = state.settings.nearReviewDays;
  return state.memorizations.filter((m) => {
    if (m.status !== 'مكتمل') return false;
    const diff = daysBetween(m.dateMemorized, iso);
    return diff >= 1 && diff <= days;
  });
}
function migrateDueFarItems() {
  const today = todayISO();
  const days = state.settings.nearReviewDays;
  state.memorizations.forEach((m) => {
    if (m.status !== 'مكتمل') return;
    const diff = daysBetween(m.dateMemorized, today);
    const already = state.farQueue.some((q) => q.memId === m.id);
    if (diff > days && !already) {
      state.farQueue.push({
        memId: m.id,
        interval: state.settings.farBaseInterval,
        dueDate: addDaysISO(m.dateMemorized, days + state.settings.farBaseInterval),
        lastQuality: null,
      });
    }
  });
}
function getFarReviewItemsDueToday() {
  const today = todayISO();
  return state.farQueue.filter((q) => q.dueDate <= today);
}
function findMemById(id) { return state.memorizations.find((m) => m.id === id); }

/* ---------------- Daily completion state per hisn ---------------- */
function hisnState(hisnId, iso) {
  const log = ensureLog(iso);
  if (hisnId === 'reading') {
    if (log.reading.done) return 'done';
    if (log.reading.pages) return 'progress';
    return 'not_started';
  }
  if (hisnId === 'prep') {
    if (log.prep.done) return 'done';
    if (log.prep.segment) return 'progress';
    return 'not_started';
  }
  if (hisnId === 'newMemorization') {
    if (log.newMemorization.status === 'مكتمل') return 'done';
    if (log.newMemorization.status === 'بدأ' || log.newMemorization.status === 'جارٍ') return 'progress';
    return 'not_started';
  }
  if (hisnId === 'nearReview') {
    const items = getNearReviewItems(iso);
    if (items.length === 0) return 'na';
    const doneIds = log.nearReviewDone || [];
    const doneCount = items.filter((i) => doneIds.includes(i.id)).length;
    if (doneCount === items.length) return 'done';
    if (doneCount > 0) return 'progress';
    return 'not_started';
  }
  if (hisnId === 'farReview') {
    if (iso === todayISO()) migrateDueFarItems();
    const items = iso === todayISO() ? getFarReviewItemsDueToday() : [];
    if (items.length === 0) return 'na';
    const doneIds = log.farReviewDone || [];
    const doneCount = items.filter((i) => doneIds.includes(i.memId)).length;
    if (doneCount === items.length) return 'done';
    if (doneCount > 0) return 'progress';
    return 'not_started';
  }
  return 'not_started';
}
function dayCompletionRatio(iso) {
  let applicable = 0, done = 0;
  HISUN.forEach((h) => {
    const s = hisnState(h.id, iso);
    if (s === 'na') return;
    applicable++;
    if (s === 'done') done++;
  });
  if (applicable === 0) return 0;
  return done / applicable;
}
function dayOverallState(iso) {
  const ratio = dayCompletionRatio(iso);
  if (ratio >= 0.999) return 'green';
  if (ratio > 0) return 'blue';
  return 'gray';
}

/* ---------------- Rendering: Home ---------------- */
function renderHome() {
  const iso = todayISO();
  migrateDueFarItems();
  const list = document.getElementById('fortressList');
  list.innerHTML = '';
  let applicable = 0, done = 0;
  HISUN.forEach((h) => {
    const s = hisnState(h.id, iso);
    if (s !== 'na') { applicable++; if (s === 'done') done++; }
    const cardState = s === 'na' ? 'done' : s;
    const card = document.createElement('button');
    card.className = 'fortress-card';
    card.setAttribute('data-state', cardState);
    card.innerHTML = `
      <div class="gate-icon">${h.icon}</div>
      <div class="fortress-info">
        <div class="fortress-name">${h.name}</div>
        <div class="fortress-sub">${fortressSubtitle(h.id, iso, s)}</div>
      </div>
      <div class="fortress-status">${stateLabel(s)}</div>
    `;
    card.addEventListener('click', () => openModal(h.id));
    list.appendChild(card);
  });
  const pct = applicable ? Math.round((done / applicable) * 100) : 0;
  document.getElementById('dayProgressFill').style.width = pct + '%';
  document.getElementById('dayProgressLabel').textContent = `${pct}% من إنجاز اليوم`;
}
function stateLabel(s) {
  if (s === 'done' || s === 'na') return 'مكتمل';
  if (s === 'progress') return 'قيد التنفيذ';
  return 'لم يبدأ';
}
function fortressSubtitle(hisnId, iso, s) {
  const log = ensureLog(iso);
  if (hisnId === 'reading') return log.reading.pages ? `${log.reading.pages} صفحة اليوم` : `الورد المقترح: ${state.settings.dailyRead}`;
  if (hisnId === 'prep') return log.prep.segment ? `المقطع: ${log.prep.segment}` : 'اختر مقطع الغد للحفظ';
  if (hisnId === 'newMemorization') return log.newMemorization.amount ? `${log.newMemorization.amount} — ${log.newMemorization.status}` : `المقدار اليومي: ${state.settings.dailyMemorize}`;
  if (hisnId === 'nearReview') {
    const items = getNearReviewItems(iso);
    return items.length ? `${items.length} مقطعًا للمراجعة القريبة` : 'لا يوجد محفوظ حديث بعد';
  }
  if (hisnId === 'farReview') {
    const items = iso === todayISO() ? getFarReviewItemsDueToday() : [];
    return items.length ? `${items.length} مقطعًا مستحقًا للمراجعة` : 'لا يوجد مستحق اليوم';
  }
  return '';
}

/* ---------------- Modals ---------------- */
function openModal(hisnId) {
  currentModalHisun = hisnId;
  const h = HISUN.find((x) => x.id === hisnId);
  document.getElementById('modalTitle').textContent = h.name;
  document.getElementById('modalBody').innerHTML = buildModalBody(hisnId);
  attachModalHandlers(hisnId);
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  currentModalHisun = null;
  renderHome();
}
function buildModalBody(hisnId) {
  const iso = todayISO();
  const log = ensureLog(iso);
  if (hisnId === 'reading') {
    return `
      <div class="field"><label>عدد الصفحات المقروءة اليوم (بالنظر)</label>
        <input type="number" min="0" id="f_pages" value="${log.reading.pages || ''}" placeholder="مثال: 5"></div>
      <div class="field"><label>ملاحظة سريعة (اختياري)</label>
        <textarea id="f_readNote" placeholder="أي ملاحظة عن ورد القراءة اليوم">${log.reading.note || ''}</textarea></div>
      <button class="btn" id="f_save">${log.reading.done ? 'تحديث الحفظ' : 'تسجيل الإنجاز'}</button>
      ${readingHistoryHTML()}
    `;
  }
  if (hisnId === 'prep') {
    return `
      <div class="field"><label>الصفحة أو المقطع المراد حفظه</label>
        <input type="text" id="f_segment" value="${log.prep.segment || ''}" placeholder="مثال: من ص 12 إلى ص 13"></div>
      <div class="field"><label>ملاحظات مواضع الوقف والكلمات الصعبة</label>
        <textarea id="f_prepNotes" placeholder="اكتب مواضع الوقف والكلمات التي تحتاج انتباهًا">${log.prep.notes || ''}</textarea></div>
      <button class="btn" id="f_save">${log.prep.done ? 'تحديث تسجيل التحضير' : 'تسجيل أن التحضير قد تم'}</button>
    `;
  }
  if (hisnId === 'newMemorization') {
    const statuses = ['بدأ', 'جارٍ', 'مكتمل'];
    return `
      <div class="field"><label>مقدار الحفظ الجديد اليوم</label>
        <input type="text" id="f_amount" value="${log.newMemorization.amount || ''}" placeholder="مثال: ${state.settings.dailyMemorize}"></div>
      <div class="field"><label>حالة الإنجاز</label>
        <div class="chip-row" id="f_statusChips">
          ${statuses.map((s) => `<div class="chip ${log.newMemorization.status === s ? 'active' : ''}" data-val="${s}">${s}</div>`).join('')}
        </div></div>
      <div class="field"><label>ملاحظات (اختياري)</label>
        <textarea id="f_memNotes" placeholder="أي ملاحظات على الحفظ الجديد">${log.newMemorization.notes || ''}</textarea></div>
      <button class="btn" id="f_save">حفظ</button>
      <p style="font-size:.75rem;color:var(--muted);margin-top:10px">عند اختيار الحالة «مكتمل» سيُضاف هذا المقطع تلقائيًا إلى خطة مراجعة القريب ثم مراجعة البعيد.</p>
    `;
  }
  if (hisnId === 'nearReview') {
    const items = getNearReviewItems(iso);
    if (!items.length) {
      return emptyStateHTML('🌱', 'لا يوجد محفوظ حديث يحتاج مراجعة قريبة بعد. سجّل حفظًا جديدًا من حصن الحفظ الجديد لتبدأ الخطة.');
    }
    const doneIds = log.nearReviewDone || [];
    return items.map((it) => reviewItemHTML(it.id, it.range || it.dateMemorized, `حُفظ بتاريخ ${it.dateMemorized}`, doneIds.includes(it.id), 'near')).join('');
  }
  if (hisnId === 'farReview') {
    const items = getFarReviewItemsDueToday();
    if (!items.length) {
      return emptyStateHTML('🏛️', 'لا يوجد مقاطع مستحقة لمراجعة البعيد اليوم. سيظهر هنا كل ما يستحق المراجعة وفق الجدول التلقائي.');
    }
    const doneIds = log.farReviewDone || [];
    return items.map((q) => {
      const m = findMemById(q.memId);
      const label = m ? (m.range || m.dateMemorized) : q.memId;
      return reviewItemHTML(q.memId, label, `آخر فترة مراجعة: ${q.interval} يومًا`, doneIds.includes(q.memId), 'far');
    }).join('');
  }
  return '';
}
function emptyStateHTML(emoji, text) {
  return `<div class="empty-state"><span class="emoji">${emoji}</span>${text}</div>`;
}
function reviewItemHTML(id, title, sub, isDone, kind) {
  return `
    <div class="review-item" data-id="${id}" data-kind="${kind}">
      <div class="review-item-head">
        <div><div class="review-item-title">${title}</div><div class="review-item-date">${sub}</div></div>
        <input type="checkbox" ${isDone ? 'checked' : ''} class="review-check" style="width:20px;height:20px;">
      </div>
      <div class="quality-row">
        <div class="quality-btn excellent" data-q="excellent">ممتاز</div>
        <div class="quality-btn good" data-q="good">جيد</div>
        <div class="quality-btn redo" data-q="redo">يحتاج إعادة</div>
      </div>
    </div>
  `;
}
function readingHistoryHTML() {
  const days = [];
  for (let i = 1; i <= 6; i++) {
    const iso = addDaysISO(todayISO(), -i);
    const log = state.logs[iso];
    if (log && log.reading.pages) days.push(`${iso}: ${log.reading.pages} صفحة`);
  }
  if (!days.length) return '';
  return `<div class="field"><label>سجل الأيام الماضية</label><div style="font-size:.8rem;color:var(--muted);line-height:1.9">${days.join('<br>')}</div></div>`;
}

function attachModalHandlers(hisnId) {
  document.getElementById('modalBody').querySelectorAll('.review-item').forEach((el) => {
    el.querySelectorAll('.quality-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.quality-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const check = el.querySelector('.review-check');
        check.checked = true;
        saveReviewItem(el.dataset.kind, el.dataset.id, btn.dataset.q);
      });
    });
    el.querySelector('.review-check').addEventListener('change', (e) => {
      if (!e.target.checked) {
        el.querySelectorAll('.quality-btn').forEach((b) => b.classList.remove('active'));
        saveReviewItem(el.dataset.kind, el.dataset.id, null);
      }
    });
  });

  if (hisnId === 'newMemorization') {
    document.querySelectorAll('#f_statusChips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#f_statusChips .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  }

  const saveBtn = document.getElementById('f_save');
  if (saveBtn) saveBtn.addEventListener('click', () => saveHisnForm(hisnId));
}

function saveReviewItem(kind, id, quality) {
  const iso = todayISO();
  const log = ensureLog(iso);
  if (kind === 'near') {
    log.nearReviewDone = log.nearReviewDone || [];
    const idx = log.nearReviewDone.indexOf(id);
    if (quality) { if (idx === -1) log.nearReviewDone.push(id); }
    else if (idx !== -1) log.nearReviewDone.splice(idx, 1);
  } else if (kind === 'far') {
    log.farReviewDone = log.farReviewDone || [];
    const idx = log.farReviewDone.indexOf(id);
    if (quality) {
      if (idx === -1) log.farReviewDone.push(id);
      rescheduleFarItem(id, quality);
    } else if (idx !== -1) {
      log.farReviewDone.splice(idx, 1);
    }
  }
  saveState();
}
function rescheduleFarItem(memId, quality) {
  const q = state.farQueue.find((x) => x.memId === memId);
  if (!q) return;
  const s = state.settings;
  if (quality === 'excellent') {
    q.interval = Math.min(s.farCap, Math.round(q.interval * s.farGrowth));
  } else if (quality === 'good') {
    // نفس الفترة تقريبًا
    q.interval = q.interval;
  } else if (quality === 'redo') {
    q.interval = s.farBaseInterval;
  }
  q.dueDate = addDaysISO(todayISO(), q.interval);
  q.lastQuality = quality;
}

function saveHisnForm(hisnId) {
  const iso = todayISO();
  const log = ensureLog(iso);
  if (hisnId === 'reading') {
    const pages = document.getElementById('f_pages').value;
    log.reading.pages = pages;
    log.reading.note = document.getElementById('f_readNote').value;
    log.reading.done = !!pages;
    showToast('تم تسجيل ورد القراءة');
  }
  if (hisnId === 'prep') {
    log.prep.segment = document.getElementById('f_segment').value;
    log.prep.notes = document.getElementById('f_prepNotes').value;
    log.prep.done = !!log.prep.segment;
    showToast('تم تسجيل التحضير');
  }
  if (hisnId === 'newMemorization') {
    const amount = document.getElementById('f_amount').value;
    const activeChip = document.querySelector('#f_statusChips .chip.active');
    const status = activeChip ? activeChip.dataset.val : log.newMemorization.status;
    const notes = document.getElementById('f_memNotes').value;
    const prevStatus = log.newMemorization.status;
    log.newMemorization.amount = amount;
    log.newMemorization.status = status;
    log.newMemorization.notes = notes;

    if (status === 'مكتمل' && prevStatus !== 'مكتمل') {
      const id = 'm_' + Date.now();
      state.memorizations.push({ id, dateMemorized: iso, range: amount, status: 'مكتمل', notes });
      log.newMemorization.memId = id;
    } else if (status === 'مكتمل' && log.newMemorization.memId) {
      const m = findMemById(log.newMemorization.memId);
      if (m) { m.range = amount; m.notes = notes; }
    }
    showToast('تم حفظ بيانات الحفظ الجديد');
  }
  saveState();
  closeModal();
}

/* ---------------- Calendar ---------------- */
function renderCalendar() {
  const y = calendarCursor.getFullYear(), m = calendarCursor.getMonth();
  document.getElementById('calTitle').textContent = `${MONTHS_AR[m]} ${y}`;
  const weekdaysRow = document.getElementById('calWeekdays');
  weekdaysRow.innerHTML = WEEKDAYS_AR.map((w) => `<span>${w}</span>`).join('');

  const firstDay = new Date(y, m, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }
  const today = todayISO();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(y, m, d);
    const iso = toISO(dateObj);
    const cell = document.createElement('div');
    let cls = 'gray';
    if (iso < today) {
      cls = dayOverallState(iso) === 'gray' ? 'red' : dayOverallState(iso);
    } else if (iso === today) {
      cls = dayOverallState(iso);
    }
    cell.className = `cal-day ${cls}${iso === today ? ' today' : ''}`;
    cell.textContent = d;
    grid.appendChild(cell);
  }
  document.getElementById('streakBanner').textContent = `🔥 ${computeStreak()} يوم متتالٍ`;
}
function computeStreak() {
  let streak = 0;
  let cursor = todayISO();
  // اليوم يُحتسب إن كان مكتملاً، وإلا نبدأ العد من الأمس
  if (dayOverallState(cursor) !== 'green') cursor = addDaysISO(cursor, -1);
  while (state.logs[cursor] && dayOverallState(cursor) === 'green') {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

/* ---------------- Stats ---------------- */
function renderStats() {
  let readPages = 0, memPages = 0, memSessions = 0, reviewSessions = 0;
  let completedDays = 0, totalDays = 0;
  Object.keys(state.logs).forEach((iso) => {
    const log = state.logs[iso];
    totalDays++;
    if (log.reading.pages) readPages += Number(log.reading.pages) || 0;
    if (log.newMemorization.status === 'مكتمل') memSessions++;
    reviewSessions += (log.nearReviewDone || []).length + (log.farReviewDone || []).length;
    if (dayOverallState(iso) === 'green') completedDays++;
  });
  memPages = state.memorizations.filter((m) => m.status === 'مكتمل').length;
  const commitment = totalDays ? Math.round((completedDays / totalDays) * 100) : 0;
  const streak = computeStreak();
  const estMinutes = memSessions * 20 + reviewSessions * 10 + Math.round(readPages * 2);

  const stats = [
    { v: memPages, l: 'مقاطع محفوظة' },
    { v: readPages, l: 'صفحات مقروءة' },
    { v: memSessions, l: 'جلسات حفظ' },
    { v: reviewSessions, l: 'جلسات مراجعة' },
    { v: commitment + '%', l: 'نسبة الالتزام' },
    { v: streak, l: 'أيام متتالية' },
    { v: estMinutes + ' د', l: 'وقت تقريبي في الحفظ والمراجعة' },
  ];
  document.getElementById('statsGrid').innerHTML = stats.map((s) => `
    <div class="stat-card"><div class="stat-value">${s.v}</div><div class="stat-label">${s.l}</div></div>
  `).join('');
}

/* ---------------- Settings ---------------- */
function renderSettings() {
  const s = state.settings;
  const remLabels = { reading: 'حصن القراءة', prep: 'حصن التحضير', newMemorization: 'حصن الحفظ الجديد', nearReview: 'مراجعة القريب', farReview: 'مراجعة البعيد' };
  document.getElementById('settingsList').innerHTML = `
    <div class="settings-group">
      <h4>المقادير اليومية</h4>
      <div class="settings-row"><label>مقدار الحفظ اليومي</label><input type="text" id="s_dailyMemorize" value="${s.dailyMemorize}"></div>
      <div class="settings-row"><label>مقدار القراءة اليومية</label><input type="text" id="s_dailyRead" value="${s.dailyRead}"></div>
    </div>
    <div class="settings-group">
      <h4>أوقات التنبيهات</h4>
      ${HISUN.map((h) => `
        <div class="settings-row">
          <label>${remLabels[h.id]}</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="time" data-rem="${h.id}" value="${s.reminders[h.id]}">
            <label class="switch"><input type="checkbox" data-remon="${h.id}" ${s.remindersOn[h.id] ? 'checked' : ''}><span class="slider-toggle"></span></label>
          </div>
        </div>`).join('')}
    </div>
    <div class="settings-group">
      <h4>المظهر</h4>
      <div class="settings-row"><label>الوضع الليلي</label>
        <label class="switch"><input type="checkbox" id="s_theme" ${s.theme === 'dark' ? 'checked' : ''}><span class="slider-toggle"></span></label>
      </div>
      <div class="settings-row font-size-row"><label>حجم الخط</label>
        <div class="chip-row">
          <div class="chip ${s.fontSize === 'small' ? 'active' : ''}" data-font="small">صغير</div>
          <div class="chip ${s.fontSize === 'medium' ? 'active' : ''}" data-font="medium">متوسط</div>
          <div class="chip ${s.fontSize === 'large' ? 'active' : ''}" data-font="large">كبير</div>
        </div>
      </div>
    </div>
    <div class="settings-group">
      <h4>النسخ الاحتياطي</h4>
      <button class="btn secondary" id="s_export" style="margin-bottom:10px">تنزيل نسخة احتياطية</button>
      <label class="btn secondary" style="display:block;text-align:center">
        استيراد نسخة احتياطية
        <input type="file" id="s_import" accept="application/json" style="display:none">
      </label>
    </div>
    <button class="btn" id="s_save">حفظ الإعدادات</button>
  `;
  document.querySelectorAll('#settingsList .chip[data-font]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#settingsList .chip[data-font]').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
  document.getElementById('s_export').addEventListener('click', exportBackup);
  document.getElementById('s_import').addEventListener('change', importBackup);
  document.getElementById('s_save').addEventListener('click', saveSettingsForm);
}
function saveSettingsForm() {
  const s = state.settings;
  s.dailyMemorize = document.getElementById('s_dailyMemorize').value;
  s.dailyRead = document.getElementById('s_dailyRead').value;
  document.querySelectorAll('[data-rem]').forEach((inp) => { s.reminders[inp.dataset.rem] = inp.value; });
  document.querySelectorAll('[data-remon]').forEach((inp) => { s.remindersOn[inp.dataset.remon] = inp.checked; });
  s.theme = document.getElementById('s_theme').checked ? 'dark' : 'light';
  const activeFont = document.querySelector('#settingsList .chip[data-font].active');
  s.fontSize = activeFont ? activeFont.dataset.font : s.fontSize;
  applyTheme();
  saveState();
  showToast('تم حفظ الإعدادات');
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.settings.theme);
  const scale = { small: 0.92, medium: 1, large: 1.15 }[state.settings.fontSize] || 1;
  document.documentElement.style.setProperty('--font-scale', scale);
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `husun-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('تم تنزيل النسخة الاحتياطية');
}
function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const base = defaultState();
      state = {
        settings: { ...base.settings, ...(parsed.settings || {}) },
        logs: parsed.logs || {},
        memorizations: parsed.memorizations || [],
        farQueue: parsed.farQueue || [],
      };
      saveState();
      applyTheme();
      renderAll();
      showToast('تم استيراد النسخة الاحتياطية بنجاح');
    } catch (err) {
      showToast('ملف النسخة الاحتياطية غير صالح');
    }
  };
  reader.readAsText(file);
}

/* ---------------- Navigation ---------------- */
function switchScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.screen === name));
  if (name === 'calendar') renderCalendar();
  if (name === 'stats') renderStats();
  if (name === 'settings') renderSettings();
  if (name === 'home') renderHome();
}

/* ---------------- Toast ---------------- */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- Notifications ---------------- */
function initNotifications() {
  const btn = document.getElementById('notifBtn');
  btn.addEventListener('click', async () => {
    if (!('Notification' in window)) { showToast('المتصفح لا يدعم التنبيهات'); return; }
    const perm = await Notification.requestPermission();
    showToast(perm === 'granted' ? 'تم تفعيل التنبيهات' : 'لم يتم منح إذن التنبيهات');
  });
  setInterval(checkReminders, 20000);
}
const firedToday = new Set();
function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const iso = todayISO();
  HISUN.forEach((h) => {
    const key = `${iso}_${h.id}`;
    if (!state.settings.remindersOn[h.id]) return;
    if (state.settings.reminders[h.id] === hhmm && !firedToday.has(key)) {
      firedToday.add(key);
      new Notification('الحصون الخمسة', { body: `حان وقت ${h.name}`, icon: 'icons/icon-192.png' });
    }
  });
}

/* ---------------- Init ---------------- */
function renderAll() {
  const now = new Date();
  document.getElementById('hijriDate').textContent = hijriString(now);
  document.getElementById('gregDate').textContent = gregString(now);
  renderHome();
}

function init() {
  applyTheme();
  renderAll();

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
  });
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
  document.getElementById('calPrev').addEventListener('click', () => {
    calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    renderCalendar();
  });
  initNotifications();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
