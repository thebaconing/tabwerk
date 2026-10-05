// Zeichnen: Griffbrett und Tabulatur-Takte als SVG-Strings.
'use strict';

const MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21];

// Griffbrett von Bund lo bis hi. dots: [{s,f,cls,label,blue,end}], hit: klickbare Flächen
function renderFretboard({ lo, hi, dots = [], hit = false, fw = 36 }) {
  const showOpen = lo === 0, lo1 = Math.max(1, lo);
  const nF = hi - lo1 + 1, ss = 19, oy = 12, ox = showOpen ? 50 : 30;
  const W = ox + nF * fw + 10, H = oy + 5 * ss + 30;
  const xOf = f => f === 0 ? ox - 18 : ox + (f - lo1 + 0.5) * fw;
  const yOf = s => oy + (5 - s) * ss;
  let s = '';
  // Einlagen
  for (let f = lo1; f <= hi; f++) if (MARKERS.includes(f)) {
    const x = xOf(f);
    if (f % 12 === 0) s += `<circle class="inlay" cx="${x}" cy="${oy + 1.5 * ss}" r="3.5"/><circle class="inlay" cx="${x}" cy="${oy + 3.5 * ss}" r="3.5"/>`;
    else s += `<circle class="inlay" cx="${x}" cy="${oy + 2.5 * ss}" r="3.5"/>`;
  }
  for (let i = 0; i < 6; i++) {
    const y = yOf(i);
    s += `<line class="str" x1="${ox}" y1="${y}" x2="${ox + nF * fw}" y2="${y}" stroke-width="${0.8 + (5 - i) * 0.28}"/>`;
    s += `<text class="num" x="${showOpen ? 12 : ox - 16}" y="${y + 3.8}" text-anchor="middle">${STR_NAMES[i]}</text>`;
  }
  for (let c = 0; c <= nF; c++) {
    const x = ox + c * fw, nut = c === 0 && lo1 === 1;
    s += `<line class="${nut ? 'nut' : 'fret'}" x1="${x}" y1="${oy}" x2="${x}" y2="${oy + 5 * ss}" stroke-width="${nut ? 4 : 1}"/>`;
  }
  for (let f = lo1; f <= hi; f++) s += `<text class="num${MARKERS.includes(f) ? ' mk' : ''}" x="${xOf(f)}" y="${oy + 5 * ss + 20}" text-anchor="middle">${f}</text>`;
  if (hit) {
    for (let st = 0; st < 6; st++) {
      if (showOpen) s += `<rect class="fb-hit" data-s="${st}" data-f="0" x="${ox - 30}" y="${yOf(st) - ss / 2}" width="26" height="${ss}" rx="4"><title>${STR_NAMES[st]}-Saite leer</title></rect>`;
      for (let f = lo1; f <= hi; f++) s += `<rect class="fb-hit" data-s="${st}" data-f="${f}" x="${ox + (f - lo1) * fw + 1}" y="${yOf(st) - ss / 2}" width="${fw - 2}" height="${ss}" rx="4"><title>${STR_NAMES[st]}-Saite, Bund ${f}</title></rect>`;
    }
  }
  for (const d of dots) {
    if (d.f < lo && d.f !== 0) continue;
    if (d.f > hi) continue;
    if (d.f === 0 && !showOpen) continue;
    const x = xOf(d.f), y = yOf(d.s);
    s += `<g pointer-events="none"><circle class="dot ${d.cls}${d.blue ? ' blue' : ''}${d.end ? ' end' : ''}" cx="${x}" cy="${y}" r="8.6"/>` +
      (d.label ? `<text class="dt ${d.cls}" x="${x}" y="${y + 3.4}" text-anchor="middle">${d.label}</text>` : '') + '</g>';
  }
  return `<svg class="fb" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Griffbrett Bund ${lo} bis ${hi}">${s}</svg>`;
}

// ---------- Tabulatur ----------
const PPD = { 1: 9, 2: 7.6, 3: 6.8, 4: 6.4, 6: 5.2, 8: 4.4, 12: 3.8, 24: 2.7, 48: 1.9 }; // Pixel pro Division je kürzestem Notenwert
const LY = 34, LS = 12;
const FLAGS = { eighth: 1, '16th': 2, '32nd': 3 };

function measureSvg(M, meter, opt) {
  const minDur = Math.min(...M.events.map(e => e.dur));
  const ppd = PPD[minDur] || 5, pad = 12, len = meter.len;
  const W = Math.round(pad * 2 + len * ppd + 4), H = 140;
  const xAt = q => pad + 7 + q * ppd;
  const yS = s => LY + (5 - s) * LS;
  const sel = opt.sel || new Set();
  let s = '';
  for (let i = 0; i < 6; i++) s += `<line class="ln" x1="0" x2="${W}" y1="${LY + i * LS}" y2="${LY + i * LS}"/>`;
  s += `<line class="${opt.lastOfDoc ? 'bl2' : 'bl'}" x1="${W - (opt.lastOfDoc ? 1.5 : 0.6)}" x2="${W - (opt.lastOfDoc ? 1.5 : 0.6)}" y1="${LY}" y2="${LY + 5 * LS}"/>`;
  if (opt.firstOfBlock) s += `<line class="bl" x1="0.6" x2="0.6" y1="${LY}" y2="${LY + 5 * LS}"/>`;
  s += `<text class="mn" x="3" y="${LY - 4}">${M.no}</text>`;
  if (opt.showTime) s += `<text class="tsig" x="${pad + 2}" y="${LY + 2.2 * LS}" text-anchor="middle">${meter.beats}</text><text class="tsig" x="${pad + 2}" y="${LY + 4.4 * LS}" text-anchor="middle">${meter.type}</text>`;
  if (M.first && M.seg.label) s += `<text class="sl" x="${pad + 14}" y="12">${escHtml(M.seg.label)}</text>`;
  const xs = [];
  const yStem = LY + 5 * LS + 9, yBeam = yStem + 18;
  let q = opt.showTime ? 0 : 0;
  const xOff = opt.showTime ? 14 : 0;
  M.events.forEach(e => {
    const x = xAt(q) + xOff; xs.push(x);
    if (e.kind === 'note') {
      const tones = [e].concat(e.extra || []);
      const cls = 'n' + (sel.has(e.k) ? ' sel' : '');
      const ys0 = tones.map(t => yS(t.s));
      s += `<g class="${cls}" data-k="${e.k}">` + (tones.length > 1 ? `<rect fill="transparent" x="${x - 9}" y="${Math.min(...ys0) - 7}" width="18" height="${Math.max(...ys0) - Math.min(...ys0) + 14}"/>` : '') + tones.map(t => { const y = yS(t.s), txt = String(t.f), w = txt.length * 7.6 + 4; const kc = opt.keyPcs && !opt.keyPcs.has(mod12(t.m)) ? (opt.bluePcs && opt.bluePcs.has(mod12(t.m)) ? ' class="bluenote"' : ' class="out"') : ''; return `<rect class="bg" x="${x - w / 2}" y="${y - 7}" width="${w}" height="14" rx="3"/><text x="${x}" y="${y + 4.2}" text-anchor="middle"${kc}>${txt}</text>` + (kc ? `<line class="${kc.includes('out') ? 'outl' : 'bluel'}" x1="${x - w / 2 + 1}" x2="${x + w / 2 - 1}" y1="${y + 6.5}" y2="${y + 6.5}"/>` : ''); }).join('') + '</g>';
      if (tones.length > 1) { const ys = tones.map(t => yS(t.s)); s += `<line class="arp" x1="${x - 11}" x2="${x - 11}" y1="${Math.min(...ys) - 5}" y2="${Math.max(...ys) + 5}"/>`; }
      if (e.type === 'whole') s += `<ellipse class="rh" cx="${x}" cy="${yStem + 9}" rx="4.2" ry="3"/>`;
      else if (e.type === 'half') s += `<line class="rh" x1="${x}" x2="${x}" y1="${yStem + 5}" y2="${yBeam}"/><ellipse class="rh" cx="${x}" cy="${yStem + 2}" rx="4" ry="2.8"/>`;
      else s += `<line class="rh" x1="${x}" x2="${x}" y1="${yStem}" y2="${yBeam}"/>`;
      if (e.tech && e.tech.bend) {
        const y = yS(e.s), top = LY - 12, lbl = e.tech.bend === 1 ? '½' : 'voll';
        s += `<path class="bend" d="M${x + 6} ${y - 1} Q${x + 13} ${y - 1} ${x + 13} ${top + 3}"/><path class="bend" d="M${x + 10} ${top + 7} L${x + 13} ${top + 2} L${x + 16} ${top + 7}"/>`;
        s += `<text class="bendt" x="${x + 13}" y="${top - 2}" text-anchor="middle">${lbl}</text>`;
        if (e.tech.release) s += `<path class="bend" stroke-dasharray="3 2" d="M${x + 15} ${top + 3} Q${x + 21} ${top + 3} ${x + 22} ${y - 6}"/>`;
      }
    } else {
      if (e.fi != null) {
        const cls = 'n rest' + (sel.has(e.k) ? ' sel' : '');
        s += `<g class="${cls}" data-k="${e.k}"><rect class="bg" x="${x - 7}" y="${LY + 2.5 * LS - 7}" width="14" height="14" rx="3"/><text x="${x}" y="${LY + 2.5 * LS + 4}" text-anchor="middle">–</text></g>`;
      }
      s += restGlyph(e, x, yStem);
    }
    q += e.dur;
  });
  // Bindungen zum nächsten Ton
  M.events.forEach((e, i) => {
    if (!e.link) return;
    const j = M.events.findIndex((n, k2) => k2 > i && n.kind === 'note');
    const x1 = xs[i], x2 = j > 0 ? xs[j] : W, y1 = yS(e.s), y2 = j > 0 ? yS(M.events[j].s) : y1;
    if (e.link === 'S') {
      const up = j > 0 ? M.events[j].m > e.m : true;
      s += `<line class="arc" x1="${x1 + 7}" y1="${y1 + (up ? 4 : -4)}" x2="${x2 - 7}" y2="${y2 + (up ? -4 : 4)}"/>`;
    } else {
      const yy = Math.min(y1, y2) - 8, mx = (x1 + x2) / 2;
      s += `<path class="arc" d="M${x1 + 3} ${y1 - 8} Q${mx} ${yy - 9} ${x2 - 3} ${y2 - 8}"/><text class="tq" x="${mx}" y="${yy - 6}" text-anchor="middle">${e.link}</text>`;
    }
  });
  // Balken je Schlag
  q = 0; let beat = [];
  const flush = () => {
    const ns = beat.filter(o => o.e.kind === 'note' && FLAGS[o.e.type]);
    if (ns.length > 1) {
      for (let lv = 1; lv <= 3; lv++) {
        const yy = yBeam - 2.5 - (lv - 1) * 4.5;
        let run = [];
        const draw = () => {
          if (run.length > 1) s += `<rect class="bm" x="${run[0].x - .6}" y="${yy}" width="${run[run.length - 1].x - run[0].x + 1.2}" height="2.5"/>`;
          else if (run.length === 1 && lv > 1) { const o = run[0], idx = ns.indexOf(o), dir = idx === 0 ? 1 : -1; s += `<rect class="bm" x="${dir > 0 ? o.x - .6 : o.x - 6}" y="${yy}" width="6.6" height="2.5"/>`; }
          run = [];
        };
        ns.forEach(o => { if (FLAGS[o.e.type] >= lv) run.push(o); else draw(); });
        draw();
      }
    } else if (ns.length === 1) {
      const x = ns[0].x;
      for (let k = 0; k < FLAGS[ns[0].e.type]; k++) s += `<path class="rh" d="M${x} ${yBeam - k * 5} q6 -3 6 -9"/>`;
    }
    beat = [];
  };
  M.events.forEach((e, i) => { if (q > 0 && q % meter.beat === 0) flush(); beat.push({ e, x: xs[i] }); q += e.dur; });
  flush();
  // Triolenklammern
  let start = null;
  M.events.forEach((e, i) => {
    if (e.tupStart) start = i;
    if (e.tupStop && start != null) {
      const a = xs[start], b = xs[i], yy = yBeam + 8, m = (a + b) / 2;
      s += a === b ? `<text class="tu" x="${m}" y="${yy + 3.5}" text-anchor="middle">3</text>` : `<path class="rh" d="M${a} ${yy - 3} v3 H${m - 5} M${m + 5} ${yy} H${b} v-3"/><text class="tu" x="${m}" y="${yy + 3.5}" text-anchor="middle">3</text>`;
      start = null;
    }
  });
  return `<svg width="${W + xOff}" height="${H}" viewBox="0 0 ${W + xOff} ${H}" data-m="${M.no}">${s}</svg>`;
}
function restGlyph(e, x, yStem) {
  if (e.type === 'whole') return `<rect class="bm" x="${x - 5}" y="${yStem + 2}" width="10" height="4"/>`;
  if (e.type === 'half') return `<rect class="bm" x="${x - 5}" y="${yStem + 6}" width="10" height="4"/>`;
  if (e.type === 'quarter') return `<path class="rh" d="M${x + 2} ${yStem} l4 5 l-4 4 l4 5 c-4 -2 -6 1 -2 4"/>`;
  let s = `<path class="rh" d="M${x - 2} ${yStem + 4} q3 2 5 -2 l-4 11"/>`;
  for (let k = 1; k < (FLAGS[e.type] || 1); k++) s += `<path class="rh" d="M${x - 3 - k} ${yStem + 4 + k * 5} q3 2 5 -2"/>`;
  return s;
}
function escHtml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
