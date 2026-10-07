// Import: Guitar Pro 3 bis 5 (.gp3, .gp4, .gp5, Binärformat), Guitar Pro 6 (.gpx) und Guitar Pro 7/8 (.gp).
// Ab GP6 stehen die Noten als XML in score.gpif: .gp ist ein ZIP-Archiv, .gpx ein eigenes Containerformat (BCFS),
// meist zusätzlich komprimiert (BCFZ). GP3 bis GP5 sind ein durchgehendes Binärformat.
// Jede Gitarrenspur wird eine Übungsfolge mit einer freien Tonfolge.
'use strict';

// ---------- Container ----------
const GP_TEXT = new TextDecoder('utf-8');
function gpU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function gpU16(b, o) { return b[o] | (b[o + 1] << 8); }
function gpMagic(b, o = 0) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); }

// BCFZ: Bitstrom (höchstwertiges Bit zuerst) aus zwei Blockarten:
//   1, Wortbreite (4 Bit), Abstand, Länge (beide niedrigstes Bit zuerst): Bytes aus dem bereits Entpackten kopieren
//   0, Anzahl (2 Bit, niedrigstes Bit zuerst), so viele Bytes: unverändert übernehmen
// Kopf: „BCFZ“ und die Länge der entpackten Daten.
function gpxDecompress(src) {
  const expected = gpU32(src, 4), out = new Uint8Array(expected);
  let len = 0, pos = 8 * 8;
  const bit = () => { const byte = src[pos >> 3]; if (byte === undefined) throw new Error('Die .gpx-Datei ist unvollständig.'); const v = (byte >> (7 - (pos & 7))) & 1; pos++; return v; };
  const bits = n => { let v = 0; for (let i = n - 1; i >= 0; i--) v |= bit() << i; return v; };
  const bitsRev = n => { let v = 0; for (let i = 0; i < n; i++) v |= bit() << i; return v; };
  while (len < expected) {
    if (bit()) {
      const word = bits(4), offset = bitsRev(word), size = bitsRev(word), from = len - offset;
      if (from < 0) throw new Error('Die .gpx-Datei ist beschädigt.');
      for (let i = 0; i < Math.min(offset, size) && len < expected; i++) out[len++] = out[from + i];
    } else {
      const size = bitsRev(2);
      for (let i = 0; i < size && len < expected; i++) out[len++] = bits(8);
    }
  }
  return out;
}
// BCFS: nach der Kennung Sektoren zu 4096 Byte. Ein Sektor mit Typ 2 ist ein Dateieintrag:
// Name ab Byte 4 (bis 127 Zeichen), Größe bei 0x8C, ab 0x94 die Nummern der Datensektoren (0 beendet die Liste).
function gpxFiles(b) {
  const data = b.subarray(4), SEC = 0x1000, files = {};
  for (let off = SEC; off + SEC <= data.length; off += SEC) {
    if (gpU32(data, off) !== 2) continue;
    let name = '';
    for (let i = 0; i < 127 && data[off + 4 + i]; i++) name += String.fromCharCode(data[off + 4 + i]);
    const size = gpU32(data, off + 0x8C), parts = [];
    for (let p = off + 0x94; p + 4 <= off + SEC; p += 4) {
      const sec = gpU32(data, p); if (!sec) break;
      parts.push(data.subarray(sec * SEC, sec * SEC + SEC));
    }
    const buf = new Uint8Array(parts.length * SEC); parts.forEach((x, i) => buf.set(x, i * SEC));
    files[name] = buf.subarray(0, size);
  }
  return files;
}
// Deflate entpacken mit der eingebauten DecompressionStream (Browser und Node)
async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann komprimierte Dateien nicht entpacken.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
// Eine Datei aus einem ZIP lesen: Ende-Eintrag suchen, Zentralverzeichnis durchgehen, lokalen Kopf überspringen
async function zipFile(b, want) {
  let e = b.length - 22;
  while (e >= 0 && gpU32(b, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Die .gp-Datei ist kein gültiges Archiv.');
  let p = gpU32(b, e + 16);
  for (let i = 0, n = gpU16(b, e + 10); i < n; i++) {
    const method = gpU16(b, p + 10), csize = gpU32(b, p + 20), nl = gpU16(b, p + 28), xl = gpU16(b, p + 30), cl = gpU16(b, p + 32), lho = gpU32(b, p + 42);
    const name = GP_TEXT.decode(b.subarray(p + 46, p + 46 + nl));
    if (want.test(name)) {
      const start = lho + 30 + gpU16(b, lho + 26) + gpU16(b, lho + 28), raw = b.subarray(start, start + csize);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error('Unbekannte Kompression in der .gp-Datei.');
    }
    p += 46 + nl + xl + cl;
  }
  return null;
}
// Liefert den Text von score.gpif; das Format wird an den ersten Bytes erkannt, nicht an der Dateiendung
async function gpifText(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const m = gpMagic(b);
  if (m === 'PK\u0003\u0004') {
    const f = await zipFile(b, /(^|\/)score\.gpif$/i);
    if (!f) throw new Error('In der .gp-Datei fehlt score.gpif.');
    return GP_TEXT.decode(f);
  }
  if (m === 'BCFZ' || m === 'BCFS') {
    const files = gpxFiles(m === 'BCFZ' ? gpxDecompress(b) : b);
    if (!files['score.gpif']) throw new Error('In der .gpx-Datei fehlt score.gpif.');
    return GP_TEXT.decode(files['score.gpif']);
  }
  throw new Error('Keine Guitar-Pro-Datei (.gp, .gpx, .gp3, .gp4 oder .gp5).');
}

// ---------- XML ----------
// Kleiner Parser: Elemente mit Attributen, Text und CDATA. Knoten: {tag, at, kids, text}
function parseXml(src) {
  const root = { tag: '#root', at: {}, kids: [], text: '' }, stack = [root];
  const ent = t => t.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[e] || String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)));
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) stack[stack.length - 1].text += ent(src.slice(i, lt));
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt); stack[stack.length - 1].text += src.slice(lt + 9, e); i = e + 3; continue; }
    if (src.startsWith('<!--', lt)) { i = src.indexOf('-->', lt) + 3; continue; }
    if (src[lt + 1] === '?' || src[lt + 1] === '!') { i = src.indexOf('>', lt) + 1; continue; }
    const gt = src.indexOf('>', lt), body = src.slice(lt + 1, gt);
    i = gt + 1;
    if (body[0] === '/') { if (stack.length > 1) stack.pop(); continue; }
    const self = body.endsWith('/'), m = body.replace(/\/$/, '').match(/^([^\s]+)([\s\S]*)$/);
    const node = { tag: m[1], at: {}, kids: [], text: '' };
    m[2].replace(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (_, k, __, a, b) => { node.at[k] = ent(a != null ? a : b); });
    stack[stack.length - 1].kids.push(node);
    if (!self) stack.push(node);
  }
  return root;
}
// Kurze Helfer zum Navigieren im Baum
const xKid = (n, tag) => n && n.kids.find(k => k.tag === tag);
const xKids = (n, tag) => n ? n.kids.filter(k => k.tag === tag) : [];
const xPath = (n, ...tags) => tags.reduce((a, t) => xKid(a, t), n);
const xText = n => n ? n.text.trim() : '';
function xFind(n, pred) { if (!n) return null; if (pred(n)) return n; for (const k of n.kids) { const r = xFind(k, pred); if (r) return r; } return null; }
const xProp = (n, name) => xKids(xKid(n, 'Properties'), 'Property').find(p => p.at.name === name);
const xIds = t => t.trim() ? t.trim().split(/\s+/).map(Number) : [];

// ---------- Noten ----------
// Notenwerte in Divisions (Viertel = 12, wie im Modell)
const GP_VALUES = { Whole: 48, Half: 24, Quarter: 12, Eighth: 6, '16th': 3, '32nd': 1.5, '64th': 0.75, '128th': 0.375 };
// Länge in Divisions → Ton + Pausen aus vorhandenen Notenwerten
function gpPieces(d) {
  const out = [];
  while (d > 0) { const v = [48, 24, 12, 8, 6, 4, 3, 2, 1].find(x => x <= d); out.push(DUR_KEY[v]); d -= v; }
  return out;
}
// Töne auf Saiten der Standardstimmung legen: wenn möglich auf die Saite aus der Vorlage, sonst den tiefsten freien Bund
// (andere Stimmungen und Kapodaster werden so umgerechnet). items: [{m, s}]
function gpPlace(items) {
  const used = new Set(), pos = [];
  for (const { m, s: s0 } of items.slice().sort((a, b) => a.m - b.m)) {
    let best = null;
    const f0 = m - OPEN[s0];
    if (!used.has(s0) && f0 >= 0 && f0 <= MAX_FRET) best = { s: s0, f: f0 };
    else for (let s = 0; s < 6; s++) { const f = m - OPEN[s]; if (!used.has(s) && f >= 0 && f <= MAX_FRET && (!best || f < best.f)) best = { s, f }; }
    if (best) { used.add(best.s); pos.push(best); }
  }
  return pos;
}

// ---------- Zwischenform ----------
// Beide Lesewege (XML ab GP6, Binärformat GP3 bis GP5) liefern dasselbe:
//   { title, bpm, time: 'n/d', tracks: [{ name, pitches (tiefste Saite zuerst), capo, kind: 'guitar' | 'other' | null,
//     bars: [[{ d (Länge in Divisions), notes: [{ s (0 = tiefste Saite), f, tie, hopo, slide, bend: {semis, release} }] }]] }] }
// kind null heißt: Instrument unbekannt (dann zählt nur die Saitenzahl).

// score.gpif → Zwischenform. Aufbau: MasterBars (Takte mit Taktart und je Spur einer Bar-Nummer) → Bars (Stimmen)
// → Voices (Schläge) → Beats (Rhythmus und Töne) → Notes (Saite, Bund, Techniken), alles über ids verknüpft.
// Saite 0 ist in Guitar Pro die tiefste Saite, wie im Modell.
function gpifToSong(xml) {
  const g = parseXml(xml).kids.find(k => k.tag === 'GPIF');
  if (!g) throw new Error('score.gpif ist kein Guitar-Pro-Dokument.');
  const byId = (list, tag) => { const m = new Map(); xKids(xKid(g, list), tag).forEach(n => m.set(+n.at.id, n)); return m; };
  const bars = byId('Bars', 'Bar'), voices = byId('Voices', 'Voice'), beats = byId('Beats', 'Beat'), notes = byId('Notes', 'Note'), rhythms = byId('Rhythms', 'Rhythm');
  const masters = xKids(xKid(g, 'MasterBars'), 'MasterBar');
  const tempoAuto = xKids(xPath(g, 'MasterTrack', 'Automations'), 'Automation').find(a => xText(xKid(a, 'Type')) === 'Tempo');
  const song = {
    title: xText(xPath(g, 'Score', 'Title')),
    bpm: parseFloat(xText(xKid(tempoAuto, 'Value'))) || 80,
    time: xText(xKid(masters[0], 'Time')) || '4/4',
    tracks: []
  };
  xKids(xKid(g, 'Tracks'), 'Track').forEach((tr, ti) => {
    const tun = xFind(tr, n => n.tag === 'Property' && n.at.name === 'Tuning');
    const capoP = xFind(tr, n => n.tag === 'Property' && n.at.name === 'CapoFret');
    // Instrumenttyp: GP7 InstrumentSet/Type (z. B. „electricGuitar“), GP6 Instrument ref (z. B. „e-gtr6“)
    const type = xText(xPath(tr, 'InstrumentSet', 'Type')) || ((xKid(tr, 'Instrument') || { at: {} }).at.ref || '');
    const track = {
      name: xText(xKid(tr, 'Name')) || `Spur ${ti + 1}`,
      pitches: tun ? xIds(xText(xKid(tun, 'Pitches'))) : [],
      capo: capoP ? +xText(xKid(capoP, 'Fret')) || 0 : 0,
      kind: !type ? null : /guitar|gtr/i.test(type) ? 'guitar' : 'other',
      bars: []
    };
    // Takt für Takt die erste Stimme dieser Spur lesen
    masters.forEach(mb => {
      const bar = bars.get(xIds(xText(xKid(mb, 'Bars')))[ti]);
      const vId = bar ? xIds(xText(xKid(bar, 'Voices'))).find(v => v >= 0) : undefined;
      const voice = vId != null ? voices.get(vId) : null;
      track.bars.push((voice ? xIds(xText(xKid(voice, 'Beats'))) : []).map(bid => beats.get(bid)).filter(Boolean).map(beat => {
        // Länge aus Notenwert, Punktierung und Triole
        const r = rhythms.get(+(xKid(beat, 'Rhythm') || { at: {} }).at.ref);
        let d = GP_VALUES[xText(xKid(r, 'NoteValue'))] || 12;
        const dot = +((xKid(r, 'AugmentationDot') || { at: {} }).at.count || 0);
        if (dot === 1) d *= 1.5; else if (dot >= 2) d *= 1.75;
        const tup = xKid(r, 'PrimaryTuplet'); if (tup && +tup.at.num) d = d * (+tup.at.den) / (+tup.at.num);
        const ns = xIds(xText(xKid(beat, 'Notes'))).map(id => notes.get(id)).filter(Boolean).map(n => ({
          s: +xText(xPath(xProp(n, 'String'), 'String')),
          f: +xText(xPath(xProp(n, 'Fret'), 'Fret')),
          tie: !!(xKid(n, 'Tie') && xKid(n, 'Tie').at.destination === 'true'),
          hopo: !!xProp(n, 'HopoOrigin'),
          slide: !!xProp(n, 'Slide')
        }));
        return { d, notes: ns };
      }));
    });
    song.tracks.push(track);
  });
  return song;
}

// ---------- Guitar Pro 3 bis 5 (Binärformat) ----------
// Aufbau nach PyGuitarPro (github.com/Perlence/PyGuitarPro). Ganzzahlen little-endian, Texte in Windows-1252.
// Das Format hat keine Längenangaben für Abschnitte: jedes Feld muss in der richtigen Reihenfolge gelesen werden,
// auch das, was hier nicht gebraucht wird (Akkordbilder, Mischpult, Effekte).
function gp345ToSong(b) {
  let p = 0;
  const dec = new TextDecoder('windows-1252');
  const fail = what => { throw new Error(`Die Guitar-Pro-Datei ist beschädigt oder hat ein unbekanntes Format (${what}).`); };
  const need = n => { if (p + n > b.length) fail('Dateiende'); };
  const u8 = () => { need(1); return b[p++]; };
  const i8 = () => { const v = u8(); return v > 127 ? v - 256 : v; };
  const i16 = () => { need(2); const v = b[p] | (b[p + 1] << 8); p += 2; return v > 32767 ? v - 65536 : v; };
  const i32 = () => { need(4); const v = b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24); p += 4; return v; };
  const skip = n => { need(n); p += n; };
  // Längenbyte und dann genau count Bytes (Rest ungenutzt)
  const byteStr = count => { const len = u8(); need(count); const s = dec.decode(b.subarray(p, p + Math.min(len, count))); p += count; return s; };
  // Gesamtlänge als Ganzzahl, dann Längenbyte und Text
  const intByteStr = () => { const n = i32(); if (n < 1) return n === 0 ? '' : fail('Text'); return byteStr(n - 1); };
  const intStr = () => { const n = i32(); if (n < 0) fail('Text'); need(n); const s = dec.decode(b.subarray(p, p + n)); p += n; return s; };

  // Kopf: „FICHIER GUITAR PRO v5.10“ → Version 510
  const head = byteStr(30), vm = head.match(/v(\d)\.(\d\d)/);
  if (!/^FICHIER GUITAR PRO/.test(head) || !vm) fail('Kennung');
  const ver = +vm[1] * 100 + +vm[2], v4 = ver >= 400, v5 = ver >= 500, v50 = ver === 500;
  if (ver < 300 || ver >= 600) fail('Version ' + vm[0]);

  const song = { title: '', bpm: 80, time: '4/4', tracks: [] };
  // Angaben zum Stück: Titel, Untertitel, Künstler, Album, Text, (GP5: Musik), Copyright, Tab von, Hinweise, Notizzeilen
  song.title = intByteStr();
  for (let i = 0; i < (v5 ? 8 : 7); i++) intByteStr();
  for (let i = i32(); i > 0; i--) intByteStr();
  if (!v5) u8(); // Triolen-Feeling
  if (v4) { i32(); for (let i = 0; i < 5; i++) { i32(); intStr(); } } // Liedtext: Spur, 5 Zeilen mit Starttakt
  if (v5) {
    if (ver > 500) { i32(); i32(); skip(11); } // RSE-Mastereffekt: Lautstärke, reserviert, Equalizer
    skip(4 * 7 + 2); for (let i = 0; i < 10; i++) intByteStr(); // Seiteneinrichtung: Maße, Ränder, Größe, Kopf-/Fußzeilen
    intByteStr(); // Tempobezeichnung
  }
  song.bpm = i32();
  if (ver > 500) u8(); // Tempo ausblenden
  if (v5) { i8(); i32(); } else if (v4) { i32(); i8(); } else i32(); // Tonart (und Oktave)
  // 64 MIDI-Kanäle: Instrument, 6 Regler, 2 Füllbytes
  const programs = [];
  for (let i = 0; i < 64; i++) { programs.push(i32()); skip(8); }
  if (v5) { skip(19 * 2); i32(); } // Sprungzeichen (Coda, Segno …) und Hall
  const measureCount = i32(), trackCount = i32();
  if (measureCount < 0 || measureCount > 10000 || trackCount < 1 || trackCount > 128) fail('Takt- oder Spurzahl');

  // Taktköpfe: Taktart (sonst wie der vorige), Wiederholungen, Marker, Tonart
  const times = [];
  for (let m = 0; m < measureCount; m++) {
    if (v5 && m > 0) skip(1);
    const fl = u8(), prev = times[m - 1] || [4, 4];
    const num = fl & 0x01 ? i8() : prev[0], den = fl & 0x02 ? i8() : prev[1];
    if (fl & 0x08) i8(); // Wiederholung schließen
    if (!v5 && fl & 0x10) u8(); // Alternatives Ende (GP3/4)
    if (fl & 0x20) { intByteStr(); skip(4); } // Marker mit Farbe
    if (fl & 0x40) { i8(); i8(); } // Tonart
    if (v5) {
      if (fl & 0x10) u8(); // Alternatives Ende (GP5)
      if (fl & 0x03) skip(4); // Balkengruppierung
      if (!(fl & 0x10)) skip(1);
      u8(); // Triolen-Feeling
    }
    times.push([num, den]);
  }
  if (times.length) song.time = times[0][0] + '/' + times[0][1];

  // Spuren: Name, Saiten (Stimmung höchste Saite zuerst), MIDI-Kanal, Bünde, Kapodaster, Farbe, (GP5) Einstellungen
  for (let t = 0; t < trackCount; t++) {
    if (v5 && (t === 0 || v50)) skip(1);
    const fl = u8(), name = byteStr(40), strings = i32();
    const tuning = []; for (let i = 0; i < 7; i++) tuning.push(i32());
    i32(); const channel = i32() - 1; i32(); // Port, Kanal, Effektkanal
    i32(); const capo = i32(); skip(4); // Bünde, Kapodaster, Farbe
    if (v5) {
      i16(); u8(); u8(); u8(); i32(); i32(); i32(); skip(12); // Anzeige, Betonung, Bank, Humanize, Schlüssel, unbekannt
      i32(); i32(); i32(); if (v50) { i16(); skip(1); } else i32(); // RSE-Instrument
      if (ver > 500) { skip(4); intByteStr(); intByteStr(); } // Equalizer, RSE-Effekt
    }
    if (strings < 1 || strings > 7) fail('Saitenzahl');
    // Schlagzeug: Spurflag oder MIDI-Kanal 10; Gitarren haben die General-MIDI-Programme 24 bis 31
    const drums = !!(fl & 0x01) || channel === 9, prog = programs[channel];
    song.tracks.push({
      name: name.trim() || `Spur ${t + 1}`, pitches: tuning.slice(0, strings).reverse(), capo,
      kind: drums ? 'other' : prog >= 24 && prog <= 31 ? 'guitar' : prog >= 0 ? 'other' : null, strings, bars: []
    });
  }
  if (v5) skip(v50 ? 2 : 1);

  // Hilfsleser für Teile, die nur übersprungen werden
  const bend = () => { i8(); i32(); const n = i32(); if (n < 0 || n > 100) fail('Bending'); const pts = []; for (let i = 0; i < n; i++) { const pos = i32(), val = i32(); u8(); pts.push({ pos, val }); } return pts; };
  const chord = () => {
    if (u8()) { // neues Format
      if (v4) { skip(1 + 3); skip(3); i32(); i32(); skip(1); byteStr(22); skip(3); i32(); skip(7 * 4); skip(1 + 15); skip(7); skip(1); skip(7); skip(1); }
      else { skip(1 + 3); i32(); i32(); i32(); i32(); i32(); skip(1); byteStr(22); i32(); i32(); i32(); i32(); skip(6 * 4); i32(); skip(6 * 4); skip(7); skip(1); }
    } else { intByteStr(); if (i32()) skip(6 * 4); } // altes Format: Name, erster Bund, Griff
  };
  const beatEffects = () => {
    if (v4) {
      const f1 = u8(), f2 = u8();
      if (f1 & 0x20) i8(); // Slap/Pop/Tap
      if (f2 & 0x04) bend(); // Vibratohebel
      if (f1 & 0x40) { i8(); i8(); } // Anschlagrichtung
      if (f2 & 0x02) i8(); // Pick-Richtung
    } else {
      const f1 = u8();
      if (f1 & 0x20) { u8(); i32(); } // Slap/Vibratohebel
      if (f1 & 0x40) { i8(); i8(); }
    }
  };
  const mixTable = () => {
    const instrument = i8();
    if (v5) { i32(); i32(); i32(); if (v50) { i16(); skip(1); } else i32(); if (v50) skip(1); }
    const vals = []; for (let i = 0; i < 6; i++) vals.push(i8()); // Lautstärke, Balance, Chorus, Hall, Phaser, Tremolo
    if (v5) intByteStr();
    const tempo = i32();
    vals.forEach(v => { if (v >= 0) i8(); }); // Übergangsdauern
    if (tempo >= 0) { i8(); if (ver > 500) u8(); }
    if (v4) u8(); // gilt für alle Spuren
    if (v5) { i8(); if (ver > 500) { intByteStr(); intByteStr(); } } // Wah, RSE-Effekt
    return instrument;
  };
  const noteEffects = n => {
    if (v4) {
      const f1 = u8(), f2 = u8();
      n.hopo = !!(f1 & 0x02);
      if (f1 & 0x01) n.bendPts = bend();
      if (f1 & 0x10) skip(v5 ? 5 : 4); // Vorschlag
      if (f2 & 0x04) i8(); // Tremolo-Picking
      if (f2 & 0x08) { n.slide = true; u8(); }
      if (f2 & 0x10) { const h = i8(); if (v5) { if (h === 2) skip(3); else if (h === 3) skip(1); } } // Flageolett
      if (f2 & 0x20) { i8(); i8(); } // Triller
    } else {
      const f = u8();
      n.hopo = !!(f & 0x02);
      if (f & 0x01) n.bendPts = bend();
      if (f & 0x10) skip(4);
      if (f & 0x04) n.slide = true; // GP3: Slide ohne weitere Angaben
    }
  };

  // Takte: für jeden Takt nacheinander jede Spur; GP5 hat je Takt zwei Stimmen und ein Zeilenumbruch-Byte
  for (let m = 0; m < measureCount; m++) {
    for (const track of song.tracks) {
      const voicesIn = v5 ? 2 : 1, bar = [];
      for (let v = 0; v < voicesIn; v++) {
        const beats = i32();
        if (beats < 0 || beats > 1000) fail('Schlagzahl');
        for (let k = 0; k < beats; k++) {
          const fl = u8();
          const status = fl & 0x40 ? u8() : 1; // 0 leer, 1 normal, 2 Pause
          // Notenwert: -2 Ganze, -1 Halbe, 0 Viertel, 1 Achtel …; Punktierung, N-tole
          let d = 48 / Math.pow(2, i8() + 2);
          if (fl & 0x01) d *= 1.5;
          if (fl & 0x20) { const tup = i32(); const times = { 3: 2, 5: 4, 6: 4, 7: 4, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8 }[tup]; if (times) d = d * times / tup; }
          if (fl & 0x02) chord();
          if (fl & 0x04) intByteStr(); // Text
          if (fl & 0x08) beatEffects();
          if (fl & 0x10) mixTable();
          // Töne: ein Bit je Saite, Saite 1 (die höchste) ist Bit 6
          const sf = u8(), ns = [];
          for (let str = 1; str <= track.strings; str++) {
            if (!(sf & (1 << (7 - str)))) continue;
            const nf = u8(), n = { s: track.strings - str, f: 0, tie: false, dead: false };
            let type = 1;
            if (nf & 0x20) type = u8(); // 1 normal, 2 Haltebogen, 3 gedämpft
            if (!v5 && nf & 0x01) { i8(); i8(); } // eigene Dauer (GP3/4)
            if (nf & 0x10) i8(); // Dynamik
            if (nf & 0x20) n.f = i8();
            if (nf & 0x80) { i8(); i8(); } // Fingersatz
            if (v5) { if (nf & 0x01) skip(8); u8(); } // Dauer in Prozent, zweite Flags
            if (nf & 0x08) noteEffects(n);
            n.tie = type === 2; n.dead = type === 3;
            ns.push(n);
          }
          if (v5) { const f2 = i16(); if (f2 & 0x0800) u8(); } // Darstellung (Balken, Oktavierung)
          if (v === 0 && status !== 0) bar.push({ d, notes: status === 2 ? [] : ns.filter(n => !n.dead) });
        }
      }
      if (v5 && p < b.length) u8(); // Zeilenumbruch (fehlt manchmal am Dateiende)
      track.bars.push(bar);
    }
  }
  // Bending: höchster Punkt in Vierteltönen (25 Einheiten je Halbton), Release, wenn es am Ende wieder heruntergeht
  song.tracks.forEach(tr => tr.bars.forEach(bar => bar.forEach(bt => bt.notes.forEach(n => {
    if (!n.bendPts || !n.bendPts.length) return;
    const top = Math.max(...n.bendPts.map(x => x.val)), last = n.bendPts[n.bendPts.length - 1].val;
    if (top > 0) n.bend = { semis: top / 25, release: last < top };
    delete n.bendPts;
  }))));
  return song;
}

// ---------- Zwischenform → Übungsfolgen ----------
function songToDocs(song) {
  const title = (song.title || '').trim() || 'Guitar-Pro-Import';
  const bpm = Math.max(30, Math.min(240, Math.round(song.bpm) || 80));
  const time = TIMES.includes(song.time) ? song.time : '4/4';
  const meter = meterOf(time);
  const warn = new Set();
  if (time !== song.time) warn.add(`Taktart ${song.time} gibt es hier nicht, als 4/4 übernommen`);
  // Nur sechssaitige Gitarren; Schlagzeug hat oft Stimmung 0. Sind Instrumente bekannt, zählen nur Gitarren.
  const six = song.tracks.filter(t => t.pitches.length === 6 && t.pitches.every(p => p > 20) && t.kind !== 'other');
  const picked = six.some(t => t.kind === 'guitar') ? six.filter(t => t.kind === 'guitar') : six;
  const names = picked.map(t => t.name);
  const docs = [];
  picked.forEach((track, pi) => {
    const { pitches, capo } = track;
    // Gleichmäßig verstimmt (z. B. Es-Stimmung) oder Kapodaster: Griffe wie notiert übernehmen
    const shift = pitches[0] - OPEN[0], uniform = pitches.every((p, i) => p - OPEN[i] === shift);
    if (uniform && (shift || capo)) warn.add(`${shift ? `Stimmung ${Math.abs(shift)} Halbton${Math.abs(shift) === 1 ? '' : 'e'} ${shift < 0 ? 'tiefer' : 'höher'}` : ''}${shift && capo ? ', ' : ''}${capo ? `Kapodaster im ${capo}. Bund` : ''}: Griffe wie notiert übernommen, klingen hier in Standardstimmung`);
    else if (!uniform) warn.add('andere Stimmung auf Standardstimmung umgerechnet');
    const out = []; let lost = 0;
    track.bars.forEach(bar => {
      let t = 0; const start = out.length;
      bar.forEach(beat => {
        // Start und Ende runden, damit sich keine Fehler aufsummieren; was über den Takt hinausgeht, entfällt
        const a = Math.round(t), e = Math.min(meter.len, Math.round(t + beat.d)); t += beat.d;
        if (e <= a) { if (beat.notes.length) lost++; return; }
        const pieces = gpPieces(e - a);
        // Das Ziel eines Haltebogens klingt nur weiter: Ton auslassen (ohne Haltebögen im Modell wird daraus eine Pause)
        const ns = beat.notes.filter(n => !n.tie && Number.isFinite(n.s) && Number.isFinite(n.f) && pitches[n.s] != null);
        const pos = gpPlace(ns.map(n => ({ m: uniform ? OPEN[n.s] + n.f : pitches[n.s] + capo + n.f, s: n.s })));
        lost += ns.length - pos.length;
        if (!pos.length) { pieces.forEach(p => out.push({ rest: true, dur: p })); return; }
        const n = { pos, dur: pieces[0] };
        // Techniken nur bei Einzeltönen, wie im Editor
        if (pos.length === 1 && ns.length === 1) {
          const x = ns[0], tech = {};
          if (x.bend && x.bend.semis >= 0.75) { tech.bend = x.bend.semis >= 1.5 ? 2 : 1; if (x.bend.release) tech.release = true; }
          if (x.hopo) tech.legato = true; else if (x.slide) tech.slide = true;
          if (Object.keys(tech).length) n.tech = tech;
        }
        out.push(n);
        pieces.slice(1).forEach(p => out.push({ rest: true, dur: p }));
      });
      // Takt auffüllen, damit jeder Takt der Vorlage ein Takt bleibt
      const used = out.slice(start).reduce((s, n) => s + UNITS[n.dur].dur, 0);
      if (used < meter.len) gpPieces(meter.len - used).forEach(p => out.push({ rest: true, dur: p }));
    });
    while (out.length && out[out.length - 1].rest) out.pop();
    if (!out.some(n => !n.rest)) return;
    if (lost) warn.add(`${lost} Töne außerhalb des Griffbretts oder zu kurz, ausgelassen`);
    // gleiche Spurnamen durchnummerieren
    const same = names.filter(n => n === names[pi]).length > 1 ? ` (${names.slice(0, pi + 1).filter(n => n === names[pi]).length})` : '';
    const name = names[pi] + same;
    const d = newDoc(picked.length > 1 ? `${title} – ${name}` : title);
    d.bpm = bpm; d.time = time;
    const b = newBlock('free'); b.ref = null; b.notes = out; b.unit = 'q'; b.title = name;
    d.blocks = [b];
    docs.push(sanitizeDoc(d));
  });
  if (!docs.length) throw new Error('Die Datei enthält keine Gitarrenspur mit sechs Saiten.');
  return { docs, warn: [...warn] };
}
// Einstieg für die Oberfläche: Dateiinhalt → { docs, warn }. Das Format wird an den ersten Bytes erkannt.
function importGuitarPro(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!b.length) return Promise.reject(new Error('Die Datei ist leer.'));
  if (/^FICHIER GUITAR PRO/.test(GP_TEXT.decode(b.subarray(1, 20)))) {
    try { return Promise.resolve(songToDocs(gp345ToSong(b))); } catch (e) { return Promise.reject(e); }
  }
  return gpifText(b).then(gpifToSong).then(songToDocs);
}
