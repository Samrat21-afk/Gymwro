(function(){
  // ---------------- State ----------------
  const state = {
    step: 0,
    connMode: null, // 'serial' | 'demo'
    serialPort: null,
    reader: null,
    exercise: 'Biceps Curl',
    calibrating: false,
    calRepsSeen: 0,
    baseline: { emg: 500, rom: 90 },
    live: {
      running: false,
      samples: [],
      chartWindow: 40,
      lastRepCount: 0,
      qualityScores: [],
      goodReps: 0,
      droppingReps: 0,
      startTime: null,
      demoTimer: null,
      demoState: { t: 0, rep: 0, phase: 0 }
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
    const segColors = ['#16a34a','#d97706','#ea580c','#dc2626'];
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
      paths += `<path d="M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}" stroke="${active?segColors[i]:'#e2dad0'}" stroke-width="14" fill="none" stroke-linecap="round" opacity="${active?1:0.5}"/>`;
    }
    const needleAngle = startAngle - totalSpan*pct;
    const nx = cx + (r-20)*Math.cos(needleAngle), ny = cy - (r-20)*Math.sin(needleAngle);
    const needle = `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#2c2825" stroke-width="3.5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5.5" fill="#2c2825"/>`;
    svg.innerHTML = paths + needle;
  }
  drawGauge(0);

  // ---------------- Charts ----------------
  Chart.defaults.color = '#6b635b';
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
          y:{ grid:{ color:'#e2dad0' }, ticks:{ maxTicksLimit:4 } }
        }
      }
    });
  }
  const emgChart = makeLineChart($('emgChart'), '#0284c7');
  const motionChart = makeLineChart($('motionChart'), '#d97706');
  const qualityChart = makeLineChart($('qualityChart'), '#16a34a');

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
    if (banner) banner.classList.toggle('show', sample.fatigueScore >= 65);

    pushChart(emgChart, sample.emg, state.live.chartWindow);
    pushChart(motionChart, sample.repSpeed, state.live.chartWindow);

    if(sample.repCount > state.live.lastRepCount){
      state.live.lastRepCount = sample.repCount;
      const repQuality = Math.max(0, 100 - sample.fatigueScore - (Math.random()*8));
      state.live.qualityScores.push(repQuality);
      pushChart(qualityChart, repQuality, 20);
      if(repQuality >= 60) state.live.goodReps++; else state.live.droppingReps++;
    }
  }

  function startLiveSet(){
    state.live.running = true;
    state.live.startTime = Date.now();
    state.live.samples = [];
    state.live.qualityScores = [];
    state.live.goodReps = 0;
    state.live.droppingReps = 0;
    state.live.lastRepCount = 0;
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

    const cards = [
      { v: totalReps, l: 'Total reps' },
      { v: avgSpeed.toFixed(2)+'s', l: 'Avg rep speed' },
      { v: (lastSample.repSpeed||0).toFixed(2)+'s', l: 'Last rep speed' },
      { v: (lastSample.fatigueScore||0)+'%', l: 'Est. fatigue' },
      { v: romDrop>3 ? 'Decreased' : 'Stable', l: 'ROM consistency' },
      { v: s.goodReps, l: 'Good reps' },
      { v: s.droppingReps, l: 'Quality-drop reps' },
    ];
    if ($('summaryGrid')) {
      $('summaryGrid').innerHTML = cards.map(c=>`<div class="summary-card"><div class="v">${c.v}</div><div class="l">${c.l}</div></div>`).join('');
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
      goToStep(1);
    });
  }

  goToStep(0);
})();
