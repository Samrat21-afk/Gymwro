(function(){
  // ---------------- State ----------------
  const STEP_NAMES = ['Connect', 'Calibrate', 'Live Set', 'Summary'];
  const HISTORY_KEY = 'gymwro_history_v1';
  const SESSION_HISTORY_KEY = 'gymwro_session_history_v1';
  const SOUND_KEY = 'gymwro_sound_on';
  const SEED_KEY = 'gymwro_history_seeded_v6';

  const state = {
    step: 0,
    connMode: null, // 'serial' | 'demo'
    serialPort: null,
    reader: null,
    exercise: 'Biceps Curl',
    calibrating: false,
    calRepsSeen: 0,
    soundOn: readSoundPref(),
    baseline: { emg: 500, rom: 90 },
    live: {
      running: false,
      samples: [],
      chartWindow: 40,
      lastRepCount: 0,
      qualityScores: [],
      goodReps: 0,
      droppingReps: 0,
      streak: 0,
      bestStreak: 0,
      streakBadgesHit: new Set(),
      nearFailureAlerted: false,
      startTime: null,
      demoTimer: null,
      demoState: { t: 0, rep: 0, phase: 0 }
    },
    historyUi: {
      open: false,
      metric: 'reps',
      exercise: 'all',
      chart: null
    }
  };

  const $ = (id) => document.getElementById(id);

  function log(msg){
    const el = $('connLog');
    if (el) el.textContent = msg;
  }

  function setTopStatus(text, mode){
    const el = $('topStatus');
    if (el) el.textContent = text;
    const mark = $('brandMark');
    if (mark) mark.className = 'brand-mark' + (mode ? ' ' + mode : '');
  }

  // ---------------- Local history / personal records ----------------
  function loadHistory(){
    try{
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
    }catch(e){ return {}; }
  }
  function saveHistory(h){
    try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }catch(e){}
  }
  function loadSessionHistory(){
    try{
      const data = JSON.parse(localStorage.getItem(SESSION_HISTORY_KEY));
      return Array.isArray(data) ? data : [];
    }catch(e){ return []; }
  }
  function saveSessionHistory(items){
    try{ localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(items)); }catch(e){}
  }
  function readSoundPref(){
    try{ return localStorage.getItem(SOUND_KEY) !== 'off'; }catch(e){ return true; }
  }

  function seedImaginaryHistory(){
    try{
      if (localStorage.getItem(SEED_KEY) === 'done') return;

      const sessions = [];
      const now = new Date();
      const exercises = [
        'Biceps Curl',
        'Squat',
        'Bench Press',
        'Shoulder Press',
        'Lateral Raise'
      ];

      const freakPlans = {
        'Biceps Curl': [6, 18, 9, 24, 12, 28, 15, 31],
        'Squat': [8, 22, 11, 29, 14, 34, 18, 38],
        'Bench Press': [5, 14, 8, 19, 11, 23, 13, 27],
        'Shoulder Press': [4, 12, 7, 17, 9, 20, 12, 24],
        'Lateral Raise': [7, 19, 10, 25, 13, 30, 16, 33]
      };

      exercises.forEach((exercise, exerciseIndex) => {
        const repsPlan = freakPlans[exercise];
        repsPlan.forEach((repCount, i) => {
          const date = new Date(now);
          const dayBack = 13 - i - (exerciseIndex % 2);
          date.setDate(now.getDate() - Math.max(0, dayBack));
          date.setHours(5 + ((i + exerciseIndex * 2) % 14), 6 + ((i * 11 + exerciseIndex * 3) % 50), 0, 0);

          const intensityBand = i % 3;
          const avgSpeed = intensityBand === 0
            ? +(0.82 + exerciseIndex * 0.03 + Math.random() * 0.16).toFixed(2)
            : intensityBand === 1
            ? +(1.22 + exerciseIndex * 0.05 + Math.random() * 0.24).toFixed(2)
            : +(1.68 + exerciseIndex * 0.06 + Math.random() * 0.32).toFixed(2);

          const fatigue = Math.max(25, Math.min(98,
            repCount >= 30 ? 93 + Math.random() * 4 :
            repCount >= 24 ? 84 + Math.random() * 8 :
            repCount >= 17 ? 68 + Math.random() * 12 :
            repCount >= 10 ? 50 + Math.random() * 15 :
            32 + Math.random() * 18
          ));

          const lastRepSpeed = +(avgSpeed + 0.18 + Math.random() * 0.42).toFixed(2);
          const bestStreak = Math.max(2, Math.min(repCount, Math.round(repCount * (0.35 + Math.random() * 0.45))));
          const goodReps = Math.max(0, Math.min(repCount, Math.round(repCount * (0.45 + Math.random() * 0.45))));
          const droppingReps = Math.max(0, repCount - goodReps);
          const romDrop = +(Math.random() * 9.5).toFixed(1);
          const durationSec = 16 + repCount * (1.7 + Math.random() * 1.8);
          const finalStatus = fatigue >= 85
            ? 'Rep quality breaking down'
            : fatigue >= 65
            ? 'Near failure'
            : 'Fatigue building';

          sessions.push({
            id: `seed-v6-${exerciseIndex}-${i}`,
            exercise,
            date: date.toISOString(),
            totalReps: repCount,
            avgSpeed,
            lastRepSpeed,
            fatigueScore: Math.round(fatigue),
            romDrop,
            goodReps,
            droppingReps,
            bestStreak,
            finalStatus,
            durationSec: Math.round(durationSec),
            notes: 'Sample data — seeded high-variance workout history from the last two weeks.',
            isSampleData: true,
            dataLabel: 'Sample Data'
          });
        });
      });

      sessions.sort((a,b)=> new Date(b.date) - new Date(a.date));
      saveSessionHistory(sessions);

      const records = {};
      const sortedAsc = [...sessions].sort((a,b)=> new Date(a.date) - new Date(b.date));
      sortedAsc.forEach((session) => {
        const current = records[session.exercise] || {
          bestReps: 0,
          bestStreak: 0,
          bestAvgSpeed: null,
          setsCompleted: 0,
          lastReps: null,
          lastAvgSpeed: null
        };
        current.bestReps = Math.max(current.bestReps, session.totalReps);
        current.bestStreak = Math.max(current.bestStreak, session.bestStreak);
        current.bestAvgSpeed = current.bestAvgSpeed === null ? session.avgSpeed : Math.min(current.bestAvgSpeed, session.avgSpeed);
        current.setsCompleted += 1;
        current.lastReps = session.totalReps;
        current.lastAvgSpeed = session.avgSpeed;
        records[session.exercise] = current;
      });

      saveHistory(records);
      localStorage.setItem(SEED_KEY, 'done');
    }catch(e){}
  }

  // ---------------- Inject history feature UI ----------------
  function injectHistoryFeature(){
    const app = document.querySelector('.app');
    if (!app || $('btnHistory')) return;

    const historyButton = document.createElement('button');
    historyButton.id = 'btnHistory';
    historyButton.className = 'btn history-launch-btn';
    historyButton.type = 'button';
    historyButton.innerHTML = `
      <span class="history-launch-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3v5h5"></path>
          <path d="M3.05 13a9 9 0 1 0 2.13-5.91L3 8"></path>
          <path d="M12 7v5l3 2"></path>
        </svg>
      </span>
      <span class="history-launch-copy">View Workout History</span>
    `;

    const headerRight = document.querySelector('.header-right');
    if (headerRight) headerRight.prepend(historyButton);

    const style = document.createElement('style');
    style.textContent = `
      .history-launch-btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 34px;
        padding: 7px 11px;
        border-radius: 10px;
        border: 1px solid rgba(11, 180, 148, 0.18);
        background: #f7fbfa;
        color: var(--navy);
        box-shadow: 0 1px 4px rgba(33, 38, 44, 0.04);
        transition: background 0.18s ease, border-color 0.18s ease, transform 0.12s ease;
        font-size: 13px;
      }
      .history-launch-btn:hover {
        background: #eef8f5;
        border-color: rgba(11, 180, 148, 0.34);
      }
      .history-launch-btn:active { transform: scale(0.98); }
      .history-launch-icon {
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--teal);
      }
      .history-launch-icon svg { width: 16px; height: 16px; }
      .history-launch-copy {
        font-size: 12.5px;
        font-weight: 600;
        white-space: nowrap;
      }
      .history-modal {
        position: fixed;
        inset: 0;
        z-index: 300;
        background: rgba(33, 38, 44, 0.46);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }
      .history-modal.open { display: flex; }
      .history-dialog {
        width: min(960px, 100%);
        max-height: min(88vh, 920px);
        overflow: auto;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: 0 24px 60px rgba(33, 38, 44, 0.24);
        padding: 22px;
      }
      .history-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 16px;
      }
      .history-kicker {
        font-family: var(--font-mono);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--teal);
        font-weight: 700;
        margin-bottom: 6px;
      }
      .history-title {
        font-family: var(--font-display);
        font-size: clamp(24px, 4vw, 32px);
        line-height: 1;
        margin: 0 0 6px;
      }
      .history-sub {
        color: var(--text-dim);
        font-size: 13px;
        line-height: 1.5;
      }
      .history-close {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--surface-2);
        color: var(--text-dim);
        font-size: 22px;
        line-height: 1;
      }
      .history-toolbar {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .history-toolbar select {
        max-width: 220px;
      }
      .history-chart-card {
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 14px 14px 10px;
        margin-bottom: 16px;
      }
      .history-chart-title {
        font-family: var(--font-mono);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
        margin-bottom: 10px;
        font-weight: 700;
      }
      .history-chart-wrap {
        position: relative;
        height: 260px;
      }
      .history-empty {
        padding: 22px;
        border: 1px dashed var(--border-bright);
        border-radius: 12px;
        text-align: center;
        color: var(--text-dim);
        background: var(--surface-2);
      }
      .history-list {
        display: grid;
        gap: 12px;
      }
      .history-session {
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 14px;
        background: linear-gradient(180deg, #ffffff 0%, #fbfbfa 100%);
      }
      .history-session-top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      .history-session-title {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .history-session h4 {
        margin: 0;
        font-size: 17px;
        color: var(--text);
      }
      .sample-tag {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #8a5a00;
        background: rgba(226, 166, 59, 0.12);
        border: 1px solid rgba(226, 166, 59, 0.3);
        border-radius: 999px;
        padding: 4px 8px;
      }
      .history-date {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-dim);
      }
      .history-session-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
      }
      .history-mini {
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
      }
      .history-mini .v {
        font-family: var(--font-display);
        font-size: 24px;
        line-height: 1;
        color: var(--text);
      }
      .history-mini .l {
        margin-top: 4px;
        font-family: var(--font-mono);
        font-size: 9.5px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
      }
      .history-session-note {
        margin-top: 10px;
        font-size: 12.5px;
        color: var(--text-dim);
        line-height: 1.5;
      }
      @media (max-width: 640px) {
        .history-dialog { padding: 16px; border-radius: 14px; }
        .history-chart-wrap { height: 220px; }
        .history-launch-copy { display: none; }
        .history-launch-btn { padding: 7px 9px; min-width: 34px; justify-content: center; }
      }
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'historyModal';
    modal.className = 'history-modal';
    modal.innerHTML = `
      <div class="history-dialog" role="dialog" aria-modal="true" aria-labelledby="historyTitle">
        <div class="history-header">
          <div>
            <div class="history-kicker">Workout archive</div>
            <h2 class="history-title" id="historyTitle">Workout History</h2>
            <div class="history-sub">Review previous sets and see irregular progress trends over time.</div>
          </div>
          <button type="button" class="history-close" id="btnCloseHistory" aria-label="Close workout history">×</button>
        </div>
        <div class="history-toolbar">
          <select id="historyExerciseFilter"></select>
          <select id="historyMetricFilter">
            <option value="reps">Total reps</option>
            <option value="fatigue">Fatigue score</option>
            <option value="streak">Best streak</option>
            <option value="speed">Avg rep speed</option>
          </select>
        </div>
        <div class="history-chart-card">
          <div class="history-chart-title">Progress graph</div>
          <div class="history-chart-wrap"><canvas id="historyChartCanvas"></canvas></div>
        </div>
        <div id="historyList" class="history-list"></div>
      </div>
    `;
    app.appendChild(modal);

    historyButton.addEventListener('click', openHistoryModal);
    modal.addEventListener('click', (e)=>{
      if (e.target === modal) closeHistoryModal();
    });
    modal.querySelector('#btnCloseHistory').addEventListener('click', closeHistoryModal);
    modal.querySelector('#historyExerciseFilter').addEventListener('change', (e)=>{
      state.historyUi.exercise = e.target.value;
      renderHistoryModal();
    });
    modal.querySelector('#historyMetricFilter').addEventListener('change', (e)=>{
      state.historyUi.metric = e.target.value;
      renderHistoryModal();
    });
  }

  function openHistoryModal(){
    state.historyUi.open = true;
    const modal = $('historyModal');
    if (modal) modal.classList.add('open');
    renderHistoryModal();
  }

  function closeHistoryModal(){
    state.historyUi.open = false;
    const modal = $('historyModal');
    if (modal) modal.classList.remove('open');
  }

  function getMetricConfig(metric){
    switch(metric){
      case 'fatigue': return { key: 'fatigueScore', label: 'Fatigue score', color: '#ec3d3f' };
      case 'streak': return { key: 'bestStreak', label: 'Best streak', color: '#0bb494' };
      case 'speed': return { key: 'avgSpeed', label: 'Avg rep speed', color: '#e2a63b' };
      default: return { key: 'totalReps', label: 'Total reps', color: '#21262c' };
    }
  }

  function getFilteredSessions(){
    const all = loadSessionHistory();
    return all
      .filter(item => state.historyUi.exercise === 'all' ? true : item.exercise === state.historyUi.exercise)
      .sort((a,b)=> new Date(b.date) - new Date(a.date));
  }

  function renderHistoryModal(){
    const modal = $('historyModal');
    if (!modal || !state.historyUi.open) return;

    const sessions = loadSessionHistory();
    const exercises = ['all', ...new Set(sessions.map(s => s.exercise))];
    const exerciseFilter = $('historyExerciseFilter');
    if (exerciseFilter){
      exerciseFilter.innerHTML = exercises.map(ex => `<option value="${ex}">${ex === 'all' ? 'All exercises' : ex}</option>`).join('');
      exerciseFilter.value = state.historyUi.exercise;
    }
    const metricFilter = $('historyMetricFilter');
    if (metricFilter) metricFilter.value = state.historyUi.metric;

    const filtered = getFilteredSessions();
    renderHistoryChart(filtered);
    renderHistoryList(filtered);
  }

  function renderHistoryChart(filtered){
    const canvas = $('historyChartCanvas');
    if (!canvas || typeof Chart === 'undefined') return;
    const metric = getMetricConfig(state.historyUi.metric);
    const asc = [...filtered].sort((a,b)=> new Date(a.date) - new Date(b.date));
    const labels = asc.map(item => {
      const d = new Date(item.date);
      return `${d.getMonth()+1}/${d.getDate()}`;
    });
    const data = asc.map(item => Number(item[metric.key] || 0));

    if (state.historyUi.chart) {
      try { state.historyUi.chart.destroy(); } catch(e){}
      state.historyUi.chart = null;
    }

    state.historyUi.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: metric.label,
          data,
          borderColor: metric.color,
          backgroundColor: metric.color + '22',
          pointBackgroundColor: metric.color,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 5,
          tension: 0.32,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items){
                const i = items[0]?.dataIndex ?? 0;
                const entry = asc[i];
                return entry ? `${entry.exercise} • ${new Date(entry.date).toLocaleDateString()}` : '';
              },
              label(ctx){
                const i = ctx.dataIndex;
                const entry = asc[i];
                const suffix = state.historyUi.metric === 'speed' ? 's' : state.historyUi.metric === 'fatigue' ? '%' : '';
                const base = `${metric.label}: ${ctx.parsed.y}${suffix}`;
                return entry?.isSampleData ? `${base} • Sample Data` : base;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#e0ddd6' },
            ticks: { color: '#656d75' }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#e0ddd6' },
            ticks: { color: '#656d75' }
          }
        }
      }
    });
  }

  function renderHistoryList(filtered){
    const list = $('historyList');
    if (!list) return;
    if (!filtered.length){
      list.innerHTML = `<div class="history-empty">No workout history yet. Complete a set to build your timeline.</div>`;
      return;
    }

    list.innerHTML = filtered.map(item => {
      const dateText = new Date(item.date).toLocaleString([], {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      return `
        <div class="history-session">
          <div class="history-session-top">
            <div>
              <div class="history-session-title">
                <h4>${item.exercise}</h4>
                ${item.isSampleData ? `<span class="sample-tag">Sample Data</span>` : ''}
              </div>
              <div class="history-date">${dateText}</div>
            </div>
            <div class="history-date">${item.finalStatus || 'Set logged'}</div>
          </div>
          <div class="history-session-grid">
            <div class="history-mini"><div class="v">${item.totalReps ?? 0}</div><div class="l">Total reps</div></div>
            <div class="history-mini"><div class="v">${item.bestStreak ?? 0}</div><div class="l">Best streak</div></div>
            <div class="history-mini"><div class="v">${item.avgSpeed != null ? Number(item.avgSpeed).toFixed(2) + 's' : '0.00s'}</div><div class="l">Avg speed</div></div>
            <div class="history-mini"><div class="v">${item.fatigueScore ?? 0}%</div><div class="l">Fatigue</div></div>
            <div class="history-mini"><div class="v">${item.goodReps ?? 0}</div><div class="l">Good reps</div></div>
            <div class="history-mini"><div class="v">${item.droppingReps ?? 0}</div><div class="l">Drop reps</div></div>
          </div>
          ${item.notes ? `<div class="history-session-note">${item.notes}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function saveCompletedSession(summary){
    const current = loadSessionHistory();
    current.unshift(summary);
    current.sort((a,b)=> new Date(b.date) - new Date(a.date));
    saveSessionHistory(current);
  }

  // ---------------- Haptics & sound ----------------
  function vibrate(pattern){
    try{ if (navigator.vibrate) navigator.vibrate(pattern); }catch(e){}
  }

  let audioCtx = null;
  function beep(freq, duration, gain){
    if (!state.soundOn) return;
    try{
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.value = gain || 0.05;
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.stop(audioCtx.currentTime + duration);
    }catch(e){}
  }

  function updateSoundIcon(){
    const btn = $('btnSound');
    if (!btn) return;
    btn.classList.toggle('on', state.soundOn);
    const waves = $('soundWaves');
    if (waves) waves.style.display = state.soundOn ? 'block' : 'none';
  }
  const btnSound = $('btnSound');
  if (btnSound){
    btnSound.addEventListener('click', ()=>{
      state.soundOn = !state.soundOn;
      try{ localStorage.setItem(SOUND_KEY, state.soundOn ? 'on' : 'off'); }catch(e){}
      updateSoundIcon();
      if (state.soundOn) beep(660, 0.12, 0.06);
    });
  }
  updateSoundIcon();

  // ---------------- Toasts ----------------
  function showToast(title, msg){
    const stack = $('toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="tt">${title}</div><div class="tm">${msg}</div>`;
    stack.appendChild(el);
    setTimeout(()=> el.remove(), 3100);
  }

  // ---------------- Step Navigation ----------------
  function goToStep(n){
    state.step = n;
    document.querySelectorAll('.screen').forEach((el,i)=>{
      el.style.display = (i===n) ? 'block' : 'none';
    });
    document.querySelectorAll('.step').forEach((el)=>{
      const idx = parseInt(el.dataset.step,10);
      el.classList.toggle('active', idx===n);
      el.classList.toggle('done', idx<n);
    });
    const caption = $('stepCaption');
    if (caption) caption.textContent = STEP_NAMES[n];
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------- Screen 1: Connection ----------------
  const btnDemo = $('btnDemo');
  if (btnDemo) {
    btnDemo.addEventListener('click', ()=>{
      state.connMode = 'demo';
      setTopStatus('DEMO MODE STREAMING', 'demo');
      log('Demo Mode active — simulated ESP32 stream running at ~20Hz.');
      goToStep(1);
    });
  }

  const btnSerial = $('btnSerial');
  if (btnSerial) {
    btnSerial.addEventListener('click', async ()=>{
      if(!('serial' in navigator)){
        log('Web Serial isn\'t available in this browser. Try Chrome/Edge on desktop, or use Demo Mode.');
        return;
      }
      try{
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        state.serialPort = port;
        state.connMode = 'serial';
        setTopStatus('USB CONNECTED', 'live');
        log('Serial port connected at 115200 baud. Waiting for JSON stream…');
        goToStep(1);
      }catch(err){
        log('Connection cancelled or failed: ' + err.message);
      }
    });
  }

  // ---------------- Screen 2: Calibration ----------------
  const exerciseSelect = $('exerciseSelect');
  if (exerciseSelect) {
    exerciseSelect.addEventListener('change', (e)=>{ state.exercise = e.target.value; });
  }

  const btnStartCal = $('btnStartCal');
  if (btnStartCal) {
    btnStartCal.addEventListener('click', ()=>{
      state.calibrating = true;
      state.calRepsSeen = 0;
      $('calReadout').innerHTML = 'Recording baseline… perform <b>3</b> easy reps now.';
      document.querySelectorAll('.cal-dot').forEach(d=>d.classList.remove('filled'));
      runCalibrationSim();
    });
  }

  function runCalibrationSim(){
    let count = 0;
    const dots = document.querySelectorAll('.cal-dot');
    const iv = setInterval(()=>{
      count++;
      dots[count-1] && dots[count-1].classList.add('filled');
      state.calRepsSeen = count;
      vibrate(12);
      $('calReadout').innerHTML = `Rep ${count} of 3 captured — baseline EMG ~<b>${(480+Math.random()*60|0)} µV</b>, ROM ~<b>${(85+Math.random()*10|0)}°</b>`;
      if(count>=3){
        clearInterval(iv);
        state.baseline.emg = 480+Math.random()*60|0;
        state.baseline.rom = 85+Math.random()*10|0;
        $('calReadout').innerHTML = `Baseline set — EMG <b>${state.baseline.emg} µV</b>, ROM <b>${state.baseline.rom}°</b>. Ready to begin the set.`;
        $('btnToLive').disabled = false;
      }
    }, 700);
  }

  const btnBack1 = $('btnBack1');
  if (btnBack1) btnBack1.addEventListener('click', ()=> goToStep(0));

  const btnToLive = $('btnToLive');
  if (btnToLive) {
    btnToLive.addEventListener('click', ()=>{
      $('liveExerciseName').textContent = state.exercise;
      goToStep(2);
      startLiveSet();
    });
  }

  // ---------------- Gauge ----------------
  function drawGauge(pct){
    const svg = $('gaugeSvg');
    if (!svg) return;
    const cx=110, cy=120, r=95;
    const segColors = ['#0bb494','#e2a63b','#ee7b39','#ec3d3f'];
    let paths = '';
    const segCount = segColors.length;
    const gap = 0.035;
    const startAngle = Math.PI;
    const totalSpan = Math.PI;
    for(let i=0;i<segCount;i++){
      const segStart = startAngle - (totalSpan/segCount)*i;
      const segEnd = startAngle - (totalSpan/segCount)*(i+1) + gap;
      const active = pct >= (i/segCount);
      const x1 = cx + r*Math.cos(segStart), y1 = cy - r*Math.sin(segStart);
      const x2 = cx + r*Math.cos(segEnd), y2 = cy - r*Math.sin(segEnd);
      paths += `<path d="M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}" stroke="${active?segColors[i]:'#e0ddd6'}" stroke-width="14" fill="none" stroke-linecap="round" opacity="${active?1:0.5}"/>`;
    }
    const needleAngle = startAngle - totalSpan*pct;
    const nx = cx + (r-20)*Math.cos(needleAngle), ny = cy - (r-20)*Math.sin(needleAngle);
    const needle = `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#21262c" stroke-width="3.5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5.5" fill="#21262c"/>`;
    svg.innerHTML = paths + needle;
  }
  drawGauge(0);

  // ---------------- Charts ----------------
  Chart.defaults.color = '#656d75';
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.font.size = 10;

  function makeLineChart(ctx, color){
    if (!ctx) return null;
    return new Chart(ctx, {
      type:'line',
      data:{ labels:[], datasets:[{ data:[], borderColor:color, backgroundColor:color+'18', tension:0.35, pointRadius:0, borderWidth:2, fill:true }]},
      options:{
        animation:false, responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false} },
        scales:{
          x:{ display:false },
          y:{ grid:{ color:'#e0ddd6' }, ticks:{ maxTicksLimit:4 } }
        }
      }
    });
  }
  const emgChart = makeLineChart($('emgChart'), '#0bb494');
  const motionChart = makeLineChart($('motionChart'), '#e2a63b');
  const qualityChart = makeLineChart($('qualityChart'), '#21262c');

  function pushChart(chart, val, windowSize){
    if (!chart) return;
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(val);
    if(chart.data.labels.length > windowSize){
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update('none');
  }

  // ---------------- Live Set Logic ----------------
  function statusForFatigue(score){
    if(score < 35) return { text:'Good reps', pct: score/100, cls:'good' };
    if(score < 60) return { text:'Fatigue building', pct: score/100, cls:'warn' };
    if(score < 80) return { text:'Near failure', pct: score/100, cls:'mid' };
    return { text:'Rep quality breaking down', pct: score/100, cls:'danger' };
  }

  const STREAK_MILESTONES = [3, 5, 8, 12];

  function handleSample(sample){
    state.live.samples.push(sample);

    if ($('mReps')) $('mReps').textContent = sample.repCount;
    if ($('mSpeed')) $('mSpeed').textContent = sample.repSpeed.toFixed(1)+'s';
    if ($('mRom')) $('mRom').textContent = Math.round(sample.rom)+'°';
    if ($('mEmg')) $('mEmg').textContent = sample.emg;

    const st = statusForFatigue(sample.fatigueScore);
    const statusPill = $('statusPill');
    if (statusPill) {
      statusPill.textContent = sample.status || st.text;
      statusPill.className = 'status-pill ' + st.cls;
    }

    drawGauge(Math.min(1, sample.fatigueScore/100));

    const banner = $('nearFailureBanner');
    const isNearFailure = sample.fatigueScore >= 65;
    if (banner) banner.classList.toggle('show', isNearFailure);
    if (isNearFailure && !state.live.nearFailureAlerted){
      state.live.nearFailureAlerted = true;
      vibrate([40,60,40]);
      showToast('Heads up', 'Near-failure fatigue detected');
    }

    pushChart(emgChart, sample.emg, state.live.chartWindow);
    pushChart(motionChart, sample.repSpeed, state.live.chartWindow);

    if(sample.repCount > state.live.lastRepCount){
      state.live.lastRepCount = sample.repCount;
      const repQuality = Math.max(0, 100 - sample.fatigueScore - (Math.random()*8));
      state.live.qualityScores.push(repQuality);
      pushChart(qualityChart, repQuality, 20);

      const isGood = repQuality >= 60;
      if (isGood){
        state.live.goodReps++;
        state.live.streak++;
        beep(720, 0.09, 0.045);
      } else {
        state.live.droppingReps++;
        state.live.streak = 0;
        beep(280, 0.12, 0.045);
      }
      state.live.bestStreak = Math.max(state.live.bestStreak, state.live.streak);
      vibrate(14);
      updateStreakUI();

      if (isGood && STREAK_MILESTONES.includes(state.live.streak) && !state.live.streakBadgesHit.has(state.live.streak)){
        state.live.streakBadgesHit.add(state.live.streak);
        vibrate([18,40,18,40,18]);
        showToast(`${state.live.streak}-rep streak`, 'Quality holding strong — keep it up');
      }
    }
  }

  function updateStreakUI(){
    const val = $('streakVal');
    const chip = $('streakChip');
    if (val) val.textContent = state.live.streak;
    if (chip) chip.classList.toggle('hot', state.live.streak >= 3);
  }

  function startLiveSet(){
    state.live.running = true;
    state.live.startTime = Date.now();
    state.live.samples = [];
    state.live.qualityScores = [];
    state.live.goodReps = 0;
    state.live.droppingReps = 0;
    state.live.lastRepCount = 0;
    state.live.streak = 0;
    state.live.bestStreak = 0;
    state.live.streakBadgesHit = new Set();
    state.live.nearFailureAlerted = false;
    updateStreakUI();
    [emgChart, motionChart, qualityChart].forEach(c=>{ if (c) { c.data.labels=[]; c.data.datasets[0].data=[]; c.update('none'); } });

    if(state.connMode === 'demo'){
      startDemoStream();
    } else if(state.connMode === 'serial'){
      startSerialStream();
    }
  }

  function stopLiveSet(){
    state.live.running = false;
    if(state.live.demoTimer){ clearInterval(state.live.demoTimer); state.live.demoTimer=null; }
    if(state.reader){ try{ state.reader.cancel(); }catch(e){} }
  }

  // ---- Demo simulation stream ----
  function startDemoStream(){
    const d = state.live.demoState;
    d.t = 0; d.rep = 0; d.phase = 0;
    state.live.demoTimer = setInterval(()=>{
      d.t += 0.15;
      d.phase += 0.35;
      const repProgress = (Math.sin(d.phase)+1)/2;
      if(repProgress > 0.97 && !d._peaked){ d._peaked = true; }
      if(repProgress < 0.03 && d._peaked){ d._peaked=false; d.rep += 1; }

      const fatigueRamp = Math.min(95, d.rep * 6.5 + Math.random()*4);
      const emgBase = state.baseline.emg + 150*repProgress + fatigueRamp*1.4 + (Math.random()*20-10);
      const rom = Math.max(40, state.baseline.rom - fatigueRamp*0.35 + (Math.random()*4-2));
      const repSpeed = 1.1 + fatigueRamp*0.02 + Math.random()*0.15;
      const status = statusForFatigue(fatigueRamp).text;

      const sample = {
        time: +d.t.toFixed(2),
        emg: Math.round(emgBase),
        accelX: +(Math.sin(d.phase)*0.5).toFixed(2),
        accelY: +(Math.cos(d.phase)*0.8).toFixed(2),
        gyroZ: +(Math.sin(d.phase*1.3)*14).toFixed(1),
        repCount: d.rep,
        rom: Math.round(rom),
        repSpeed: +repSpeed.toFixed(2),
        fatigueScore: Math.round(fatigueRamp),
        status
      };
      handleSample(sample);

      if(d.rep >= 12){
        clearInterval(state.live.demoTimer);
        state.live.demoTimer=null;
        finishSet();
      }
    }, 150);
  }

  // ---- Real serial stream reader ----
  async function startSerialStream(){
    if(!state.serialPort) return;
    const decoder = new TextDecoderStream();
    state.serialPort.readable.pipeTo(decoder.writable);
    const inputStream = decoder.readable;
    state.reader = inputStream.getReader();
    let buffer = '';
    try{
      while(state.live.running){
        const { value, done } = await state.reader.read();
        if(done) break;
        buffer += value;
        let lines = buffer.split('\n');
        buffer = lines.pop();
        for(const line of lines){
          const trimmed = line.trim();
          if(!trimmed) continue;
          try{
            const sample = JSON.parse(trimmed);
            handleSample(sample);
          }catch(e){ }
        }
      }
    }catch(err){
      log('Serial read ended: ' + err.message);
    }
  }

  const btnEndSet = $('btnEndSet');
  if (btnEndSet) btnEndSet.addEventListener('click', ()=>{ finishSet(); });

  function finishSet(){
    stopLiveSet();
    buildSummary();
    goToStep(3);
  }

  // ---------------- Screen 4: Summary ----------------
  function buildSummary(){
    const s = state.live;
    const totalReps = s.lastRepCount;
    const avgSpeed = s.samples.length ? (s.samples.reduce((a,b)=>a+b.repSpeed,0)/s.samples.length) : 0;
    const lastSample = s.samples[s.samples.length-1] || {};
    const finalStatus = lastSample.status || '—';
    const romValues = s.samples.map(x=>x.rom).filter(Boolean);
    const romStart = romValues.slice(0, Math.max(1,Math.floor(romValues.length*0.2)));
    const romEnd = romValues.slice(-Math.max(1,Math.floor(romValues.length*0.2)));
    const avgStart = romStart.reduce((a,b)=>a+b,0)/(romStart.length||1);
    const avgEnd = romEnd.reduce((a,b)=>a+b,0)/(romEnd.length||1);
    const romDrop = avgStart - avgEnd;

    const history = loadHistory();
    const prior = history[state.exercise] || { bestReps: 0, bestStreak: 0, bestAvgSpeed: null, setsCompleted: 0, lastReps: null, lastAvgSpeed: null };
    const prevLastReps = prior.lastReps;
    const prevLastAvgSpeed = prior.lastAvgSpeed;

    const repsPR = totalReps > prior.bestReps;
    const streakPR = s.bestStreak > prior.bestStreak;
    const newRecord = repsPR || streakPR;

    const updated = {
      bestReps: Math.max(prior.bestReps, totalReps),
      bestStreak: Math.max(prior.bestStreak, s.bestStreak),
      bestAvgSpeed: prior.bestAvgSpeed === null ? avgSpeed : Math.min(prior.bestAvgSpeed, avgSpeed),
      setsCompleted: (prior.setsCompleted || 0) + 1,
      lastReps: totalReps,
      lastAvgSpeed: avgSpeed
    };
    history[state.exercise] = updated;
    saveHistory(history);

    saveCompletedSession({
      id: `set-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      exercise: state.exercise,
      date: new Date().toISOString(),
      totalReps,
      avgSpeed: +avgSpeed.toFixed(2),
      lastRepSpeed: +(lastSample.repSpeed || 0).toFixed(2),
      fatigueScore: Math.round(lastSample.fatigueScore || 0),
      romDrop: +romDrop.toFixed(1),
      goodReps: s.goodReps,
      droppingReps: s.droppingReps,
      bestStreak: s.bestStreak,
      finalStatus,
      durationSec: Math.round(((Date.now() - (s.startTime || Date.now())) / 1000)),
      notes: ($('notesField') && $('notesField').value) ? $('notesField').value : ''
    });

    const prBanner = $('prBanner');
    if (prBanner){
      if (newRecord){
        prBanner.classList.add('show');
        const parts = [];
        if (repsPR) parts.push(`${totalReps} reps (was ${prior.bestReps})`);
        if (streakPR) parts.push(`${s.bestStreak}-rep quality streak (was ${prior.bestStreak})`);
        $('prSubtext').textContent = `${state.exercise} — ${parts.join(' · ')}`;
        vibrate([30,50,30,50,60]);
        showToast('New personal best', state.exercise);
      } else {
        prBanner.classList.remove('show');
      }
    }

    const badges = [];
    if (totalReps >= 10) badges.push('10+ rep set');
    if (s.droppingReps === 0 && totalReps > 0) badges.push('Zero quality drops');
    if (s.bestStreak >= 8) badges.push(`${s.bestStreak}-rep streak`);
    if (romDrop <= 3) badges.push('Consistent ROM');
    if (updated.setsCompleted >= 5) badges.push(`${updated.setsCompleted} sets logged`);
    const badgeStrip = $('badgeStrip');
    if (badgeStrip){
      badgeStrip.innerHTML = badges.map(b=>`<div class="earned-badge">${b}</div>`).join('');
    }

    function deltaHtml(curr, prev, higherIsBetter, suffix){
      if (prev === null || prev === undefined) return '';
      const diff = curr - prev;
      if (Math.abs(diff) < 0.01) return `<div class="delta">= vs last set</div>`;
      const better = higherIsBetter ? diff > 0 : diff < 0;
      const arrow = diff > 0 ? '▲' : '▼';
      const sign = diff > 0 ? '+' : '';
      return `<div class="delta ${better?'up':'down'}">${arrow} ${sign}${diff.toFixed(suffix==='s'?2:0)}${suffix} vs last</div>`;
    }

    const cards = [
      { v: totalReps, l: 'Total reps', delta: deltaHtml(totalReps, prevLastReps, true, ''), pr: repsPR },
      { v: avgSpeed.toFixed(2)+'s', l: 'Avg rep speed', delta: deltaHtml(avgSpeed, prevLastAvgSpeed, false, 's'), pr:false },
      { v: (lastSample.repSpeed||0).toFixed(2)+'s', l: 'Last rep speed', delta:'', pr:false },
      { v: (lastSample.fatigueScore||0)+'%', l: 'Est. fatigue', delta:'', pr:false },
      { v: romDrop>3 ? 'Decreased' : 'Stable', l: 'ROM consistency', delta:'', pr:false },
      { v: s.goodReps, l: 'Good reps', delta:'', pr:false },
      { v: s.droppingReps, l: 'Quality-drop reps', delta:'', pr:false },
      { v: s.bestStreak, l: 'Best streak', delta:'', pr: streakPR },
    ];
    if ($('summaryGrid')) {
      $('summaryGrid').innerHTML = cards.map(c=>`<div class="summary-card ${c.pr?'pr-hit':''}"><div class="v">${c.v}</div><div class="l">${c.l}</div>${c.delta}</div>`).join('');
    }

    let fatigueRepMark = null;
    for(const sm of s.samples){ if(sm.fatigueScore>=60 && fatigueRepMark===null){ fatigueRepMark = sm.repCount; } }
    const speedDropRange = totalReps>=3 ? `${Math.max(1,totalReps-2)}–${totalReps}` : '—';

    if ($('summaryNote')) {
      $('summaryNote').innerHTML =
        `${totalReps} reps completed for <b>${state.exercise}</b><br>` +
        (fatigueRepMark ? `Fatigue increased after rep ${fatigueRepMark}<br>` : 'Fatigue stayed low throughout<br>') +
        `Rep speed drifted upward on reps ${speedDropRange}<br>` +
        `Range of motion ${romDrop>3?'decreased near the end':'stayed consistent'}<br>` +
        `Best quality streak this set: <b>${s.bestStreak}</b><br>` +
        `Final status: <span class="final">${finalStatus}</span>`;
    }
  }

  const btnExportCsv = $('btnExportCsv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', ()=>{
      const s = state.live;
      const rows = [['time','exercise','repCount','emg','accelX','accelY','gyroZ','rom','repSpeed','fatigueScore','status']];
      s.samples.forEach(sm=>{
        rows.push([sm.time, state.exercise, sm.repCount, sm.emg, sm.accelX, sm.accelY, sm.gyroZ, sm.rom, sm.repSpeed, sm.fatigueScore, sm.status]);
      });
      const notesVal = $('notesField') ? $('notesField').value : '';
      const notes = notesVal.replace(/"/g,'""');
      rows.push([]);
      rows.push(['notes', `"${notes}"`]);
      const csv = rows.map(r=>r.join(',')).join('\n');
      const blob = new Blob([csv], {type:'text/csv'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g,'-');
      a.href = url;
      a.download = `gym-wro_${state.exercise.replace(/\s+/g,'-').toLowerCase()}_${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  const btnNewSet = $('btnNewSet');
  if (btnNewSet) {
    btnNewSet.addEventListener('click', ()=>{
      if ($('btnToLive')) $('btnToLive').disabled = true;
      if ($('calReadout')) $('calReadout').textContent = 'Press start, then perform 3 easy reps at normal effort.';
      document.querySelectorAll('.cal-dot').forEach(d=>d.classList.remove('filled'));
      $('prBanner') && $('prBanner').classList.remove('show');
      goToStep(1);
    });
  }

  injectHistoryFeature();
  seedImaginaryHistory();
  goToStep(0);
})();