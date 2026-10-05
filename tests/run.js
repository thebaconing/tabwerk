// Prüft die Erzeugung aller Bausteinarten, Reihen, Takte und den MusicXML-Export.
// Aufruf: npm test
const T = require('./load.js')();
let checks = 0; const errs = [];
const ok = (c, msg) => { checks++; if (!c) errs.push(msg); };
const pcs = s => s.map(t => t.pc).join(',');

// --- Akkordtöne und Stufenakkorde ---
const chordName = (r, q) => T.chordName(r, q);
ok(pcs(T.buildChord('C', 'maj7')) === '0,4,7,11', 'Cmaj7');
ok(pcs(T.buildChord('F#', 'm7b5')) === '6,9,0,4', 'F#m7b5');
ok(T.buildChord('Eb', '7').map(t => T.nameOf(t.letter, t.alter)).join(' ') === 'Eb G Bb Db', 'Eb7 Schreibweise');
const prog = (root, mode, degs, sev) => degs.map(d => { const c = T.diatonicChord(root, mode, d, sev); return chordName(c.root, c.quality); }).join(' ');
ok(prog('C', 'major', [0, 3, 4], false) === 'C F G', 'C-Dur I-IV-V: ' + prog('C', 'major', [0, 3, 4], false));
ok(prog('C', 'major', [1, 4, 0], true) === 'Dm7 G7 Cmaj7', 'C-Dur ii-V-I: ' + prog('C', 'major', [1, 4, 0], true));
ok(prog('A', 'minor', [0, 3, 4], false) === 'Am Dm Em', 'a-Moll i-iv-v: ' + prog('A', 'minor', [0, 3, 4], false));
ok(prog('C', 'major', [6], false) === 'H°', 'C-Dur vii°: ' + prog('C', 'major', [6], false));
ok(prog('C', 'major', [6], true) === 'Hm7♭5', 'C-Dur vii7: ' + prog('C', 'major', [6], true));

// --- Hilfsprüfungen für erzeugte Bausteine ---
function checkBlock(b, tag) {
  const comp = T.computeDoc({ name: 't', bpm: 80, blocks: [b] });
  const B = comp[0];
  ok(!B.err, tag + ' Fehler: ' + B.err);
  B.measures.forEach((M, i) => ok(M.events.reduce((a, e) => a + e.dur, 0) === T.MEASURE, `${tag} Takt ${i + 1} nicht 4/4`));
  const notes = B.measures.flatMap(m => m.events).filter(e => e.kind === 'note');
  notes.forEach(e => {
    ok(T.OPEN[e.s] + e.f === e.m, `${tag} Bund/Ton passt nicht`);
    ok(e.f >= 0 && e.f <= T.MAX_FRET, `${tag} Bund außerhalb: ${e.f}`);
    ok(T.mod12(T.NAT_PC[e.sp.letter] + e.sp.alter) === T.mod12(e.m), `${tag} Schreibweise passt nicht zum Ton`);
  });
  const xml = T.toMusicXML({ name: 't', bpm: 80 }, comp);
  const LET = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  [...xml.matchAll(/<pitch><step>(\w)<\/step>(?:<alter>(-?\d)<\/alter>)?<octave>(-?\d)<\/octave><\/pitch>.*?<string>(\d)<\/string><fret>(\d+)<\/fret>/g)].forEach(p => {
    const w = (+p[3] + 1) * 12 + LET[p[1]] + (+p[2] || 0);
    ok(w - 12 === T.OPEN[6 - p[4]] + (+p[5]), `${tag} MusicXML-Tonhöhe`);
  });
  return { B, notes };
}

// Übungen und Skalen: alle Leitern, Tonarten, Fingersätze, Lagen
for (const type of ['scale', 'penta', 'blues']) for (const mode of ['major', 'minor']) for (const [root] of T.ROOTS[mode]) for (const system of ['pos', 'nps']) {
  const set = T.buildScale(root, mode, type);
  for (const sh of T.listShapes(set, system)) {
    for (const sec of T.SECTIONS) {
      const b = Object.assign(T.newBlock('exercise'), { type, mode, root, system, fret: sh.f, section: sec.id });
      const { notes } = checkBlock(b, `Übung ${type} ${root} ${mode} ${system} f${sh.f} ${sec.id}`);
      notes.forEach(e => ok(T.degreeOf(set, e.m) >= 0, 'Übung: leiterfremder Ton'));
      ok(T.degreeOf(set, notes[0].m) === 0 && T.degreeOf(set, notes[notes.length - 1].m) === 0, `Übung ${root} ${type} ${sec.id}: Anfang/Ende nicht auf Grundton`);
    }
    // Skala mit Ausschnitt und Richtungen
    const n = sh.notes.length;
    for (const dir of ['up', 'down', 'updown', 'downup']) {
      const b = Object.assign(T.newBlock('scale'), { type, mode, root, system, fret: sh.f, from: 1, to: n - 2, dir, unit: 's16' });
      const { notes } = checkBlock(b, `Skala ${type} ${root} ${dir}`);
      const exp = dir === 'updown' || dir === 'downup' ? 2 * (n - 2) - 1 : n - 2;
      ok(notes.length === exp, `Skala ${root} ${dir}: ${notes.length} statt ${exp} Töne`);
      const ms = notes.map(e => e.m);
      if (dir === 'up') ok(ms.every((m, i) => !i || m > ms[i - 1]), 'Skala auf nicht steigend');
      if (dir === 'down') ok(ms.every((m, i) => !i || m < ms[i - 1]), 'Skala ab nicht fallend');
    }
  }
}

// Akkord-Arpeggien: nur Akkordtöne, Umfang, Länge
for (const root of T.CHORD_ROOTS) for (const q of Object.keys(T.CHORDS)) for (const fret of [0, 3, 5, 7, 10, 12]) for (const range of ['oct1', 'oct2', 'all']) {
  const set = T.buildChord(root, q);
  const b = Object.assign(T.newBlock('chord'), { root, quality: q, fret, range, pattern: 'updown', length: 'once', unit: 's16' });
  const { notes } = checkBlock(b, `Akkord ${root}${q} f${fret} ${range}`);
  ok(notes.length > 0, `Akkord ${root}${q} f${fret}: keine Töne`);
  notes.forEach(e => ok(T.degreeOf(set, e.m) >= 0, `Akkord ${root}${q}: akkordfremder Ton`));
  notes.forEach(e => ok(e.f === 0 || (e.f >= fret && e.f <= fret + 4), `Akkord ${root}${q} f${fret}: Bund ${e.f} außerhalb der Lage`));
  if (range !== 'all' && notes.length) ok(T.degreeOf(set, notes[0].m) === 0, `Akkord ${root}${q}: beginnt nicht auf Grundton`);
  if (range === 'oct1' && notes.length > 1) { const top = Math.max(...notes.map(e => e.m)); ok(top - notes[0].m <= 12 + (q === '9' ? 2 : 0), `Akkord ${root}${q}: mehr als eine Oktave`); }
}
for (const len of [1, 2]) for (const unit of Object.keys(T.UNITS)) {
  const b = Object.assign(T.newBlock('chord'), { root: 'A', quality: 'm7', fret: 5, length: len, unit });
  const { B } = checkBlock(b, `Akkord Länge ${len} ${unit}`);
  ok(B.measures.length === len, `Akkord Länge ${len} ${unit}: ${B.measures.length} Takte`);
}

// Akkordfolgen: ein Takt je Akkord, richtige Akkordtöne
for (const mode of ['major', 'minor']) for (const [root] of T.ROOTS[mode]) for (const p of T.PROG_PRESETS) for (const seventh of [false, true]) {
  const b = Object.assign(T.newBlock('prog'), { root, mode, chords: p.chords.map(c => Object.assign({}, c)), seventh, fret: 5, length: 1 });
  const { B } = checkBlock(b, `Folge ${p.id} ${root} ${mode}`);
  ok(B.measures.length === p.chords.length, `Folge ${p.id} ${root}: ${B.measures.length} statt ${p.chords.length} Takte`);
  const chords = T.progChords(b);
  B.measures.forEach((M, i) => { const set = T.buildChord(chords[i].root, chords[i].quality); M.events.filter(e => e.kind === 'note').forEach(e => ok(T.degreeOf(set, e.m) >= 0, `Folge ${p.id} ${root}: Ton gehört nicht zu ${chords[i].root}${chords[i].quality}`)); });
}

// Reihen: Tonarten verschieben um das richtige Intervall, Oktaven um 12, Lagen bleiben in der Leiter
{
  const b = Object.assign(T.newBlock('scale', { type: 'penta', mode: 'minor', root: 'E' }), { fret: 0, series: { kind: 'keys', items: ['A', 'D', 'G', 'C'] } });
  const { segs } = T.generateBlock(b);
  ok(segs.length === 5, 'Reihe Tonarten: Anzahl');
  const base = segs[0].notes.map(n => n.m);
  segs.slice(1).forEach((s, i) => {
    const d = T.mod12(T.pcOf(b.series.items[i]) - T.pcOf('E'));
    const ms = s.notes.map(n => n.m);
    ok(ms.length === base.length && ms.every((m, k) => T.mod12(m - base[k]) === d), `Reihe Tonarten ${b.series.items[i]}: falsch transponiert`);
    const set = T.buildScale(b.series.items[i], 'minor', 'penta');
    s.notes.forEach(n => ok(T.degreeOf(set, n.m) >= 0, 'Reihe Tonarten: leiterfremder Ton'));
  });
}
{
  const b = Object.assign(T.newBlock('exercise', { type: 'scale', mode: 'major', root: 'G' }), { fret: 3, series: { kind: 'octaves', items: [1] } });
  const { segs, warn } = T.generateBlock(b);
  ok(!warn.length && segs.length === 2 && segs[1].notes.every((n, i) => n.m === segs[0].notes[i].m + 12 && n.f === segs[0].notes[i].f + 12), 'Reihe Oktave +1');
  const b2 = Object.assign(T.newBlock('exercise', { type: 'scale', mode: 'major', root: 'G' }), { fret: 3, series: { kind: 'octaves', items: [-1] } });
  ok(T.generateBlock(b2).warn.length === 1, 'Reihe Oktave -1 bei Bund 3 muss warnen');
}
{
  const b = Object.assign(T.newBlock('scale', { type: 'penta', mode: 'minor', root: 'A' }), { system: 'nps', fret: 5, from: 1, to: 6, series: { kind: 'positions', items: [8, 10, 12] } });
  const { segs } = T.generateBlock(b);
  const set = T.buildScale('A', 'minor', 'penta');
  const d0 = T.degreeOf(set, segs[0].notes[0].m);
  segs.forEach((s, i) => { ok(s.notes.length === segs[0].notes.length, `Reihe Lagen ${i}: andere Länge`); ok(T.degreeOf(set, s.notes[0].m) === d0, `Reihe Lagen ${i}: andere Startstufe`); });
}
{
  const b = T.newBlock('free', { type: 'blues', mode: 'minor', root: 'E' });
  b.notes = [{ s: 3, f: 2, tech: { bend: 2 } }, { rest: true }, { s: 4, f: 3, tech: { legato: true } }, { s: 4, f: 5 }];
  b.series = { kind: 'keys', items: ['A'] };
  const { segs } = T.generateBlock(b);
  ok(segs[1].notes[0].m === segs[0].notes[0].m + 5 || segs[1].notes[0].m === segs[0].notes[0].m - 7, 'Freie Tonfolge in A');
  ok(segs[1].notes[0].tech && segs[1].notes[0].tech.bend === 2, 'Technik bleibt bei Reihe erhalten');
  const comp = T.computeDoc({ name: 't', bpm: 80, blocks: [b] });
  const evs = comp[0].measures.flatMap(m => m.events).filter(e => e.kind === 'note');
  ok(evs[1].link === 'H' && evs[2].linkIn === 'H', 'Hammer-on erkannt');
  // Umwandeln behält alle Töne
  const f = T.toFree(b);
  ok(f.notes.filter(n => !n.rest).length === 6 && f.notes.filter(n => n.rest).length === 2, 'Umwandeln in freie Tonfolge');
}
// Umwandeln eines erzeugten Bausteins: gleiche Töne
{
  const b = Object.assign(T.newBlock('exercise', { type: 'penta', mode: 'minor', root: 'E' }), { fret: 0, section: 'fours', series: { kind: 'keys', items: ['A'] } });
  const a = T.generateBlock(b).segs.flatMap(s => s.notes).map(n => n.m);
  const f = T.toFree(b);
  const c = T.generateBlock(f).segs.flatMap(s => s.notes).map(n => n.m);
  ok(a.join() === c.join(), 'Umwandeln verändert Töne');
}
// Import prüft Daten
{
  let threw = false; try { T.sanitizeDoc({ foo: 1 }); } catch (e) { threw = true; }
  ok(threw, 'Ungültiger Import wird abgelehnt');
  const d = T.sanitizeDoc({ name: 'x', blocks: [{ kind: 'free', notes: [{ s: 9, f: 2 }, { s: 1, f: 3 }] }, { kind: 'nix' }] });
  ok(d.blocks.length === 1 && d.blocks[0].notes.length === 1, 'Import filtert ungültige Bausteine und Töne');
}
// Beispiel-Folge
{
  const d = T.exampleDoc(), comp = T.computeDoc(d);
  comp.forEach(B => { ok(!B.err && !B.warn.length, 'Beispiel: ' + T.blockTitle(B.block)); });
}

console.log(`Prüfungen: ${checks}, Fehler: ${errs.length}`);
if (errs.length) { console.log([...new Set(errs)].slice(0, 40).join('\n')); process.exit(1); }
