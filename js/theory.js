// Musiktheorie: Leitern, Akkorde, Schreibweise, Fingersätze auf dem Griffbrett.
'use strict';

const OPEN = [40, 45, 50, 55, 59, 64]; // E A D G H e (MIDI), Index 0 = tiefe E-Saite
const STR_NAMES = ['E', 'A', 'D', 'G', 'H', 'e'];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NAT_PC = [0, 2, 4, 5, 7, 9, 11];
const MAX_FRET = 22;

// Leitertypen: Halbtonabstände (iv) und Buchstabenschritte (st) je Tongeschlecht, blue = Index der Blue Note
const TYPES = {
  scale: { label: 'Tonleiter', major: { iv: [0, 2, 4, 5, 7, 9, 11], st: [0, 1, 2, 3, 4, 5, 6] }, minor: { iv: [0, 2, 3, 5, 7, 8, 10], st: [0, 1, 2, 3, 4, 5, 6] } },
  penta: { label: 'Pentatonik', major: { iv: [0, 2, 4, 7, 9], st: [0, 1, 2, 4, 5] }, minor: { iv: [0, 3, 5, 7, 10], st: [0, 2, 3, 4, 6] } },
  blues: { label: 'Blues', major: { iv: [0, 2, 3, 4, 7, 9], st: [0, 1, 2, 2, 4, 5], blue: 2 }, minor: { iv: [0, 3, 5, 6, 7, 10], st: [0, 2, 3, 4, 4, 6], blue: 3 } }
};
// Grundtöne je Tongeschlecht mit Vorzeichenzahl (fifths)
const ROOTS = {
  major: [['C', 0], ['G', 1], ['D', 2], ['A', 3], ['E', 4], ['B', 5], ['F#', 6], ['F', -1], ['Bb', -2], ['Eb', -3], ['Ab', -4], ['Db', -5], ['Gb', -6]],
  minor: [['A', 0], ['E', 1], ['B', 2], ['F#', 3], ['C#', 4], ['G#', 5], ['D#', 6], ['D', -1], ['G', -2], ['C', -3], ['F', -4], ['Bb', -5], ['Eb', -6]]
};
// Freie Akkord-Grundtöne
const CHORD_ROOTS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Akkordtypen: Halbtöne und Buchstabenschritte
const CHORDS = {
  maj: { sym: '', label: 'Dur', iv: [0, 4, 7], st: [0, 2, 4] },
  min: { sym: 'm', label: 'Moll', iv: [0, 3, 7], st: [0, 2, 4] },
  dim: { sym: '°', label: 'vermindert', iv: [0, 3, 6], st: [0, 2, 4] },
  aug: { sym: '+', label: 'übermäßig', iv: [0, 4, 8], st: [0, 2, 4] },
  sus2: { sym: 'sus2', label: 'sus2', iv: [0, 2, 7], st: [0, 1, 4] },
  sus4: { sym: 'sus4', label: 'sus4', iv: [0, 5, 7], st: [0, 3, 4] },
  '6': { sym: '6', label: 'Sexte', iv: [0, 4, 7, 9], st: [0, 2, 4, 5] },
  m6: { sym: 'm6', label: 'Moll-Sexte', iv: [0, 3, 7, 9], st: [0, 2, 4, 5] },
  '7': { sym: '7', label: 'Dominantsept', iv: [0, 4, 7, 10], st: [0, 2, 4, 6] },
  maj7: { sym: 'maj7', label: 'große Sept', iv: [0, 4, 7, 11], st: [0, 2, 4, 6] },
  m7: { sym: 'm7', label: 'Moll-Sept', iv: [0, 3, 7, 10], st: [0, 2, 4, 6] },
  m7b5: { sym: 'm7♭5', label: 'halbvermindert', iv: [0, 3, 6, 10], st: [0, 2, 4, 6] },
  dim7: { sym: '°7', label: 'vermindert Sept', iv: [0, 3, 6, 9], st: [0, 2, 4, 6] },
  '9': { sym: '9', label: 'None', iv: [0, 4, 7, 10, 2], st: [0, 2, 4, 6, 1] }
};

function parseName(n) {
  const letter = LETTERS.indexOf(n[0]);
  const acc = n.slice(1);
  const alter = acc === '#' ? 1 : acc === 'b' ? -1 : acc === '##' ? 2 : acc === 'bb' ? -2 : 0;
  return { letter, alter, pc: ((NAT_PC[letter] + alter) % 12 + 12) % 12 };
}
function nameOf(letter, alter) { return LETTERS[letter] + (alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter)); }
function pcOf(name) { return parseName(name).pc; }
function mod12(x) { return ((x % 12) + 12) % 12; }

// Deutsche Notennamen (H statt B, B statt Bb)
function deNote(letter, alter) {
  const L = LETTERS[letter];
  const acc = alter === 1 ? '♯' : alter === -1 ? '♭' : alter === 2 ? '𝄪' : alter === -2 ? '𝄫' : '';
  if (L === 'B') return alter === 0 ? 'H' : alter === -1 ? 'B' : 'H' + acc;
  return L + acc;
}
function deName(name) { const p = parseName(name); return deNote(p.letter, p.alter); }
function keyName(root, mode) {
  const n = deName(root).replace('♯', 'is').replace('♭', 'es').replace(/^Ees$/, 'Es').replace(/^Aes$/, 'As');
  return mode === 'minor' ? n.toLowerCase() + '-Moll' : n + '-Dur';
}
function scaleName(root, mode, type) { return keyName(root, mode) + (type === 'penta' ? '-Pentatonik' : type === 'blues' ? '-Blues' : ''); }
function chordName(root, q) { return deName(root) + CHORDS[q].sym; }
function fifthsOf(root, mode) { const r = ROOTS[mode].find(x => x[0] === root); return r ? r[1] : 0; }

// Leiter oder Akkord als Liste von Tönen mit Schreibweise (degree 0 = Grundton)
function spelled(letter0, pc0, iv, st, extra) {
  return iv.map((s, d) => {
    const letter = (letter0 + st[d]) % 7, pc = mod12(pc0 + s);
    let alter = pc - NAT_PC[letter];
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    return Object.assign({ degree: d, letter, alter, pc }, extra ? extra(d) : {});
  });
}
function buildScale(root, mode, type = 'scale') {
  const r = parseName(root), T = TYPES[type][mode];
  const sc = spelled(r.letter, r.pc, T.iv, T.st, d => ({ blue: d === T.blue }));
  Object.assign(sc, { root, mode, type, kind: 'scale' });
  return sc;
}
function buildChord(root, q) {
  const r = parseName(root), C = CHORDS[q];
  const ch = spelled(r.letter, r.pc, C.iv, C.st);
  Object.assign(ch, { root, quality: q, kind: 'chord' });
  return ch;
}
function degreeOf(set, midi) { const pc = mod12(midi); return set.findIndex(s => s.pc === pc); }
function isBlue(set, midi) { const d = degreeOf(set, midi); return d >= 0 && !!set[d].blue; }

// Diatonischer Akkord auf Stufe deg (0-6) einer Dur-/Molltonleiter
function diatonicChord(root, mode, deg, seventh) {
  const sc = buildScale(root, mode, 'scale');
  const tones = [0, 2, 4].concat(seventh ? [6] : []).map(k => sc[(deg + k) % 7]);
  const ivs = tones.map(t => mod12(t.pc - tones[0].pc));
  const key = ivs.join(',');
  const q = Object.keys(CHORDS).find(k => CHORDS[k].iv.slice(0, ivs.length).join(',') === key && CHORDS[k].iv.length === ivs.length);
  return { root: nameOf(tones[0].letter, tones[0].alter), quality: q || (seventh ? '7' : 'maj') };
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
function romanOf(deg, q) {
  const minorish = ['min', 'm7', 'dim', 'm7b5', 'dim7', 'm6'].includes(q);
  let r = ROMAN[deg];
  if (minorish) r = r.toLowerCase();
  const suf = { dim: '°', m7b5: 'ø7', dim7: '°7', aug: '+', '7': '7', maj7: 'maj7', m7: '7', '6': '6', m6: '6', '9': '9', sus2: 'sus2', sus4: 'sus4' }[q] || '';
  return r + suf;
}

// Schreibweise für beliebigen MIDI-Ton: Leiterton der Bezugsleiter, sonst nach Vorzeichen der Tonart
function spellMidi(m, set, fifths = 0) {
  if (set) { const d = degreeOf(set, m); if (d >= 0) return { letter: set[d].letter, alter: set[d].alter }; }
  const pc = mod12(m);
  const sharp = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
  const flat = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
  const [letter, alter] = (fifths < 0 ? flat : sharp)[pc];
  return { letter, alter };
}

// --- Fingersätze ---
// "pos": Lage mit 4-Bund-Fenster [f, f+3], Streckung auf f+4 nur wenn sonst ein Ton fehlt
function shapePosition(set, f) {
  const notes = [];
  let last = -1;
  for (let s = 0; s < 6; s++) {
    for (let fr = f; fr <= f + 4; fr++) {
      const m = OPEN[s] + fr;
      if (m <= last || degreeOf(set, m) < 0) continue;
      if (fr === f + 4 && s < 5) { const nf = m - OPEN[s + 1]; if (nf >= f && nf <= f + 3) continue; }
      if (fr === f + 4 && s === 5) continue;
      notes.push({ s, f: fr, m });
      last = m;
    }
  }
  return notes;
}
// n Töne pro Saite (Tonleiter 3, Pentatonik 2)
function shapeNps(set, f, per) {
  const notes = [];
  let m = OPEN[0] + f;
  for (let s = 0; s < 6; s++) for (let k = 0; k < per; k++) {
    notes.push({ s, f: m - OPEN[s], m });
    do { m++; } while (degreeOf(set, m) < 0);
  }
  return notes;
}
// Blues-Box: Pentatonik-Box (2 pro Saite) plus Blue Note an der nächstgelegenen Stelle
function shapeBluesBox(set, f) {
  const pent = buildScale(set.root, set.mode, 'penta');
  const box = shapeNps(pent, f, 2), out = [];
  const fr = box.map(n => n.f).filter(x => x > 0), lo = Math.min(...fr, f), hi = Math.max(...fr);
  const outside = x => x < lo ? lo - x : x > hi ? x - hi : 0;
  box.forEach((a, i) => {
    out.push(a);
    const b = box[i + 1]; if (!b) return;
    for (let m = a.m + 1; m < b.m; m++) {
      if (!isBlue(set, m)) continue;
      const fa = a.f + (m - a.m), fb = b.f - (b.m - m);
      if (a.s !== b.s && fb >= 0 && outside(fb) < outside(fa)) out.push({ s: b.s, f: fb, m });
      else out.push({ s: a.s, f: fa, m });
    }
  });
  return out;
}
// Alle Lagen einer Leiter (Start = Leiterton auf der tiefen E-Saite, Bund 0-12)
function listShapes(set, system) {
  const out = [];
  for (let f = 0; f <= 12; f++) {
    if (degreeOf(set, OPEN[0] + f) < 0 || isBlue(set, OPEN[0] + f)) continue;
    const notes = getShape(set, system, f);
    if (notes.some(n => n.f < 0 || n.f > MAX_FRET)) continue;
    const r = notes.findIndex(n => degreeOf(set, n.m) === 0);
    out.push({ f, notes, rootIdx: r, span: notes.length - 1 - r });
  }
  return out;
}
function getShape(set, system, f) {
  if (system === 'pos' || set.kind === 'chord') return shapePosition(set, f);
  if (set.type === 'blues') return shapeBluesBox(set, f);
  return shapeNps(set, f, set.type === 'penta' ? 2 : 3);
}
function bestShape(shapes) {
  return shapes.slice().sort((a, b) => (b.span - a.span) || (b.notes.length - a.notes.length) || a.f - b.f)[0];
}
// Nächstgelegene gültige Lage zu Bund f
function nearestShape(shapes, f) {
  return shapes.slice().sort((a, b) => Math.abs(a.f - f) - Math.abs(b.f - f) || a.f - b.f)[0];
}
