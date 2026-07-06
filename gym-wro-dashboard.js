(function(){
  const modal = document.getElementById('placeholderModal');
  const modalMessage = document.getElementById('modalMessage');
  const modalCloseButton = document.getElementById('modalClose');

  function showPlaceholderNotice(message){
    modalMessage.textContent = message;
    modal.hidden = false;
    modal.style.display = 'flex';
  }

  function closePlaceholderNotice(){
    modal.hidden = true;
    modal.style.display = 'none';
  }

  modalCloseButton.addEventListener('click', (event)=>{
    event.stopPropagation();
    closePlaceholderNotice();
  });
  modal.addEventListener('click', (event)=>{
    if(event.target === modal) closePlaceholderNotice();
  });

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
      samples: [],      // full session log
      chartWindow: 40,  // points shown on charts
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
    $('connLog').textContent = msg;
  }
  function setTopStatus(text, mode){
    $('topStatus').textContent = text;
    const mark = $('brandMark');
    mark.className = 'brand-mark' + (mode ? ' ' + mode : '');
  }

  // ---------------- Step navigation ----------------
  function goToStep(n){
    state.step = n;
    document.querySelectorAll('.screen').forEach((el,i)=>{
      const isActive = i === n;
      el.style.display = isActive ? 'block' : 'none';
      el.classList.toggle('active', isActive);
    });
    document.querySelectorAll('.step').forEach((el)=>{
      const idx = parseInt(el.dataset.step,10);
      el.classList.toggle('active', idx===n);
      el.classList.toggle('done', idx<n);
    });
  }

  // ---------------- Screen 1: Connection ----------------
  $('btnDemo').addEventListener('click', ()=>{
    state.connMode = 'demo';
    setTopStatus('DEMO MODE STREAMING', 'demo');
    log('Demo Mode active — simulated ESP32 stream running at ~20Hz.');
    showPlaceholderNotice('Demo mode is ready for visual testing. The real sensor path will plug in here later.');
    goToStep(1);
  });

  $('btnSerial').addEventListener('click', async ()=>{
    if(!('serial' in navigator)){
      log('Web Serial isn\'t available in this browser. Try Chrome/Edge on desktop, or use Demo Mode.');
      showPlaceholderNotice('Your browser does not expose Web Serial right now, so the UI falls back to a polished preview experience.');
      return;
    }
    try{
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      state.serialPort = port;
      state.connMode = 'serial';
      setTopStatus('USB CONNECTED', 'live');
      log('Serial port connected at 115200 baud. Waiting for JSON stream…');
      showPlaceholderNotice('USB connection is staged for the real board. The interface is already prepared for the incoming stream.');
      goToStep(1);
    }catch(err){
      log('Connection cancelled or failed: ' + err.message);
    }
  });

  // ---------------- Screen 2: Calibration ----------------
  $('exerciseSelect').addEventListener('change', (e)=>{ state.exercise = e.target.value; });

  $('btnStartCal').addEventListener('click', ()=>{
    state.calibrating = true;
    state.calRepsSeen = 0;
    $('calReadout').innerHTML = 'Recording baseline… perform <b>3</b> easy reps now.';
    document.querySelectorAll('.cal-dot').forEach(d=>d.classList.remove('filled'));
    showPlaceholderNotice('Calibration is currently simulated so the workflow feels complete before live sensor data arrives.');
    runCalibrationSim();
  });

  function runCalibrationSim(){
    // Simulated baseline capture (works identically whether serial or demo,
    // since real calibration would read live samples the same way).
    let count = 0;
    const dots = document.querySelectorAll('.cal-dot');
    const iv = setInterval(()=>{
      count++;
      dots[count-1] && dots[count-1].classList.add('filled');
      state.calRepsSeen = count;
      $('calReadout').innerHTML = `Rep ${count} of 3 captured — baseline EMG ~<b>${(480+Math.random()*60|0)}</b>, ROM ~<b>${(85+Math.random()*10|0)}°</b>`;
      if(count>=3){
        clearInterval(iv);
        state.baseline.emg = 480+Math.random()*60|0;
        state.baseline.rom = 85+Math.random()*10|0;
        $('calReadout').innerHTML = `Baseline set — EMG <b>${state.baseline.emg}</b>, ROM <b>${state.baseline.rom}°</b>. Ready to begin the set.`;
        $('btnToLive').disabled = false;
      }
    }, 700);
  }

  $('btnBack1').addEventListener('click', ()=> goToStep(0));
  $('btnToLive').addEventListener('click', ()=>{
    $('liveExerciseName').textContent = state.exercise;
    showPlaceholderNotice('The live set view is now ready for the first real sample feed.');
    goToStep(2);
    startLiveSet();
  });

  // ---------------- Gauge (signature element) ----------------
  function drawGauge(pct, colorStops){
    // pct: 0..1 effort level. Draws a segmented arc gauge, green->yellow->orange->red.
    const svg = $('gaugeSvg');
    const cx=110, cy=120, r=95;
    const segColors = ['#4ade80','#fbbf24','#fb923c','#f4515f'];
    let paths = '';
    const segCount = segColors.length;
    const gap = 0.035; // radians gap between segments
    const startAngle = Math.PI; // 180deg
    const endAngle = 0;
    const totalSpan = Math.PI;
    for(let i=0;i<segCount;i++){
      const segStart = startAngle - (totalSpan/segCount)*i;
      const segEnd = startAngle - (totalSpan/segCount)*(i+1) + gap;
      const active = pct >= (i/segCount);
      const x1 = cx + r*Math.cos(segStart), y1 = cy - r*Math.sin(segStart);
      const x2 = cx + r*Math.cos(segEnd), y2 = cy - r*Math.sin(segEnd);
      paths += `<path d="M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}" stroke="${active?segColors[i]:'#2b323c'}" stroke-width="14" fill="none" stroke-linecap="round" opacity="${active?1:0.5}"/>`;
    }
    // needle
    const needleAngle = startAngle - totalSpan*pct;
    const nx = cx + (r-20)*Math.cos(needleAngle), ny = cy - (r-20)*Math.sin(needleAngle);
    const needle = `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#eceef0" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="#eceef0"/>`;
    svg.innerHTML = paths + needle;
  }
  drawGauge(0);

  // ---------------- Charts ----------------
  Chart.defaults.color = '#8b94a0';
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.font.size = 10;

  function makeLineChart(ctx, color){
    return new Chart(ctx, {
      type:'line',
      data:{ labels:[], datasets:[{ data:[], borderColor:color, backgroundColor:color+'22', tension:0.35, pointRadius:0, borderWidth:2, fill:true }]},
      options:{
        animation:false, responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false} },
        scales:{
          x:{ display:false },
          y:{ grid:{ color:'#2b323c' }, ticks:{ maxTicksLimit:4 } }
        }
      }
    });
  }
  const emgChart = makeLineChart($('emgChart'), '#35c8e8');
  const motionChart = makeLineChart($('motionChart'), '#fbbf24');
  const qualityChart = makeLineChart($('qualityChart'), '#4ade80');

  function pushChart(chart, val, windowSize){
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(val);
    if(chart.data.labels.length > windowSize){
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update('none');
  }

  // ---------------- Live set logic ----------------
  function statusForFatigue(score){
    if(score < 35) return { text:'Good reps', pct: score/100, level:'good' };
    if(score < 60) return { text:'Fatigue building', pct: score/100, level:'warn' };
    if(score < 80) return { text:'Near failure', pct: score/100, level:'mid' };
    return { text:'Rep quality breaking down', pct: score/100, level:'danger' };
  }

  function handleSample(sample){
    state.live.samples.push(sample);

    $('mReps').textContent = sample.repCount;
    $('mSpeed').textContent = sample.repSpeed.toFixed(1)+'s';
    $('mRom').textContent = Math.round(sample.rom)+'°';

    const st = statusForFatigue(sample.fatigueScore);
    $('statusPill').textContent = sample.status || st.text;
    drawGauge(Math.min(1, sample.fatigueScore/100));

    const banner = $('nearFailureBanner');
    banner.classList.toggle('show', sample.fatigueScore >= 65);

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
    [emgChart, motionChart, qualityChart].forEach(c=>{ c.data.labels=[]; c.data.datasets[0].data=[]; c.update('none'); });

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

  // ---- Demo simulation stream (matches the ESP32 JSON schema) ----
  function startDemoStream(){
    const d = state.live.demoState;
    d.t = 0; d.rep = 0; d.phase = 0;
    state.live.demoTimer = setInterval(()=>{
      d.t += 0.15;
      d.phase += 0.35;
      const repProgress = (Math.sin(d.phase)+1)/2;
      if(repProgress > 0.97 && !d._peaked){ d._peaked = true; d.rep += (Math.random()>0.5?0:0); }
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
    const inputDone = state.serialPort.readable.pipeTo(decoder.writable);
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
          }catch(e){ /* ignore malformed line */ }
        }
      }
    }catch(err){
      log('Serial read ended: ' + err.message);
    }
  }

  $('btnEndSet').addEventListener('click', ()=>{
    showPlaceholderNotice('The session summary is being prepared as a polished placeholder for later real-world data.');
    finishSet();
  });

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
    $('summaryGrid').innerHTML = cards.map(c=>`<div class="summary-card"><div class="v">${c.v}</div><div class="l">${c.l}</div></div>`).join('');

    // find where fatigue crossed 60 for narrative
    let fatigueRepMark = null;
    for(const sm of s.samples){ if(sm.fatigueScore>=60 && fatigueRepMark===null){ fatigueRepMark = sm.repCount; } }
    const speedDropRange = totalReps>=3 ? `${Math.max(1,totalReps-2)}–${totalReps}` : '—';

    $('summaryNote').innerHTML =
      `${totalReps} reps completed<br>` +
      (fatigueRepMark ? `Fatigue increased after rep ${fatigueRepMark}<br>` : 'Fatigue stayed low throughout<br>') +
      `Rep speed drifted upward on reps ${speedDropRange}<br>` +
      `Range of motion ${romDrop>3?'decreased near the end':'stayed consistent'}<br>` +
      `Final status: <span class="final">${finalStatus}</span>`;
  }

  $('btnExportCsv').addEventListener('click', ()=>{
    showPlaceholderNotice('CSV export is ready for the future dataset, with the current mock session formatted for later review.');
    const s = state.live;
    const rows = [['time','exercise','repCount','emg','accelX','accelY','gyroZ','rom','repSpeed','fatigueScore','status']];
    s.samples.forEach(sm=>{
      rows.push([sm.time, state.exercise, sm.repCount, sm.emg, sm.accelX, sm.accelY, sm.gyroZ, sm.rom, sm.repSpeed, sm.fatigueScore, sm.status]);
    });
    const notes = $('notesField').value.replace(/"/g,'""');
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

  $('btnNewSet').addEventListener('click', ()=>{
    showPlaceholderNotice('A fresh set can be started at any time. The next pass will use the actual live stream once it is connected.');
    $('btnToLive').disabled = true;
    $('calReadout').textContent = 'Press start, then perform 3 easy reps at normal effort.';
    document.querySelectorAll('.cal-dot').forEach(d=>d.classList.remove('filled'));
    goToStep(1);
  });

  goToStep(0);
})();
