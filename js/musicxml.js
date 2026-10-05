// Export: MusicXML mit Tabulatur (Saite/Bund, Techniken) und ZIP ohne Kompression.
'use strict';

function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function pitchXml(e) {
  const written = e.m + 12; // Gitarre klingt eine Oktave tiefer als notiert
  const oct = Math.floor((written - e.sp.alter) / 12) - 1;
  return `<pitch><step>${LETTERS[e.sp.letter]}</step>${e.sp.alter ? `<alter>${e.sp.alter}</alter>` : ''}<octave>${oct}</octave></pitch>`;
}
// Balken je Schlag: Ebene 1 über alle Achtel und kürzer, Ebene 2/3 über Sechzehntel/32stel
const BEAMS = { eighth: 1, '16th': 2, '32nd': 3 };
function beamInfo(events, beatLen) {
  const res = events.map(() => ({}));
  let pos = 0, beat = [];
  const flush = () => {
    const ns = beat.filter(i => events[i].kind === 'note' && BEAMS[events[i].type]);
    if (ns.length > 1) {
      for (let lv = 1; lv <= 3; lv++) {
        ns.forEach((i, k) => {
          if (BEAMS[events[i].type] < lv) return;
          const prev = k > 0 && BEAMS[events[ns[k - 1]].type] >= lv, next = k < ns.length - 1 && BEAMS[events[ns[k + 1]].type] >= lv;
          if (lv === 1) res[i][1] = k === 0 ? 'begin' : k === ns.length - 1 ? 'end' : 'continue';
          else res[i][lv] = prev && next ? 'continue' : prev ? 'end' : next ? 'begin' : (k === 0 ? 'forward hook' : 'backward hook');
        });
      }
    }
    beat = [];
  };
  events.forEach((e, i) => { if (pos > 0 && pos % beatLen === 0) flush(); beat.push(i); pos += e.dur; });
  flush();
  return res;
}
function toMusicXML(doc, comp) {
  let out = '', first = true, curFifths = null;
  const meter = meterOf(doc.time);
  comp.forEach(B => {
    B.measures.forEach((M, mi) => {
      out += `<measure number="${M.no}">`;
      const key = M.first && M.seg.key ? M.seg.key : null;
      const dk = doc.key || null;
      const fifths = key ? fifthsOf(key.root, key.mode) : (first ? (dk ? fifthsOf(dk.root, dk.mode) : 0) : null);
      if (first) {
        curFifths = fifths;
        out += `<attributes><divisions>${DIV}</divisions><key><fifths>${fifths}</fifths>${key || dk ? `<mode>${(key || dk).mode}</mode>` : ''}</key><time><beats>${meter.beats}</beats><beat-type>${meter.type}</beat-type></time>` +
          `<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef><staff-details><staff-lines>6</staff-lines>` +
          [['E', 2], ['A', 2], ['D', 3], ['G', 3], ['B', 3], ['E', 4]].map((t, i) => `<staff-tuning line="${i + 1}"><tuning-step>${t[0]}</tuning-step><tuning-octave>${t[1]}</tuning-octave></staff-tuning>`).join('') +
          `</staff-details><transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose></attributes>`;
        out += `<direction placement="above"><direction-type><metronome><beat-unit>${meter.compound ? 'quarter' : meter.type === 8 ? 'eighth' : 'quarter'}</beat-unit>${meter.compound ? '<beat-unit-dot/>' : ''}<per-minute>${doc.bpm}</per-minute></metronome></direction-type><sound tempo="${Math.round(doc.bpm * meter.beat / DIV)}"/></direction>`;
        first = false;
      } else if (fifths != null && fifths !== curFifths) {
        curFifths = fifths;
        out += `<attributes><key><fifths>${fifths}</fifths><mode>${key.mode}</mode></key></attributes>`;
      }
      if (mi === 0) out += `<direction placement="above"><direction-type><words font-weight="bold">${xmlEsc(blockTitle(B.block))}</words></direction-type></direction>`;
      if (M.first && M.seg.label) out += `<direction placement="above"><direction-type><words font-style="italic">${xmlEsc(M.seg.label)}</words></direction-type></direction>`;
      const beams = beamInfo(M.events, meter.beat);
      M.events.forEach((e, i) => {
        const tones = e.kind === 'note' ? [e].concat(e.extra || []) : [null];
        tones.forEach((t, ti) => {
          out += '<note>' + (ti > 0 ? '<chord/>' : '') + (t ? pitchXml(t) : '<rest/>') + `<duration>${e.dur}</duration><voice>1</voice><type>${e.type}</type>`;
          if (e.tuplet) out += `<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>`;
          if (t && e.type !== 'whole') out += '<stem>up</stem>';
          if (ti === 0) Object.keys(beams[i]).forEach(lv => { out += `<beam number="${lv}">${beams[i][lv]}</beam>`; });
          let nots = '', tech = '';
          if (ti === 0 && e.tuplet) { if (e.tupStart) nots += '<tuplet type="start" bracket="yes"/>'; if (e.tupStop) nots += '<tuplet type="stop"/>'; }
          if (t) {
            if (ti === 0) {
              if (e.linkIn === 'H' || e.linkIn === 'P') { nots += '<slur type="stop"/>'; tech += e.linkIn === 'H' ? '<hammer-on type="stop"/>' : '<pull-off type="stop"/>'; }
              if (e.linkIn === 'S') nots += '<slide type="stop"/>';
              if (e.link === 'H' || e.link === 'P') { nots += '<slur type="start"/>'; tech += e.link === 'H' ? '<hammer-on type="start">H</hammer-on>' : '<pull-off type="start">P</pull-off>'; }
              if (e.link === 'S') nots += '<slide type="start" line-type="solid"/>';
              if (e.tech && e.tech.bend) tech += `<bend><bend-alter>${e.tech.bend}</bend-alter>${e.tech.release ? '<release/>' : ''}</bend>`;
            }
            tech += `<string>${6 - t.s}</string><fret>${t.f}</fret>`;
            nots += `<technical>${tech}</technical>`;
          }
          if (nots) out += `<notations>${nots}</notations>`;
          out += '</note>';
        });
      });
      const lastOfBlock = mi === B.measures.length - 1;
      const lastOfDoc = lastOfBlock && B === comp[comp.length - 1];
      if (lastOfBlock) out += `<barline location="right"><bar-style>${lastOfDoc ? 'light-heavy' : 'light-light'}</bar-style></barline>`;
      out += '</measure>';
    });
  });
  if (!out) out = `<measure number="1"><attributes><divisions>${DIV}</divisions><time><beats>${meter.beats}</beats><beat-type>${meter.type}</beat-type></time></attributes><note><rest measure="yes"/><duration>${meter.len}</duration></note></measure>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>${xmlEsc(doc.name)}</work-title></work><identification><encoding><software>Tabwerk</software></encoding></identification>` +
    `<part-list><score-part id="P1"><part-name>Gitarre</part-name><score-instrument id="P1-I1"><instrument-name>Guitar</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>26</midi-program></midi-instrument></score-part></part-list>` +
    `<part id="P1">${out}</part></score-partwise>`;
}

const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cSize = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
