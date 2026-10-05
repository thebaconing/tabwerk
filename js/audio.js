// Wiedergabe: Karplus-Strong-Gitarrenklang, Metronom, Bendings, Bindungen.
'use strict';
const Player = (() => {
  let ac = null, master = null, timer = null, runId = 0;
  let queue = null, qi = 0, nextT = 0, curAt = 0, endAt = null, shown = [];
  let opts = {}, onNote = () => {}, onStop = () => {};
  const bufCache = new Map();
  function ks(m) {
    if (bufCache.has(m)) return bufCache.get(m);
    const sr = ac.sampleRate, f = 440 * Math.pow(2, (m - 69) / 12), N = Math.round(sr / f), len = Math.floor(sr * 1.6);
    const b = ac.createBuffer(1, len, sr), y = b.getChannelData(0);
    for (let i = 0; i < N; i++) y[i] = Math.random() * 2 - 1;
    for (let i = 1; i < N; i++) y[i] = 0.5 * (y[i] + y[i - 1]);
    const damp = 0.4985 + Math.min(0.0012, m / 100000);
    for (let i = N; i < len; i++) y[i] = damp * (y[i - N] + y[Math.max(0, i - N - 1)]);
    bufCache.set(m, b); return b;
  }
  function pluck(ev, t, dur) {
    const tones = [ev].concat(ev.extra || []);
    tones.forEach((tn, i) => pluckOne(ev, tn.m, t + i * 0.012, dur - i * 0.012, tones.length > 1 ? 0.55 / Math.sqrt(tones.length) * 1.3 : null));
  }
  function pluckOne(ev, m, t, dur, volIn) {
    const src = ac.createBufferSource(); src.buffer = ks(m);
    const g = ac.createGain();
    const vol = volIn != null ? volIn : ev.linkIn ? 0.28 : 0.55; // gebundene Töne leiser, ohne neuen Anschlag
    g.gain.setValueAtTime(vol, t);
    const tech = volIn != null ? {} : (ev.tech || {});
    let hold = dur;
    if (tech.bend) {
      const c = tech.bend * 100;
      src.detune.setValueAtTime(0, t);
      src.detune.linearRampToValueAtTime(c, t + dur * 0.35);
      if (tech.release) { src.detune.setValueAtTime(c, t + dur * 0.6); src.detune.linearRampToValueAtTime(0, t + dur * 0.95); }
    }
    if (volIn == null && ev.link === 'S' && ev.next) {
      const c = (ev.next.m - ev.m) * 100;
      src.detune.setValueAtTime(0, t + dur * 0.55);
      src.detune.linearRampToValueAtTime(c, t + dur);
      hold = dur * 1.02;
    }
    g.gain.setTargetAtTime(0, t + Math.max(0.06, hold * 0.97), 0.025);
    src.connect(g).connect(master); src.start(t); src.stop(t + hold + 0.3);
  }
  function click(t, strong) {
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = strong ? 1600 : 1100;
    g.gain.setValueAtTime(strong ? 0.2 : 0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.05);
  }
  // comp-Blöcke → Ereignisliste in Divisions
  function buildQueue(comp, onlyBlock, countIn, range) {
    const q = [];
    const meter = comp.length ? comp[0].meter : meterOf('4/4');
    let pos = 0;
    if (countIn) { for (let b = 0; b < meter.clicks; b++) q.push({ at: b * meter.beat, click: true, strong: b === 0, count: true }); pos = meter.len; }
    comp.forEach(B => {
      if (onlyBlock != null && B.bi !== onlyBlock) return;
      const evs = B.measures.flatMap(m => m.events);
      evs.forEach((e, i) => { if (e.link === 'S') e.next = evs[i + 1]; });
      B.measures.forEach(M => {
        if (range && (M.no < range.from || M.no > range.to)) return;
        for (let b = 0; b < meter.clicks; b++) q.push({ at: pos + b * meter.beat, click: true, strong: b === 0 });
        let p = pos;
        M.events.forEach(e => { if (e.kind === 'note') q.push({ at: p, ev: e, dur: e.dur }); p += e.dur; });
        pos += meter.len;
      });
    });
    q.sort((a, b) => a.at - b.at || (a.click ? -1 : 1));
    return { q, total: pos, meter };
  }
  function schedule() {
    const spd = 60 / opts.bpm() / queue.meter.beat;
    if (endAt == null && nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.25) {
      if (qi >= queue.q.length) {
        if (opts.loop()) { const firstI = queue.q.findIndex(e => !e.count); const gap = queue.total - curAt; qi = firstI; curAt = queue.q[firstI].at - gap; continue; }
        if (endAt == null) endAt = nextT + 0.7;
        if (ac.currentTime >= endAt) stop();
        return;
      }
      const ev = queue.q[qi];
      nextT += (ev.at - curAt) * spd; curAt = ev.at;
      if (ev.click) { if (opts.metronome() || ev.count) click(nextT, ev.strong); }
      else { pluck(ev.ev, nextT, ev.dur * spd); shown.push({ t: nextT, k: ev.ev.k }); }
      qi++;
    }
  }
  function frame() {
    if (!timer) return;
    let cur = null;
    while (shown.length && shown[0].t <= ac.currentTime) cur = shown.shift();
    if (cur) onNote(cur.k);
    requestAnimationFrame(frame);
  }
  async function start(comp, onlyBlock, o) {
    opts = o; onNote = o.onNote || onNote; onStop = o.onStop || onStop;
    stop(true);
    const my = ++runId;
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) throw new Error('Dieser Browser kann keinen Ton abspielen.'); ac = new C(); }
    try { if (ac.state !== 'running') await ac.resume(); } catch (e) {}
    if (my !== runId) return false;
    if (ac.state !== 'running') throw new Error('Der Browser hat die Tonausgabe blockiert. Bitte nochmal auf Abspielen tippen.');
    queue = buildQueue(comp, onlyBlock, o.countIn ? o.countIn() : true, o.range || null);
    if (queue.q.filter(e => !e.click).length === 0) throw new Error('Hier gibt es noch keine Töne zum Abspielen.');
    queue.q.forEach(e => { if (e.ev) [e.ev].concat(e.ev.extra || []).forEach(t => ks(t.m)); });
    master = ac.createGain(); master.connect(ac.destination);
    qi = 0; curAt = 0; endAt = null; shown = []; nextT = ac.currentTime + 0.12;
    timer = setInterval(schedule, 25); schedule(); requestAnimationFrame(frame);
    return true;
  }
  function stop(silent) {
    runId++;
    const was = !!timer;
    if (timer) clearInterval(timer); timer = null; endAt = null; shown = [];
    if (master) { try { master.disconnect(); } catch (e) {} master = null; }
    if (was && !silent) onStop();
  }
  // Einzelnen Ton anspielen (beim Eingeben)
  async function preview(m) {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; ac = new C(); }
    try { if (ac.state !== 'running') await ac.resume(); } catch (e) { return; }
    const g = ac.createGain(); g.connect(ac.destination);
    const src = ac.createBufferSource(); src.buffer = ks(m);
    g.gain.setValueAtTime(0.45, ac.currentTime); g.gain.setTargetAtTime(0, ac.currentTime + 0.5, 0.08);
    src.connect(g); src.start(); src.stop(ac.currentTime + 1);
  }
  return { start, stop, preview, isPlaying: () => !!timer };
})();
