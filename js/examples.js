// Beispiel-Folge für den ersten Start
'use strict';
function exampleDoc() {
  const d = newDoc('Beispiel: Blues in E');
  d.bpm = 70;
  const s1 = newBlock('scale', { type: 'penta', mode: 'minor', root: 'E' });
  Object.assign(s1, { fret: 0, dir: 'updown', unit: 'e', title: 'Pentatonik Box 1 und 2', series: { kind: 'positions', items: [3] } });
  const ex = newBlock('exercise', { type: 'penta', mode: 'minor', root: 'E' });
  Object.assign(ex, { fret: 0, section: 'threes' });
  const pr = newBlock('prog', { root: 'E', mode: 'major' });
  Object.assign(pr, { chords: PROG_PRESETS.find(p => p.id === 'blues12').chords.slice(0, 4).map(c => Object.assign({}, c)), fret: 0, length: 1, pattern: 'updown', unit: 'e', title: 'Blues-Akkorde als Arpeggio' });
  pr.chords = [{ deg: 0, q: '7' }, { deg: 3, q: '7' }, { deg: 0, q: '7' }, { deg: 4, q: '7' }];
  const fr = newBlock('free', { type: 'blues', mode: 'minor', root: 'E' });
  fr.title = 'Lick mit Bending und Hammer-on';
  fr.unit = 'e';
  fr.notes = [
    { s: 3, f: 2, tech: { bend: 1, release: true } }, { s: 4, f: 3 }, { s: 4, f: 0, tech: { legato: true } }, { s: 4, f: 3 },
    { s: 3, f: 2 }, { s: 3, f: 0 }, { s: 2, f: 2, tech: { slide: true } }, { s: 2, f: 4 },
    { s: 2, f: 2 }, { s: 1, f: 2 }, { s: 1, f: 0, tech: { legato: true } }, { s: 1, f: 2 },
    { s: 0, f: 0 }, { rest: true }
  ];
  const ar = newBlock('chord');
  Object.assign(ar, { root: 'E', quality: '7', fret: 0, pattern: 'up', range: 'oct1', unit: 'tri8', series: { kind: 'keys', items: ['A', 'B'] } });
  d.blocks = [s1, ex, ar, pr, fr];
  return d;
}
