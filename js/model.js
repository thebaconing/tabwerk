// Datenmodell: Bausteine, Reihen und ihre Umwandlung in Takte mit Tönen.
'use strict';

const DIV = 12, MEASURE = 48; // 12 Divisions pro Viertel; MEASURE = Länge eines 4/4-Takts
const UNITS = {
  w: { label: 'Ganze', dur: 48, type: 'whole', tuplet: false, beams: 0 },
  h: { label: 'Halbe', dur: 24, type: 'half', tuplet: false, beams: 0 },
  q: { label: 'Viertel', dur: 12, type: 'quarter', tuplet: false, perBeat: 1, beams: 0 },
  tri4: { label: 'Vierteltriolen', dur: 8, type: 'quarter', tuplet: true, beams: 0 },
  e: { label: 'Achtel', dur: 6, type: 'eighth', tuplet: false, perBeat: 2, beams: 1 },
  tri8: { label: 'Achteltriolen', dur: 4, type: 'eighth', tuplet: true, perBeat: 3, beams: 1 },
  s16: { label: 'Sechzehntel', dur: 3, type: '16th', tuplet: false, perBeat: 4, beams: 2 },
  tri16: { label: 'Sechzehnteltriolen', dur: 2, type: '16th', tuplet: true, perBeat: 6, beams: 2 },
  x32: { label: '32stel-Triolen', dur: 1, type: '32nd', tuplet: true, beams: 3 }
};
const GEN_UNITS = ['q', 'e', 'tri8', 's16', 'tri16'];
const FREE_UNITS = ['w', 'h', 'q', 'tri4', 'e', 'tri8', 's16', 'tri16'];
const DUR_KEY = { 48: 'w', 24: 'h', 12: 'q', 8: 'tri4', 6: 'e', 4: 'tri8', 3: 's16', 2: 'tri16', 1: 'x32' };
// Taktarten: len = Taktlänge in Divisions, beat = Länge eines Schlags (Balken, Metronom)
const TIMES = ['4/4', '3/4', '2/4', '5/4', '6/8', '12/8'];
function meterOf(t) {
  const [b, ty] = (TIMES.includes(t) ? t : '4/4').split('/').map(Number);
  const compound = ty === 8 && b % 3 === 0;
  return { label: `${b}/${ty}`, beats: b, type: ty, len: b * 48 / ty, beat: compound ? 18 : 48 / ty, compound, clicks: compound ? b / 3 : b };
}
// Töne eines Ereignisses (Einzelton oder Akkord) als [{s,f}]
function notePos(n) { return n.pos ? n.pos : (n.s != null ? [{ s: n.s, f: n.f }] : []); }
// Griff für einen Akkord in Lage f: je Saite der tiefste Akkordton im Fenster, Bass = tiefster Grundton
function chordVoicing(root, q, f) {
  const set = buildChord(root, q);
  const cands = []; if (f === 0) cands.push(0);
  for (let fr = Math.max(1, f); fr <= f + 3; fr++) cands.push(fr);
  // Bass: tiefste Saite, auf der der Grundton im Fenster liegt
  let bass = -1, bassF = null;
  for (let s = 0; s < 6 && bass < 0; s++) { const fr = cands.find(x => degreeOf(set, OPEN[s] + x) === 0); if (fr != null) { bass = s; bassF = fr; } }
  if (bass < 0) return [];
  const out = [{ s: bass, f: bassF }];
  for (let s = bass + 1; s < 6; s++) { const fr = cands.find(x => degreeOf(set, OPEN[s] + x) >= 0); if (fr != null) out.push({ s, f: fr }); }
  return out;
}

// Übungsmuster aus der Skalen-App (Indizes in die Töne der Lage)
const SECTIONS = [
  { id: 'threes', title: 'Dreiergruppen', pat: [0, 1, 2], unit: 'tri8' },
  { id: 'fours', title: 'Vierergruppen', pat: [0, 1, 2, 3], unit: 's16' },
  { id: 'thirds', title: 'Terzen / Sprünge', pat: [0, 2], unit: 's16' },
  { id: 'triads', title: '1-3-5', pat: [0, 2, 4], unit: 'tri16' },
  { id: 'sevenths', title: '1-3-5-7', pat: [0, 2, 4, 6], unit: 's16' }
];
function sectionTitle(id, type) {
  const s = SECTIONS.find(x => x.id === id);
  if (id === 'thirds') return type === 'scale' ? 'Terzen' : 'Sprünge';
  if ((id === 'triads' || id === 'sevenths') && type !== 'scale') return s.title + ' der Leiter';
  return s.title;
}
function sequenceIdx(pat, lo, hi) {
  const span = pat[pat.length - 1], seq = [];
  for (let i = lo; i + span <= hi; i++) pat.forEach(p => seq.push(i + p));
  for (let i = hi; i - span >= lo; i--) pat.forEach(p => seq.push(i - p));
  if (seq[seq.length - 1] !== lo) seq.push(lo);
  return seq;
}

const KINDS = {
  exercise: 'Übung',
  scale: 'Skala',
  chord: 'Akkord-Arpeggio',
  prog: 'Akkordfolge',
  free: 'Freie Tonfolge'
};
const PROG_PRESETS = [
  { id: 'I-IV-V', label: 'I – IV – V', chords: [0, 3, 4].map(d => ({ deg: d, q: 'auto' })) },
  { id: 'ii-V-I', label: 'ii – V – I', chords: [1, 4, 0].map(d => ({ deg: d, q: 'auto' })) },
  { id: 'I-V-vi-IV', label: 'I – V – vi – IV', chords: [0, 4, 5, 3].map(d => ({ deg: d, q: 'auto' })) },
  { id: 'I-vi-IV-V', label: 'I – vi – IV – V', chords: [0, 5, 3, 4].map(d => ({ deg: d, q: 'auto' })) },
  { id: 'i-iv-v', label: 'i – iv – v (Moll)', chords: [0, 3, 4].map(d => ({ deg: d, q: 'auto' })) },
  { id: 'blues12', label: '12-Takt-Blues (Dominantsept)', chords: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4].map(d => ({ deg: d, q: '7' })) }
];

let _uid = 0;
function uid() { return 'b' + Date.now().toString(36) + (_uid++).toString(36) + Math.random().toString(36).slice(2, 5); }

function newBlock(kind, from) {
  const base = { id: uid(), kind, series: { kind: 'none', items: [] } };
  const k = from || {};
  const key = { type: k.type || 'scale', mode: k.mode || 'minor', root: k.root || 'E' };
  switch (kind) {
    case 'exercise': return Object.assign(base, key, { system: 'pos', fret: null, section: 'threes', range: 'root', unit: null });
    case 'scale': return Object.assign(base, key, { system: 'pos', fret: null, from: null, to: null, dir: 'updown', unit: 's16' });
    case 'chord': return Object.assign(base, { root: 'A', quality: 'm7', fret: 5, range: 'oct1', pattern: 'updown', length: 'once', unit: 's16' });
    case 'prog': return Object.assign(base, { root: key.root, mode: key.mode === 'minor' ? 'minor' : 'major', chords: PROG_PRESETS[0].chords.map(c => Object.assign({}, c)), seventh: false, fret: 0, range: 'oct1', pattern: 'updown', length: 1, unit: 's16' });
    case 'free': return Object.assign(base, { ref: key, notes: [], unit: 'e' });
  }
  throw new Error('Unbekannter Baustein ' + kind);
}
function newDoc(name) {
  return { id: uid(), name: name || 'Neue Übungsfolge', bpm: 80, time: '4/4', blocks: [], updated: Date.now() };
}

// ---------- Lagen und Tonvorrat ----------
function blockSet(b) {
  if (b.kind === 'exercise' || b.kind === 'scale') return buildScale(b.root, b.mode, b.type);
  if (b.kind === 'chord') return buildChord(b.root, b.quality);
  if (b.kind === 'free' && b.ref) return buildScale(b.ref.root, b.ref.mode, b.ref.type);
  return null;
}
function blockShape(b) {
  const set = blockSet(b);
  if (b.kind === 'chord') {
    const notes = shapePosition(set, b.fret);
    return { set, shape: { f: b.fret, notes, rootIdx: notes.findIndex(n => degreeOf(set, n.m) === 0) } };
  }
  const shapes = listShapes(set, b.system);
  const shape = b.fret == null ? bestShape(shapes) : (shapes.find(s => s.f === b.fret) || nearestShape(shapes, b.fret));
  return { set, shapes, shape };
}

// Arpeggio-Indizes innerhalb einer Akkordlage
function arpeggioIdx(set, notes, range, pattern, lengthBars, unit, barLen = MEASURE) {
  const n = set.length;
  let lo, hi;
  const firstRoot = notes.findIndex(x => degreeOf(set, x.m) === 0);
  if (range === 'all' || firstRoot < 0) { lo = 0; hi = notes.length - 1; }
  else { lo = firstRoot; hi = Math.min(notes.length - 1, firstRoot + (range === 'oct2' ? 2 * n : n)); }
  const L = []; for (let i = lo; i <= hi; i++) L.push(i);
  if (!L.length) return [];
  const R = L.slice().reverse();
  const once = pattern === 'up' ? L : pattern === 'down' ? R : L.concat(R.slice(1));
  if (lengthBars === 'once' || !lengthBars) return once;
  const cyc = pattern === 'updown' && L.length > 2 ? L.concat(R.slice(1, -1)) : once;
  const count = Math.floor(lengthBars * barLen / UNITS[unit].dur);
  const out = []; for (let i = 0; i < count; i++) out.push(cyc[i % cyc.length]);
  return out;
}

function noteEv(n, set, fifths, tech) {
  return { kind: 'note', s: n.s, f: n.f, m: n.m, sp: spellMidi(n.m, set, fifths), tech: tech || null };
}

// ---------- Erzeugung eines Bausteins ohne Reihe ----------
// Ergebnis: [{label, key, notes:[ev], fill}]  (fill = Segment füllt Takte bereits exakt)
function generateCore(b, meter = meterOf('4/4')) {
  if (b.kind === 'exercise') {
    const { set, shape } = blockShape(b);
    const sec = SECTIONS.find(s => s.id === b.section);
    const lo = b.range === 'full' ? 0 : shape.rootIdx;
    const idx = sequenceIdx(sec.pat, lo, shape.notes.length - 1);
    return [{ key: { root: b.root, mode: b.mode }, notes: idx.map(i => noteEv(shape.notes[i], set)) }];
  }
  if (b.kind === 'scale') {
    const { set, shape } = blockShape(b);
    const r = scaleRange(b, shape);
    const L = []; for (let i = r.from; i <= r.to; i++) L.push(i);
    const R = L.slice().reverse();
    const seq = b.dir === 'up' ? L : b.dir === 'down' ? R : b.dir === 'downup' ? R.concat(L.slice(1)) : L.concat(R.slice(1));
    return [{ key: { root: b.root, mode: b.mode }, notes: seq.map(i => noteEv(shape.notes[i], set)) }];
  }
  if (b.kind === 'chord') {
    const { set, shape } = blockShape(b);
    const idx = arpeggioIdx(set, shape.notes, b.range, b.pattern, b.length, b.unit, meter.len);
    const fifths = /b/.test(b.root) || b.root === 'F' ? -1 : 1;
    return [{ key: null, label: chordName(b.root, b.quality), notes: idx.map(i => noteEv(shape.notes[i], set, fifths)), fill: b.length !== 'once' }];
  }
  if (b.kind === 'prog') {
    return progChords(b).map(c => {
      const set = buildChord(c.root, c.quality);
      const notes = shapePosition(set, b.fret);
      const idx = arpeggioIdx(set, notes, b.range, b.pattern, b.length, b.unit, meter.len);
      return { key: { root: b.root, mode: b.mode }, label: `${chordName(c.root, c.quality)} (${c.roman})`, notes: idx.map(i => noteEv(notes[i], set, fifthsOf(b.root, b.mode))), fill: b.length !== 'once' };
    });
  }
  if (b.kind === 'free') {
    const set = b.ref ? buildScale(b.ref.root, b.ref.mode, b.ref.type) : null;
    const fifths = b.ref ? fifthsOf(b.ref.root, b.ref.mode) : 0;
    const notes = [];
    b.notes.forEach((n, i) => {
      const uk = UNITS[n.dur] ? n.dur : b.unit;
      if (n.rest) { notes.push({ kind: 'rest', fi: i, uk }); return; }
      const ps = notePos(n).slice().sort((a, c) => a.s - c.s);
      if (!ps.length) return;
      const evs = ps.map(p => noteEv({ s: p.s, f: p.f, m: OPEN[p.s] + p.f }, set, fifths));
      notes.push(Object.assign(evs[0], { extra: evs.slice(1), tech: ps.length > 1 ? null : (n.tech || null), fi: i, uk }));
    });
    return [{ key: b.ref ? { root: b.ref.root, mode: b.ref.mode } : null, notes }];
  }
  return [];
}
function progChords(b) {
  const sc = buildScale(b.root, b.mode, 'scale');
  return b.chords.map(c => {
    let root, quality;
    if (c.q === 'auto') ({ root, quality } = diatonicChord(b.root, b.mode, c.deg, b.seventh));
    else { root = nameOf(sc[c.deg].letter, sc[c.deg].alter); quality = c.q; }
    return { root, quality, roman: romanOf(c.deg, quality), deg: c.deg };
  });
}
function scaleRange(b, shape) {
  const last = shape.notes.length - 1;
  let from = b.from == null ? Math.max(0, shape.rootIdx) : b.from;
  let to = b.to == null ? last : b.to;
  from = Math.max(0, Math.min(last, from)); to = Math.max(0, Math.min(last, to));
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

// ---------- Reihen ----------
function semiShift(fromRoot, toRoot) { let d = mod12(pcOf(toRoot) - pcOf(fromRoot)); if (d > 6) d -= 12; return d; }
function normFret(f) { while (f < 0) f += 12; while (f > 12) f -= 12; return f; }
// Ton-Ereignis um d Halbtöne auf denselben Saiten verschieben (inkl. Akkordtöne)
function shiftEv(e, d) {
  if (e.kind !== 'note') return e;
  return Object.assign({}, e, { f: e.f + d, m: e.m + d, extra: (e.extra || []).map(x => Object.assign({}, x, { f: x.f + d, m: x.m + d })) });
}
function evFrets(e) { return e.kind === 'note' ? [e.f].concat((e.extra || []).map(x => x.f)) : []; }
function seriesOptions(b) {
  const o = ['none', 'keys', 'octaves'];
  if (b.kind !== 'free') o.splice(2, 0, 'positions');
  return o;
}
// Variante eines Bausteins für einen Reihen-Eintrag
function variantOf(b, kind, item) {
  const v = JSON.parse(JSON.stringify(b));
  v.series = { kind: 'none', items: [] };
  if (kind === 'keys') {
    if (b.kind === 'free') {
      if (!b.ref) return null;
      const d = semiShift(b.ref.root, item);
      v.ref.root = item;
      const all = b.notes.flatMap(n => n.rest ? [] : notePos(n).map(p => p.f + d));
      let adj = 0;
      if (all.length && Math.min(...all) < 0) adj = 12; else if (all.length && Math.max(...all) > MAX_FRET) adj = -12;
      if (all.length && (Math.min(...all) + adj < 0 || Math.max(...all) + adj > MAX_FRET)) return null;
      v.notes = b.notes.map(n => {
        if (n.rest) return n;
        const c = Object.assign({}, n, { pos: notePos(n).map(p => ({ s: p.s, f: p.f + d + adj })) });
        delete c.s; delete c.f;
        return c;
      });
      return v;
    }
    const baseF = b.kind === 'chord' || b.kind === 'prog' ? b.fret : blockShape(b).shape.f;
    v.root = item;
    v.fret = normFret(baseF + semiShift(b.root, item));
    if (b.kind === 'scale') remapRange(b, v);
    return v;
  }
  if (kind === 'positions') {
    v.fret = item;
    if (b.kind === 'scale') remapRange(b, v);
    return v;
  }
  return v;
}
// Teilskala in einer anderen Lage: gleiche Startstufe, gleiche Anzahl Töne
function remapRange(b, v) {
  if (b.from == null && b.to == null) return;
  const { set, shape } = blockShape(b);
  const r = scaleRange(b, shape);
  const deg = degreeOf(set, shape.notes[r.from].m);
  const ns = blockShape(v);
  let start = ns.shape.notes.findIndex(n => degreeOf(ns.set, n.m) === deg);
  if (start < 0) start = 0;
  v.from = start; v.to = Math.min(ns.shape.notes.length - 1, start + (r.to - r.from));
}
function seriesLabel(b, kind, item) {
  if (kind === 'keys') return b.kind === 'chord' ? chordName(item, b.quality) : b.kind === 'free' ? scaleName(item, b.ref.mode, b.ref.type) : b.kind === 'prog' ? keyName(item, b.mode) : scaleName(item, b.mode, b.type);
  if (kind === 'positions') return 'Bund ' + item;
  if (kind === 'octaves') return (item > 0 ? '+' : '') + item + ' Oktave' + (Math.abs(item) === 1 ? '' : 'n');
  return '';
}
function baseLabel(b) {
  if (b.kind === 'chord') return chordName(b.root, b.quality);
  if (b.kind === 'prog') return keyName(b.root, b.mode);
  if (b.kind === 'free') return b.ref ? scaleName(b.ref.root, b.ref.mode, b.ref.type) : '';
  return scaleName(b.root, b.mode, b.type);
}

// Baustein inkl. Reihe → Segmente
function generateBlock(b, meter = meterOf('4/4')) {
  const warn = [];
  let segs = generateCore(b, meter).map(s => Object.assign({ label: s.label || null, variant: 0 }, s));
  const ser = b.series || { kind: 'none', items: [] };
  if (ser.kind !== 'none' && ser.items.length) {
    const first = segs.map(s => Object.assign({}, s, { label: s.label || (ser.kind === 'octaves' ? 'Grundlage' : seriesLabel(b, ser.kind === 'keys' ? 'keys' : 'positions', ser.kind === 'keys' ? (b.kind === 'free' ? b.ref.root : b.root) : (b.kind === 'chord' || b.kind === 'prog' ? b.fret : blockShape(b).shape.f))) }));
    const all = first.slice();
    ser.items.forEach((item, k) => {
      if (ser.kind === 'octaves') {
        const add = [];
        for (const s of segs) {
          const sh = s.notes.map(n => shiftEv(n, 12 * item));
          if (sh.some(n => evFrets(n).some(f => f < 0 || f > MAX_FRET))) { warn.push(`${seriesLabel(b, 'octaves', item)} passt nicht aufs Griffbrett`); return; }
          add.push(Object.assign({}, s, { notes: sh, label: (s.label ? s.label + ' · ' : '') + seriesLabel(b, 'octaves', item), variant: k + 1 }));
        }
        all.push(...add);
        return;
      }
      const v = variantOf(b, ser.kind, item);
      if (!v) { warn.push(`${seriesLabel(b, ser.kind, item)} passt nicht aufs Griffbrett`); return; }
      generateCore(v, meter).forEach(s => { const L = seriesLabel(b, ser.kind, item); all.push(Object.assign({}, s, { label: s.label && s.label !== L ? L + ' · ' + s.label : L, variant: k + 1 })); });
    });
    segs = all;
  }
  return { segs, warn };
}

// Segmente → Takte. Jedes Segment beginnt auf einem neuen Takt. Ein Ton, der nicht mehr
// in den Takt passt, rückt in den nächsten; der Rest wird mit Pausen aufgefüllt.
function defaultUnit(b) { return b.unit || (b.kind === 'exercise' ? SECTIONS.find(s => s.id === b.section).unit : 'e'); }
function restsFor(pos, to) {
  const out = [];
  while (pos < to) {
    const gap = to - pos;
    const v = [48, 24, 12, 6, 3].find(x => x <= gap && pos % x === 0) || [8, 4, 2, 1].find(x => x <= gap && (gap - x) % 1 === 0);
    const uk = DUR_KEY[v], u = UNITS[uk];
    out.push({ kind: 'rest', uk, dur: u.dur, type: u.type, tuplet: u.tuplet, pad: true });
    pos += v;
  }
  return out;
}
function groupTuplets(events) {
  let g = [], sum = 0, base = 0;
  const close = () => { if (g.length) { g[0].tupStart = true; g[g.length - 1].tupStop = true; } g = []; sum = 0; };
  events.forEach(e => {
    if (!e.tuplet) { close(); return; }
    if (!g.length) base = e.dur;
    g.push(e); sum += e.dur;
    if (sum >= base * 3) close();
  });
  close();
}
function layoutBlock(b, segs, meter = meterOf('4/4')) {
  const defU = defaultUnit(b), len = meter.len;
  const measures = [];
  segs.forEach((seg, si) => {
    let cur = [], acc = 0, first = true;
    const push = () => { groupTuplets(cur); measures.push({ events: cur, seg, segIndex: si, first }); first = false; cur = []; acc = 0; };
    seg.notes.forEach(n => {
      let uk = n.uk || defU;
      if (UNITS[uk].dur > len) { uk = DUR_KEY[[24, 12].find(x => x <= len)]; n = Object.assign({}, n, { shortened: true }); }
      const u = UNITS[uk];
      const e = Object.assign({}, n, { uk, dur: u.dur, type: u.type, tuplet: u.tuplet });
      if (acc + e.dur > len && acc > 0) { cur.push(...restsFor(acc, len)); push(); e.moved = true; }
      cur.push(e); acc += e.dur;
      if (acc === len) push();
    });
    if (cur.length || first) { cur.push(...restsFor(acc, len)); push(); }
  });
  return { unit: UNITS[defU], measures };
}

// Ganze Folge berechnen: Blöcke mit Takten, laufende Ton-Nummern für Auswahl und Wiedergabe
function computeDoc(doc) {
  let mno = 0, k = 0;
  const meter = meterOf(doc.time);
  return doc.blocks.map((b, bi) => {
    let gen, err = null;
    try { gen = generateBlock(b, meter); } catch (e) { gen = { segs: [], warn: [] }; err = e.message; }
    const lay = layoutBlock(b, gen.segs, meter);
    if (lay.measures.some(m => m.events.some(e => e.moved))) gen.warn.push('Mindestens ein Ton passte nicht mehr in den Takt und beginnt deshalb im nächsten Takt.');
    if (lay.measures.some(m => m.events.some(e => e.shortened))) gen.warn.push('Ein Ton war länger als ein ganzer Takt und wurde gekürzt.');
    let ni = 0;
    lay.measures.forEach(m => { m.no = ++mno; m.events.forEach(e => { if (e.kind === 'note' || (e.kind === 'rest' && e.fi != null)) { e.k = k++; e.bi = bi; e.ni = ni++; } }); });
    // Bindungen (Hammer-on/Pull-off, Slide) zum jeweils nächsten Ton
    const evs = lay.measures.flatMap(m => m.events);
    evs.forEach((e, i) => {
      if (e.kind !== 'note' || !e.tech || (e.extra && e.extra.length)) return;
      const nx = evs[i + 1];
      if (!nx || nx.kind !== 'note' || (nx.extra && nx.extra.length)) return;
      if (e.tech.legato) { e.link = nx.m >= e.m ? 'H' : 'P'; nx.linkIn = e.link; }
      else if (e.tech.slide) { e.link = 'S'; nx.linkIn = 'S'; }
    });
    return { block: b, bi, unit: lay.unit, meter, measures: lay.measures, warn: gen.warn, err };
  });
}

// Baustein mit allen Reihen-Varianten in eine freie Tonfolge umwandeln
// Ereignis aus der Tabulatur → Eintrag einer freien Tonfolge (mit Länge)
function evToNote(e) {
  if (e.kind !== 'note') return { rest: true, dur: e.uk };
  const n = { pos: [{ s: e.s, f: e.f }].concat((e.extra || []).map(x => ({ s: x.s, f: x.f }))), dur: e.uk };
  if (e.tech) n.tech = Object.assign({}, e.tech);
  return n;
}
function toFree(b, meter = meterOf('4/4')) {
  const { segs } = generateBlock(b, meter);
  const evs = layoutBlock(b, segs, meter).measures.flatMap(m => m.events);
  while (evs.length && evs[evs.length - 1].kind === 'rest' && evs[evs.length - 1].pad) evs.pop();
  const notes = evs.map(evToNote);
  const ref = b.kind === 'free' ? b.ref : (b.kind === 'exercise' || b.kind === 'scale') ? { type: b.type, root: b.root, mode: b.mode } : b.kind === 'prog' ? { type: 'scale', root: b.root, mode: b.mode } : null;
  const out = { id: b.id, kind: 'free', ref, notes, unit: defaultUnit(b), series: { kind: 'none', items: [] } };
  if (b.title) out.title = b.title;
  return out;
}
// Mehrere Bausteine zu einer freien Tonfolge zusammenführen (Takte bleiben erhalten)
function mergeBlocks(blocks, meter) {
  const parts = blocks.map(b => toFree(b, meter));
  const notes = [];
  parts.forEach(p => {
    notes.push(...p.notes);
    // bis zum Taktende auffüllen, damit der nächste Teil wieder auf einem Takt beginnt
    const used = p.notes.reduce((a, n) => a + UNITS[n.dur].dur, 0) % meter.len;
    if (used) restsFor(used, meter.len).forEach(r => notes.push({ rest: true, dur: r.uk }));
  });
  while (notes.length && notes[notes.length - 1].rest) notes.pop();
  const ref = parts.map(p => p.ref).find(Boolean) || null;
  return { id: uid(), kind: 'free', ref, notes, unit: parts[0] ? parts[0].unit : 'e', series: { kind: 'none', items: [] }, title: 'Zusammengeführt: ' + blocks.map(blockTitle).join(' + ').slice(0, 60) };
}

function blockTitle(b) {
  if (b.title) return b.title;
  if (b.kind === 'exercise') return `${sectionTitle(b.section, b.type)} · ${scaleName(b.root, b.mode, b.type)}`;
  if (b.kind === 'scale') return `${scaleName(b.root, b.mode, b.type)}`;
  if (b.kind === 'chord') return `${chordName(b.root, b.quality)}-Arpeggio`;
  if (b.kind === 'prog') return `Akkordfolge in ${keyName(b.root, b.mode)}`;
  return b.notes && b.notes.length ? 'Freie Tonfolge' : 'Freie Tonfolge (leer)';
}

// Prüft und ergänzt importierte Daten
function sanitizeDoc(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.blocks)) throw new Error('Keine gültige Übungsfolge');
  const doc = Object.assign(newDoc(), d);
  doc.bpm = Math.max(30, Math.min(240, +doc.bpm || 80));
  if (!TIMES.includes(doc.time)) doc.time = '4/4';
  doc.blocks = d.blocks.filter(b => b && KINDS[b.kind]).map(b => {
    const n = Object.assign(newBlock(b.kind), b);
    n.id = typeof b.id === 'string' ? b.id : uid();
    if (!n.series || !n.series.kind) n.series = { kind: 'none', items: [] };
    if (n.kind === 'free') n.notes = (n.notes || []).map(cleanNote).filter(Boolean);
    return n;
  });
  return doc;
}

function cleanNote(x) {
  if (!x || typeof x !== 'object') return null;
  const dur = UNITS[x.dur] && FREE_UNITS.concat('x32').includes(x.dur) ? x.dur : undefined;
  if (x.rest) return dur ? { rest: true, dur } : { rest: true };
  const seen = new Set();
  const pos = notePos(x).filter(p => p && p.s >= 0 && p.s < 6 && p.f >= 0 && p.f <= MAX_FRET && Number.isInteger(p.s) && Number.isInteger(p.f) && !seen.has(p.s) && seen.add(p.s)).map(p => ({ s: p.s, f: p.f }));
  if (!pos.length) return null;
  const n = { pos };
  if (dur) n.dur = dur;
  if (x.tech && typeof x.tech === 'object') {
    const t = {};
    if (x.tech.bend === 1 || x.tech.bend === 2) t.bend = x.tech.bend;
    if (t.bend && x.tech.release) t.release = true;
    if (x.tech.legato) t.legato = true; else if (x.tech.slide) t.slide = true;
    if (Object.keys(t).length) n.tech = t;
  }
  return n;
}
