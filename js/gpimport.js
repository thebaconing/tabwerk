// Import: Guitar Pro 6 (.gpx) und Guitar Pro 7/8 (.gp). Beide enthalten die Noten als XML (score.gpif):
// .gp ist ein ZIP-Archiv, .gpx ein eigenes Containerformat (BCFS), meist zusätzlich komprimiert (BCFZ).
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
  // .gp3 bis .gp5: Binärformat mit der Kennung „FICHIER GUITAR PRO“
  if (/^FICHIER GUITAR PRO/.test(GP_TEXT.decode(b.subarray(1, 20)))) throw new Error('Ältere Guitar-Pro-Dateien (.gp3, .gp4, .gp5) werden nicht unterstützt. In Guitar Pro als .gp oder MusicXML speichern.');
  throw new Error('Keine Guitar-Pro-Datei (.gp oder .gpx).');
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

// score.gpif → Übungsfolgen. Aufbau: MasterBars (Takte mit Taktart und je Spur einer Bar-Nummer) → Bars (Stimmen)
// → Voices (Schläge) → Beats (Rhythmus und Töne) → Notes (Saite, Bund, Techniken), alles über ids verknüpft.
// Saite 0 ist in Guitar Pro die tiefste Saite, wie im Modell.
function gpifToDocs(xml) {
  const g = parseXml(xml).kids.find(k => k.tag === 'GPIF');
  if (!g) throw new Error('score.gpif ist kein Guitar-Pro-Dokument.');
  const byId = (list, tag) => { const m = new Map(); xKids(xKid(g, list), tag).forEach(n => m.set(+n.at.id, n)); return m; };
  const bars = byId('Bars', 'Bar'), voices = byId('Voices', 'Voice'), beats = byId('Beats', 'Beat'), notes = byId('Notes', 'Note'), rhythms = byId('Rhythms', 'Rhythm');
  const masters = xKids(xKid(g, 'MasterBars'), 'MasterBar');
  const title = xText(xPath(g, 'Score', 'Title')) || 'Guitar-Pro-Import';
  const tempoAuto = xKids(xPath(g, 'MasterTrack', 'Automations'), 'Automation').find(a => xText(xKid(a, 'Type')) === 'Tempo');
  const bpm = Math.max(30, Math.min(240, Math.round(parseFloat(xText(xKid(tempoAuto, 'Value'))) || 80)));
  const time0 = xText(xKid(masters[0], 'Time')) || '4/4';
  const time = TIMES.includes(time0) ? time0 : '4/4';
  const meter = meterOf(time);
  const warn = new Set();
  if (time !== time0) warn.add(`Taktart ${time0} gibt es hier nicht, als 4/4 übernommen`);

  const tracks = xKids(xKid(g, 'Tracks'), 'Track');
  // Nur sechssaitige Gitarren: Instrumenttyp (GP7: InstrumentSet/Type, GP6: Instrument ref wie „e-gtr6“), Schlagzeug hat Stimmung 0
  const info = tracks.map((tr, ti) => {
    const tun = xFind(tr, n => n.tag === 'Property' && n.at.name === 'Tuning');
    const pitches = tun ? xIds(xText(xKid(tun, 'Pitches'))) : [];
    const type = xText(xPath(tr, 'InstrumentSet', 'Type')) || ((xKid(tr, 'Instrument') || { at: {} }).at.ref || '');
    const known = !!type, guitar = /guitar|gtr/i.test(type);
    return { tr, ti, pitches, ok: pitches.length === 6 && pitches.every(p => p > 20), known, guitar };
  }).filter(x => x.ok);
  const picked = info.some(x => x.guitar) ? info.filter(x => x.guitar) : info.filter(x => !x.known);
  const names = picked.map(x => xText(xKid(x.tr, 'Name')) || `Spur ${x.ti + 1}`);
  const docs = [];
  picked.forEach(({ tr, ti, pitches }, pi) => {
    const capoP = xFind(tr, n => n.tag === 'Property' && n.at.name === 'CapoFret');
    const capo = capoP ? +xText(xKid(capoP, 'Fret')) || 0 : 0;
    // Gleichmäßig verstimmt (z. B. Es-Stimmung) oder Kapodaster: Griffe wie notiert übernehmen
    const shift = pitches[0] - OPEN[0], uniform = pitches.every((p, i) => p - OPEN[i] === shift);
    if (uniform && (shift || capo)) warn.add(`${shift ? `Stimmung ${Math.abs(shift)} Halbton${Math.abs(shift) === 1 ? '' : 'e'} ${shift < 0 ? 'tiefer' : 'höher'}` : ''}${shift && capo ? ', ' : ''}${capo ? `Kapodaster im ${capo}. Bund` : ''}: Griffe wie notiert übernommen, klingen hier in Standardstimmung`);
    else if (!uniform) warn.add('andere Stimmung auf Standardstimmung umgerechnet');
    const out = []; let lost = 0;
    // Takt für Takt die erste Stimme dieser Spur lesen
    masters.forEach(mb => {
      const barId = xIds(xText(xKid(mb, 'Bars')))[ti];
      const bar = bars.get(barId);
      const vId = bar ? xIds(xText(xKid(bar, 'Voices'))).find(v => v >= 0) : undefined;
      const voice = vId != null ? voices.get(vId) : null;
      let t = 0; const start = out.length;
      (voice ? xIds(xText(xKid(voice, 'Beats'))) : []).forEach(bid => {
        const beat = beats.get(bid); if (!beat) return;
        // Länge aus Notenwert, Punktierung und Triole; Start und Ende werden gerundet, damit sich keine Fehler aufsummieren
        const r = rhythms.get(+(xKid(beat, 'Rhythm') || { at: {} }).at.ref);
        let d = GP_VALUES[xText(xKid(r, 'NoteValue'))] || 12;
        const dot = +((xKid(r, 'AugmentationDot') || { at: {} }).at.count || 0);
        if (dot === 1) d *= 1.5; else if (dot >= 2) d *= 1.75;
        const tup = xKid(r, 'PrimaryTuplet'); if (tup && +tup.at.num) d = d * (+tup.at.den) / (+tup.at.num);
        const a = Math.round(t), b = Math.min(meter.len, Math.round(t + d)); t += d;
        if (b <= a) { if (xKid(beat, 'Notes')) lost++; return; }
        const pieces = gpPieces(b - a);
        // Das Ziel eines Haltebogens klingt nur weiter: Ton auslassen (ohne Haltebögen im Modell wird daraus eine Pause)
        const ns = xIds(xText(xKid(beat, 'Notes'))).map(id => notes.get(id)).filter(Boolean)
          .filter(n => !(xKid(n, 'Tie') && xKid(n, 'Tie').at.destination === 'true'));
        const midis = ns.map(n => {
          const s = +xText(xPath(xProp(n, 'String'), 'String')), f = +xText(xPath(xProp(n, 'Fret'), 'Fret'));
          return Number.isFinite(s) && Number.isFinite(f) && pitches[s] != null ? { m: uniform ? OPEN[s] + f : pitches[s] + capo + f, s } : null;
        }).filter(Boolean);
        const pos = gpPlace(midis);
        lost += midis.length - pos.length;
        if (!pos.length) { pieces.forEach(p => out.push({ rest: true, dur: p })); return; }
        const n = { pos, dur: pieces[0] };
        // Techniken nur bei Einzeltönen, wie im Editor
        if (pos.length === 1 && ns.length === 1) {
          if (xProp(ns[0], 'HopoOrigin')) n.tech = { legato: true };
          else if (xProp(ns[0], 'Slide')) n.tech = { slide: true };
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
// Einstieg für die Oberfläche: Dateiinhalt → { docs, warn }
function importGuitarPro(bytes) { return gpifText(bytes).then(gpifToDocs); }
