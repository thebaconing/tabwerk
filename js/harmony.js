// Tonart des Stücks: Prüfen, ob Bausteine passen, und passende Bausteine vorschlagen.
'use strict';

const KEY_LEVEL = { fit: 0, related: 1, outside: 2 };
const LEVEL_TEXT = { fit: 'passt', related: 'verwandt', outside: 'passt nicht' };

function keyScale(key) { return key ? buildScale(key.root, key.mode, 'scale') : null; }
function keyLabel(key) { return key ? keyName(key.root, key.mode) : ''; }
function relativeOf(key) {
  const other = key.mode === 'major' ? 'minor' : 'major';
  const f = fifthsOf(key.root, key.mode);
  return { root: (ROOTS[other].find(r => r[1] === f) || ROOTS[other][0])[0], mode: other };
}
// Blue Notes der Tonart: Dur-Blues b3, Moll-Blues b5
function bluePcs(key) { const b = buildScale(key.root, key.mode, 'blues'); return new Set(b.filter(t => t.blue).map(t => t.pc)); }
function spellPc(pc, key) { const sp = spellMidi(60 + mod12(pc - 60), keyScale(key), fifthsOf(key.root, key.mode)); return deNote(sp.letter, sp.alter); }

// Stufe eines Akkords in der Tonart (oder -1)
function chordDegree(root, key) { const sc = keyScale(key), r = parseName(root); return sc.findIndex(t => t.pc === r.pc && t.letter === r.letter); }
function chordFit(root, q, key) {
  const sc = keyScale(key), keyPcs = new Set(sc.map(t => t.pc));
  const set = buildChord(root, q), deg = chordDegree(root, key);
  const out = set.filter(t => !keyPcs.has(t.pc));
  if (!out.length && deg < 0) { const pd = sc.findIndex(t => t.pc === pcOf(root)); return { level: 'outside', text: `klingt passend, wird in ${keyLabel(key)} aber als ${pd >= 0 ? deNote(sc[pd].letter, sc[pd].alter) : '?'} geschrieben` }; }
  if (!out.length) return { level: 'fit', text: `Stufe ${romanOf(deg, q)} in ${keyLabel(key)}` };
  if (key.mode === 'minor' && deg === 4 && (q === '7' || q === 'maj')) return { level: 'related', text: 'Dominante aus harmonisch Moll, führt zurück zur i' };
  if (key.mode === 'minor' && deg === 6 && q === 'dim7') return { level: 'related', text: 'verminderter Akkord aus harmonisch Moll, führt zur i' };
  if (q === '7' && deg >= 0 && [0, 3, 4].includes(deg)) return { level: 'related', text: `Blues-Akkord: Dominantsept auf Stufe ${ROMAN[deg]}` };
  // Zwischendominante: Dur- oder Septakkord eine Quinte über einer leitereigenen Stufe (nicht der verminderten)
  if (q === '7' || q === 'maj') {
    const target = sc.findIndex(t => t.pc === mod12(pcOf(root) - 7));
    if (target >= 0 && parseName(root).letter === (sc[target].letter + 4) % 7) {
      const tc = diatonicChord(key.root, key.mode, target, false);
      if (tc.quality !== 'dim') return { level: 'related', text: `Zwischendominante zu ${chordName(tc.root, tc.quality)} (${romanOf(target, tc.quality)})` };
    }
  }
  return { level: 'outside', text: `leiterfremd: ${out.map(t => deNote(t.letter, t.alter)).join(', ')}` };
}

// Prüft einen berechneten Baustein (aus computeDoc) gegen die Tonart
function blockFit(B, key) {
  if (!key) return null;
  const b = B.block, sc = keyScale(key), keyPcs = new Set(sc.map(t => t.pc)), blue = bluePcs(key);
  if (b.kind === 'chord') return chordFit(b.root, b.quality, key);
  if (b.kind === 'prog') {
    const res = progChords(b).map(c => Object.assign({ name: chordName(c.root, c.quality) }, chordFit(c.root, c.quality, key)));
    const worst = res.reduce((a, r) => KEY_LEVEL[r.level] > KEY_LEVEL[a] ? r.level : a, 'fit');
    if (worst === 'fit') return { level: 'fit', text: `alle Akkorde leitereigen in ${keyLabel(key)}` };
    return { level: worst, text: res.filter(r => r.level !== 'fit').map(r => `${r.name}: ${r.text}`).join('; ') };
  }
  const pcs = new Set();
  B.measures.forEach(M => M.events.forEach(e => { if (e.kind === 'note') [e].concat(e.extra || []).forEach(t => pcs.add(mod12(t.m))); }));
  const out = [...pcs].filter(p => !keyPcs.has(p));
  if (!pcs.size) return { level: 'fit', text: 'noch keine Töne' };
  if (!out.length) {
    if (b.kind === 'exercise' || b.kind === 'scale') {
      const rel = relativeOf(key);
      const what = b.root === key.root && b.mode === key.mode ? 'Tonart des Stücks' : b.root === rel.root && b.mode === rel.mode ? 'Paralleltonart' : 'nur Töne aus der Tonart';
      return { level: 'fit', text: what };
    }
    return { level: 'fit', text: `nur Töne aus ${keyLabel(key)}` };
  }
  const names = out.sort((a, c) => a - c).map(p => spellPc(p, key)).join(', ');
  if (out.every(p => blue.has(p))) return { level: 'related', text: `Blue Note ${names} ist leiterfremd, im Blues üblich` };
  return { level: 'outside', text: `leiterfremd: ${names}` };
}

// ---------- Akkord-Zusammenhang ----------
// Akkord aus Tonklassen erkennen
function identifyChord(pcsIn) {
  const pcs = [...new Set(pcsIn.map(mod12))];
  if (pcs.length < 2) return null;
  for (const r of CHORD_ROOTS) {
    const rp = pcOf(r); if (!pcs.includes(rp)) continue;
    for (const q of Object.keys(CHORDS)) {
      const cp = new Set(CHORDS[q].iv.map(i => mod12(rp + i)));
      if (cp.size === pcs.length && pcs.every(p => cp.has(p))) return { root: r, quality: q, name: chordName(r, q), pcs: [...cp] };
    }
  }
  // Powerchord (Grundton + Quinte)
  if (pcs.length === 2) for (const [a, c] of [[pcs[0], pcs[1]], [pcs[1], pcs[0]]]) if (mod12(c - a) === 7) {
    const r = CHORD_ROOTS.find(x => pcOf(x) === a && !/b/.test(x)) || CHORD_ROOTS.find(x => pcOf(x) === a);
    return { root: r, quality: null, name: deName(r) + '5', pcs: [a, c] };
  }
  return null;
}
function chordOfEvent(e) { return e && e.kind === 'note' && e.extra && e.extra.length ? identifyChord([e.m].concat(e.extra.map(x => x.m))) : null; }
// Letzter Akkord vor einer Stelle: in der freien Tonfolge vor fi, sonst im vorherigen Baustein
function chordBefore(comp, bi, fi) {
  for (let i = bi; i >= 0; i--) {
    const B = comp[i]; if (!B) continue;
    const b = B.block;
    if (b.kind === 'free') {
      const evs = B.measures.flatMap(m => m.events).filter(e => e.kind === 'note' && (i !== bi || fi == null || e.fi <= fi));
      for (let k = evs.length - 1; k >= 0; k--) { const c = chordOfEvent(evs[k]); if (c) return Object.assign(c, { from: i }); }
      continue;
    }
    if (i === bi && fi != null) continue;
    if (b.kind === 'chord') return { root: b.root, quality: b.quality, name: chordName(b.root, b.quality), pcs: buildChord(b.root, b.quality).map(t => t.pc), from: i };
    if (b.kind === 'prog') { const cs = progChords(b); const c = cs[cs.length - 1]; if (c) return { root: c.root, quality: c.quality, name: chordName(c.root, c.quality), pcs: buildChord(c.root, c.quality).map(t => t.pc), from: i }; }
  }
  return null;
}

// Übliche Fortsetzungen je Stufe (Funktionsharmonik), wichtigste zuerst
const NEXT = {
  major: { 0: [3, 4, 5, 1, 2], 1: [4, 6, 3], 2: [5, 3, 1], 3: [4, 0, 1, 6], 4: [0, 5, 3], 5: [1, 3, 4], 6: [0, 2] },
  minor: { 0: [3, 4, 5, 2, 6], 1: [4, 0], 2: [5, 3], 3: [4, 0, 6], 4: [0, 5], 5: [3, 1, 6], 6: [2, 0] }
};
function nextChords(prev, key, seventh) {
  if (!prev || !key) return [];
  const deg = chordDegree(prev.root, key);
  let degs;
  if (deg < 0) {
    // leiterfremder Akkord, z. B. Zwischendominante: Auflösung eine Quinte tiefer
    const t = keyScale(key).findIndex(x => x.pc === mod12(pcOf(prev.root) - 7));
    degs = t >= 0 ? [t] : [0];
  } else degs = NEXT[key.mode][deg];
  return degs.map(d => { const c = diatonicChord(key.root, key.mode, d, seventh); return { deg: d, root: c.root, quality: c.quality, name: chordName(c.root, c.quality), roman: romanOf(d, c.quality) }; });
}

// ---------- Vorschläge ----------
const PROG_PRESETS_MINOR = [
  { id: 'i-VI-III-VII', label: 'i – VI – III – VII', chords: [0, 5, 2, 6].map(d => ({ deg: d, q: 'auto' })) },
  { id: 'i-iv-VII-III', label: 'i – iv – VII – III', chords: [0, 3, 6, 2].map(d => ({ deg: d, q: 'auto' })) },
  { id: 'i-VII-VI-v', label: 'i – VII – VI – v', chords: [0, 6, 5, 4].map(d => ({ deg: d, q: 'auto' })) }
];
// Jeder Vorschlag: { group, label, sub, level, make() → Baustein }
function suggestions(key, opt = {}) {
  if (!key) return [];
  const out = [], rel = relativeOf(key), K = { root: key.root, mode: key.mode };
  const add = (group, label, sub, level, make) => out.push({ group, label, sub, level, make });
  // Skalen und Übungen
  add('scale', `${scaleName(key.root, key.mode, 'scale')}`, 'Tonleiter der Tonart', 'fit', () => newBlock('scale', Object.assign({ type: 'scale' }, K)));
  add('scale', `${scaleName(key.root, key.mode, 'penta')}`, 'Pentatonik der Tonart', 'fit', () => newBlock('scale', Object.assign({ type: 'penta' }, K)));
  add('scale', `${scaleName(rel.root, rel.mode, 'scale')}`, 'Paralleltonart, gleiche Töne', 'fit', () => newBlock('scale', Object.assign({ type: 'scale' }, rel)));
  add('scale', `${scaleName(rel.root, rel.mode, 'penta')}`, 'Pentatonik der Paralleltonart', 'fit', () => newBlock('scale', Object.assign({ type: 'penta' }, rel)));
  add('scale', `${scaleName(key.root, key.mode, 'blues')}`, 'mit Blue Note, im Blues üblich', 'related', () => newBlock('scale', Object.assign({ type: 'blues' }, K)));
  SECTIONS.forEach(s => add('scale', `Übung ${sectionTitle(s.id, 'scale')}`, `in ${keyLabel(key)}`, 'fit', () => Object.assign(newBlock('exercise', Object.assign({ type: 'scale' }, K)), { section: s.id })));
  add('scale', 'Übung Dreiergruppen', `in ${scaleName(key.root, key.mode, 'penta')}`, 'fit', () => newBlock('exercise', Object.assign({ type: 'penta' }, K)));
  const variant = { root: key.root, mode: key.mode === 'major' ? 'minor' : 'major' };
  if (ROOTS[variant.mode].some(r => r[0] === variant.root)) add('scale', scaleName(variant.root, variant.mode, 'scale'), 'gleicher Grundton, anderes Tongeschlecht', 'outside', () => newBlock('scale', Object.assign({ type: 'scale' }, variant)));
  // Leitereigene Akkorde
  for (let d = 0; d < 7; d++) {
    const c = diatonicChord(key.root, key.mode, d, !!opt.seventh);
    add('chord', chordName(c.root, c.quality), `Stufe ${romanOf(d, c.quality)}`, 'fit', () => Object.assign(newBlock('chord'), { root: c.root, quality: c.quality, fret: bestChordFret(c.root, c.quality) }));
  }
  // Verwandte Akkorde: Zwischendominanten und Blues-Septakkorde
  const sc = keyScale(key);
  for (let d = 1; d < 6; d++) {
    const t = diatonicChord(key.root, key.mode, d, false); if (t.quality === 'dim') continue;
    const sp = spellMidi(48 + mod12(sc[d].pc + 7), null, fifthsOf(key.root, key.mode)), r = nameOf(sp.letter, sp.alter);
    const f = chordFit(r, '7', key);
    if (f.level === 'related') add('chord', chordName(r, '7'), f.text, 'related', () => Object.assign(newBlock('chord'), { root: r, quality: '7', fret: bestChordFret(r, '7') }));
  }
  if (key.mode === 'minor') { const sp = spellMidi(48 + mod12(sc[0].pc + 7), null, fifthsOf(key.root, key.mode)), r = nameOf(sp.letter, sp.alter); add('chord', chordName(r, '7'), chordFit(r, '7', key).text, 'related', () => Object.assign(newBlock('chord'), { root: r, quality: '7', fret: bestChordFret(r, '7') })); }
  [0, 3, 4].forEach(d => {
    const r = nameOf(sc[d].letter, sc[d].alter);
    const f = chordFit(r, '7', key);
    if (f.level === 'related' && !out.some(o => o.group === 'chord' && o.label === chordName(r, '7'))) add('chord', chordName(r, '7'), f.text, 'related', () => Object.assign(newBlock('chord'), { root: r, quality: '7', fret: bestChordFret(r, '7') }));
  });
  // Akkordfolgen
  const presets = (key.mode === 'minor' ? PROG_PRESETS.filter(p => p.id === 'i-iv-v').concat(PROG_PRESETS_MINOR) : PROG_PRESETS.filter(p => !['i-iv-v', 'blues12'].includes(p.id))).concat(PROG_PRESETS.filter(p => p.id === 'blues12'));
  presets.forEach(p => {
    const b = Object.assign(newBlock('prog', K), { chords: p.chords.map(c => Object.assign({}, c)), seventh: !!opt.seventh });
    const names = progChords(b).map(c => chordName(c.root, c.quality)).join(' – ');
    const level = p.chords.every(c => c.q === 'auto') ? 'fit' : 'related';
    add('prog', p.label, names, level, () => { const nb = Object.assign(newBlock('prog', K), { chords: p.chords.map(c => Object.assign({}, c)), seventh: !!opt.seventh }); nb.fret = bestChordFret(progChords(nb)[0].root, progChords(nb)[0].quality); return nb; });
  });
  // Nächster Akkord nach dem vorherigen
  if (opt.prev) nextChords(opt.prev, key, !!opt.seventh).forEach((c, i) => add('next', c.name, `${c.roman}${i === 0 ? ' · häufigste Fortsetzung' : ''}`, 'fit', () => Object.assign(newBlock('chord'), { root: c.root, quality: c.quality, fret: bestChordFret(c.root, c.quality) })));
  return out;
}
// Lage, in der ein Arpeggio ab dem Grundton am vollständigsten liegt (bevorzugt tief)
function bestChordFret(root, q) {
  const set = buildChord(root, q);
  let best = 0, score = -1;
  for (let f = 0; f <= 9; f++) {
    const notes = shapePosition(set, f), r = notes.findIndex(n => degreeOf(set, n.m) === 0);
    if (r < 0) continue;
    const sc = Math.min(notes.length - r, set.length + 1) * 10 - f;
    if (sc > score) { score = sc; best = f; }
  }
  return best;
}

// Passt eine Leiter (Grundton, Tongeschlecht, Typ) zur Tonart?
function scaleLevel(root, mode, type, key) {
  if (!key) return null;
  const keyPcs = new Set(keyScale(key).map(t => t.pc)), blue = bluePcs(key);
  const out = buildScale(root, mode, type).filter(t => !keyPcs.has(t.pc));
  if (!out.length) return 'fit';
  return out.every(t => blue.has(t.pc)) ? 'related' : 'outside';
}
// Bester Wert über alle Akkordarten eines Grundtons
function chordRootLevel(root, key) {
  if (!key) return null;
  let best = 'outside';
  for (const q of Object.keys(CHORDS)) { const l = chordFit(root, q, key).level; if (KEY_LEVEL[l] < KEY_LEVEL[best]) best = l; if (best === 'fit') break; }
  return best;
}
