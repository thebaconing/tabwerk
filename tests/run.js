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
function checkBlock(b, tag, time = '4/4') {
  const comp = T.computeDoc({ name: 't', bpm: 80, time, blocks: [b] });
  const len = T.meterOf(time).len;
  const B = comp[0];
  ok(!B.err, tag + ' Fehler: ' + B.err);
  B.measures.forEach((M, i) => ok(M.events.reduce((a, e) => a + e.dur, 0) === len, `${tag} Takt ${i + 1} nicht ${time}`));
  const notes = B.measures.flatMap(m => m.events).filter(e => e.kind === 'note');
  notes.flatMap(e => [e].concat(e.extra || [])).forEach(e => {
    ok(T.OPEN[e.s] + e.f === e.m, `${tag} Bund/Ton passt nicht`);
    ok(e.f >= 0 && e.f <= T.MAX_FRET, `${tag} Bund außerhalb: ${e.f}`);
    ok(T.mod12(T.NAT_PC[e.sp.letter] + e.sp.alter) === T.mod12(e.m), `${tag} Schreibweise passt nicht zum Ton`);
  });
  const xml = T.toMusicXML({ name: 't', bpm: 80, time }, comp);
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
  ok(f.notes.filter(n => !n.rest).length === 6, 'Umwandeln in freie Tonfolge: Töne');
}
// Umwandeln eines erzeugten Bausteins: gleiche Töne
{
  const b = Object.assign(T.newBlock('exercise', { type: 'penta', mode: 'minor', root: 'E' }), { fret: 0, section: 'fours', series: { kind: 'keys', items: ['A'] } });
  const a = T.generateBlock(b).segs.flatMap(s => s.notes).map(n => n.m);
  const f = T.toFree(b);
  const c = T.generateBlock(f).segs.flatMap(s => s.notes).filter(n => n.kind === 'note').map(n => n.m);
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

// --- Akkordgriffe ---
const grip = (r, q, f) => { const p = T.chordVoicing(r, q, f), m = {}; p.forEach(x => m[x.s] = x.f); return [0, 1, 2, 3, 4, 5].map(s => m[s] == null ? 'x' : m[s]).join(''); };
[['C', 'maj', 0, 'x32010'], ['A', 'min', 0, 'x02210'], ['G', 'maj', 0, '320003'], ['E', 'maj', 0, '022100'], ['D', 'maj', 0, 'xx0232'], ['E', '7', 0, '020100'], ['F', 'maj', 1, '133211'], ['A', 'maj', 5, '577655'], ['G', '5', 3, '355xxx'], ['A', '5', 0, 'x022xx'], ['E', '5', 0, '022xxx'], ['D', '5', 5, 'x577xx'], ['C', '5', 3, 'x355xx']].forEach(([r, q, f, exp]) => ok(grip(r, q, f) === exp, `Griff ${r}${q} Bund ${f}: ${grip(r, q, f)} statt ${exp}`));
for (const r of T.CHORD_ROOTS) for (const q of Object.keys(T.CHORDS)) for (let f = 0; f <= 12; f++) {
  const p = T.chordVoicing(r, q, f), set = T.buildChord(r, q);
  p.forEach(x => ok(T.degreeOf(set, T.OPEN[x.s] + x.f) >= 0, `Griff ${r}${q} f${f}: falscher Ton`));
  ok(new Set(p.map(x => x.s)).size === p.length, `Griff ${r}${q}: Saite doppelt`);
  if (p.length) ok(T.degreeOf(set, T.OPEN[p[0].s] + p[0].f) === 0, `Griff ${r}${q} f${f}: Bass ist nicht der Grundton`);
}

// Lage nah am Ton: vollständige, spielbare Griffe, Powerchords mit passender Quinte
for (const r of ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'F#']) for (const q of ['maj', 'min', '7', 'm7', 'dim', '5']) for (const ref of [{ s: 0, f: 1 }, { s: 1, f: 5 }, { s: 2, f: 9 }, { s: 4, f: 12 }, null]) {
  const f = T.chordFretNear(r, q, ref), v = T.chordVoicing(r, q, f), fr = v.map(p => p.f).filter(x => x > 0);
  const want = new Set(T.buildChord(r, q).map(t => t.pc)), have = new Set(v.map(p => T.mod12(T.OPEN[p.s] + p.f)));
  ok([...want].every(pc => have.has(pc)), `Griff nah ${r}${q} ${JSON.stringify(ref)}: unvollständig`);
  ok(!fr.length || Math.max(...fr) - Math.min(...fr) <= 3, `Griff nah ${r}${q}: Spanne zu groß`);
  ok(v.every((p, i) => !i || p.s === v[i - 1].s + 1), `Griff nah ${r}${q}: Lücke zwischen Saiten`);
  const pv = T.powerVoicing(r, q, T.chordFretNear(r, '5', ref));
  ok(pv.length >= 2 && T.degreeOf(T.buildChord(r, q), T.OPEN[pv[1].s] + pv[1].f) >= 0 && T.mod12(T.OPEN[pv[0].s] + pv[0].f) === T.pcOf(r), `Powerchord zu ${r}${q} falsch`);
}

// --- Taktarten: alle Bausteinarten in allen Taktarten ---
for (const time of T.TIMES) {
  const m = T.meterOf(time);
  const blocks = [
    Object.assign(T.newBlock('exercise', { type: 'penta', mode: 'minor', root: 'A' }), { fret: 5, section: 'triads' }),
    Object.assign(T.newBlock('scale', { type: 'scale', mode: 'major', root: 'G' }), { dir: 'updown', unit: 'tri8' }),
    Object.assign(T.newBlock('chord'), { root: 'D', quality: 'maj7', fret: 5, length: 2, unit: 's16' }),
    Object.assign(T.newBlock('prog', { root: 'C', mode: 'major' }), { length: 1, unit: 'e' })
  ];
  blocks.forEach(b => checkBlock(b, `${time} ${b.kind}`, time));
  const ch = blocks[2], { B } = checkBlock(ch, `${time} chord len`, time);
  ok(B.measures.length === 2, `${time}: Arpeggio 2 Takte ergibt ${B.measures.length}`);
  // freie Tonfolge mit gemischten Längen und Akkorden
  const fr = T.newBlock('free', { type: 'scale', mode: 'major', root: 'C' });
  fr.notes = [{ pos: T.chordVoicing('C', 'maj', 0), dur: 'h' }, { pos: [{ s: 4, f: 1 }], dur: 'q' }, { pos: [{ s: 4, f: 3 }], dur: 'tri8' }, { pos: [{ s: 5, f: 0 }], dur: 'tri8' }, { pos: [{ s: 5, f: 1 }], dur: 'tri8' }, { rest: true, dur: 'e' }, { pos: [{ s: 3, f: 0 }], dur: 's16' }, { pos: [{ s: 3, f: 2 }], dur: 's16' }, { pos: [{ s: 2, f: 3 }], dur: 'w' }, { pos: [{ s: 1, f: 3 }], dur: 'tri16' }];
  const r = checkBlock(fr, `${time} frei`, time);
  const played = r.notes.map(e => [e].concat(e.extra || []).map(t => t.m).join('+'));
  const want = fr.notes.filter(n => !n.rest).map(n => T.notePos(n).slice().sort((a, c) => a.s - c.s).map(p => T.OPEN[p.s] + p.f).join('+'));
  ok(played.join() === want.join(), `${time} frei: Töne in falscher Reihenfolge`);
  // Umwandeln und Zusammenführen behalten Rhythmus und Töne
  for (const b of blocks.concat([fr])) {
    const before = T.computeDoc({ time, blocks: [b] })[0].measures.flatMap(x => x.events);
    const after = T.computeDoc({ time, blocks: [T.toFree(b, m)] })[0].measures.flatMap(x => x.events);
    const sig = evs => evs.map(e => (e.kind === 'note' ? [e].concat(e.extra || []).map(t => t.m).join('+') : 'r') + ':' + e.dur).join(' ');
    ok(sig(before) === sig(after), `${time} ${b.kind}: Umwandeln verändert Rhythmus`);
  }
  const merged = T.mergeBlocks(blocks, m);
  const mB = checkBlock(merged, `${time} zusammengeführt`, time);
  const sepNotes = T.computeDoc({ time, blocks }).flatMap(B2 => B2.measures.flatMap(x => x.events)).filter(e => e.kind === 'note').map(e => e.m);
  ok(mB.notes.map(e => e.m).join() === sepNotes.join(), `${time}: Zusammenführen verändert Töne`);
  const sepBars = T.computeDoc({ time, blocks }).reduce((a, B2) => a + B2.measures.length, 0);
  ok(mB.B.measures.length === sepBars, `${time}: Zusammenführen ändert Taktzahl (${mB.B.measures.length} statt ${sepBars})`);
  // Kopieren eines Bereichs (evToNote) und Einfügen ergibt dieselben Töne und Längen
  const evs = T.computeDoc({ time, blocks: [blocks[0]] })[0].measures.flatMap(x => x.events).slice(2, 11);
  const pasted = T.newBlock('free'); pasted.notes = evs.map(T.evToNote);
  const pe = T.computeDoc({ time, blocks: [pasted] })[0].measures.flatMap(x => x.events).filter(e => e.kind === 'note');
  ok(pe.map(e => e.m + ':' + e.dur).join() === evs.filter(e => e.kind === 'note').map(e => e.m + ':' + e.dur).join(), `${time}: Kopieren/Einfügen verändert Töne`);
}
// Ton, der nicht mehr in den Takt passt, rückt weiter
{
  const fr = T.newBlock('free'); fr.notes = [{ pos: [{ s: 0, f: 3 }], dur: 'h' }, { pos: [{ s: 0, f: 5 }], dur: 'q' }, { pos: [{ s: 1, f: 2 }], dur: 'h' }];
  const B = T.computeDoc({ time: '4/4', blocks: [fr] })[0];
  ok(B.measures.length === 2 && B.warn.length === 1 && B.measures[1].events[0].m === T.OPEN[1] + 2, 'Ton rückt in den nächsten Takt');
  const B3 = T.computeDoc({ time: '3/4', blocks: [Object.assign(T.newBlock('free'), { notes: [{ pos: [{ s: 0, f: 3 }], dur: 'w' }] })] })[0];
  ok(B3.measures[0].events[0].dur === 24 && B3.warn.length === 1, 'Ganze im 3/4 wird gekürzt');
}
// Import alter und neuer Formate
{
  const d = T.sanitizeDoc({ name: 'x', time: '7/7', blocks: [{ kind: 'free', notes: [{ s: 1, f: 3, dur: 'q' }, { pos: [{ s: 0, f: 3 }, { s: 0, f: 5 }, { s: 2, f: 30 }], dur: 'zz' }, { rest: true, dur: 'h' }] }] });
  ok(d.time === '4/4', 'Import: ungültige Taktart');
  const n = d.blocks[0].notes;
  ok(n.length === 3 && n[0].pos[0].f === 3 && n[1].pos.length === 1 && !n[1].dur && n[2].dur === 'h', 'Import: Töne bereinigt ' + JSON.stringify(n));
}

// --- Tonart des Stücks ---
{
  const C = { root: 'C', mode: 'major' }, Am = { root: 'A', mode: 'minor' }, Em = { root: 'E', mode: 'minor' };
  ok(T.relativeOf(C).root === 'A' && T.relativeOf(Em).root === 'G', 'Paralleltonart');
  ok(T.chordFit('D', 'm7', C).level === 'fit' && T.chordFit('D', 'm7', C).text.includes('ii7'), 'Dm7 in C ist ii7');
  ok(T.chordFit('E', '7', C).level === 'related' && /Am/.test(T.chordFit('E', '7', C).text), 'E7 in C ist Zwischendominante zu Am');
  ok(T.chordFit('E', '7', Am).level === 'related' && /harmonisch/.test(T.chordFit('E', '7', Am).text), 'E7 in a-Moll: Dominante harmonisch Moll');
  ok(T.chordFit('Eb', 'maj', C).level === 'outside', 'Es-Dur passt nicht zu C-Dur');
  ok(T.chordFit('Gb', 'maj', C).level === 'outside' && T.chordFit('F#', 'dim', C).level === 'outside', 'Enharmonik / fremde Akkorde');
  ok(T.chordFit('Gb', '7', Em).level === 'outside', 'Gb7 in e-Moll nicht als Zwischendominante');
  ok(T.scaleLevel('A', 'minor', 'penta', Em) === 'fit' && T.scaleLevel('E', 'minor', 'blues', Em) === 'related' && T.scaleLevel('E', 'major', 'scale', Em) === 'outside', 'Leitern gegen Tonart');
  // alle leitereigenen Akkorde aller Tonarten passen, Vorschläge mit Stufe „passt“ passen wirklich
  for (const mode of ['major', 'minor']) for (const [root] of T.ROOTS[mode]) {
    const key = { root, mode };
    for (let d = 0; d < 7; d++) for (const sev of [false, true]) { const c = T.diatonicChord(root, mode, d, sev); ok(T.chordFit(c.root, c.quality, key).level === 'fit', `${root} ${mode}: Stufe ${d} passt nicht`); }
    const sugg = T.suggestions(key, { seventh: true, prev: { root, quality: 'maj' } });
    sugg.forEach(sg => {
      const b = sg.make();
      const B = T.computeDoc({ time: '4/4', key, blocks: [b] })[0];
      const f = T.blockFit(B, key);
      ok(f && f.level === sg.level, `Vorschlag ${sg.label} (${root} ${mode}): erwartet ${sg.level}, geprüft ${f && f.level} ${f && f.text}`);
    });
    // nächster Akkord nach V führt zur I bzw. i
    const v = T.diatonicChord(root, mode, 4, false), n = T.nextChords({ root: v.root, quality: v.quality }, key, false);
    ok(n[0] && n[0].deg === 0, `${root} ${mode}: nach V nicht zuerst I`);
  }
  // Akkord erkennen und Akkord vor einer Stelle
  ok(T.identifyChord([45, 52, 57, 60, 64]).name === 'Am', 'Am erkannt');
  ok(T.identifyChord([43, 47, 50, 53]).name === 'G7', 'G7 erkannt');
  const d = { time: '4/4', key: C, blocks: [Object.assign(T.newBlock('chord'), { root: 'G', quality: '7' }), T.newBlock('free')] };
  d.blocks[1].notes = [{ pos: [{ s: 4, f: 1 }] }, { pos: T.chordVoicing('A', 'min', 0) }, { pos: [{ s: 5, f: 0 }] }];
  const comp = T.computeDoc(d);
  ok(T.chordBefore(comp, 1, 0).name === 'G7' && T.chordBefore(comp, 1, 2).name === 'Am' && T.chordBefore(comp, 1, null).name === 'Am', 'Akkord vor der Stelle');
}

// --- Gleiche Töne in anderen Lagen ---
{
  const cases = [[[52], [55], [57], [59], [62], [64]], [[48, 52, 55], [50], [53, 57, 60]], [[40], [45], [50], [55], [59], [64], [76]]];
  for (const groups of cases) for (const span of [4, 5, 6]) {
    const alts = T.altPositions(groups, span);
    ok(alts.length > 1, `Andere Lagen: keine für ${JSON.stringify(groups)}`);
    ok(new Set(alts.map(a => a.key)).size === alts.length, 'Andere Lagen: Dubletten');
    alts.forEach(a => {
      ok(a.pos.length === groups.length, 'Andere Lagen: Anzahl');
      a.pos.forEach((g, i) => {
        ok(g.map(p => T.OPEN[p.s] + p.f).sort((x, y) => x - y).join() === groups[i].slice().sort((x, y) => x - y).join(), 'Andere Lagen: Ton geändert');
        ok(new Set(g.map(p => p.s)).size === g.length, 'Andere Lagen: Saite doppelt');
      });
      a.pos.forEach(g => { const fr = g.map(p => p.f).filter(f => f > 0); ok(!fr.length || Math.max(...fr) - Math.min(...fr) <= 4, 'Andere Lagen: Akkord zu weit gegriffen'); });
      const inLage = o => o.every(p => p.f === 0 || (p.f >= a.w && p.f < a.w + span));
      ok(inLage(a.pos[0]), 'Andere Lagen: erster Ton nicht in der Lage');
      ok(a.shifts === a.pos.filter(o => !inLage(o)).length, 'Andere Lagen: Lagenwechsel falsch gezählt');
    });
  }
}

// --- Guitar-Pro-Import (asynchron wegen Entpacken) ---
require('./gp.js')(T, ok).then(() => {
  console.log(`Prüfungen: ${checks}, Fehler: ${errs.length}`);
  if (errs.length) { console.log([...new Set(errs)].slice(0, 40).join('\n')); process.exit(1); }
});
