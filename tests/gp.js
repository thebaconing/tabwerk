// Prüft den Guitar-Pro-Import (.gp als ZIP, .gpx als BCFS/BCFZ) mit einer selbst gebauten Partitur.
const zlib = require('zlib');
module.exports = async function (T, ok) {
  const prop = (name, inner) => `<Property name="${name}">${inner}</Property>`;
  const note = (id, s, f, extra = '') => `<Note id="${id}">${extra}<Properties>${prop('String', `<String>${s}</String>`)}${prop('Fret', `<Fret>${f}</Fret>`)}</Properties></Note>`;
  const gpif = `<?xml version="1.0" encoding="utf-8"?>
<GPIF><Score><Title><![CDATA[Test & Lied]]></Title></Score>
<MasterTrack><Automations><Automation><Type>Tempo</Type><Value>100 2</Value></Automation></Automations></MasterTrack>
<Tracks>
 <Track id="0"><Name><![CDATA[Gitarre]]></Name><Staves><Staff><Properties>${prop('Tuning', '<Pitches>40 45 50 55 59 64</Pitches>')}</Properties></Staff></Staves></Track>
 <Track id="1"><Name>Drums</Name></Track>
 <Track id="2"><Name>Drop D</Name><Properties>${prop('Tuning', '<Pitches>38 45 50 55 59 64</Pitches>')}</Properties></Track>
</Tracks>
<MasterBars>
 <MasterBar><Time>3/4</Time><Bars>0 1 2</Bars></MasterBar>
 <MasterBar><Time>3/4</Time><Bars>3 4 5</Bars></MasterBar>
</MasterBars>
<Bars><Bar id="0"><Voices>0 -1 -1 -1</Voices></Bar><Bar id="1"><Voices>-1 -1 -1 -1</Voices></Bar><Bar id="2"><Voices>2 -1 -1 -1</Voices></Bar>
 <Bar id="3"><Voices>1 -1 -1 -1</Voices></Bar><Bar id="4"><Voices>-1 -1 -1 -1</Voices></Bar><Bar id="5"><Voices>-1 -1 -1 -1</Voices></Bar></Bars>
<Voices><Voice id="0"><Beats>0 1 2 3</Beats></Voice><Voice id="1"><Beats>4 5</Beats></Voice><Voice id="2"><Beats>6</Beats></Voice></Voices>
<Beats>
 <Beat id="0"><Rhythm ref="0"/><Notes>0</Notes></Beat>
 <Beat id="1"><Rhythm ref="1"/></Beat>
 <Beat id="2"><Rhythm ref="1"/><Notes>1</Notes></Beat>
 <Beat id="3"><Rhythm ref="0"/><Notes>2</Notes></Beat>
 <Beat id="4"><Rhythm ref="2"/><Notes>3 4 5</Notes></Beat>
 <Beat id="5"><Rhythm ref="0"/><Notes>6</Notes></Beat>
 <Beat id="6"><Rhythm ref="3"/><Notes>7</Notes></Beat>
</Beats>
<Notes>${note(0, 1, 3)}${note(1, 2, 2, '')}${note(2, 3, 2, '<Tie origin="true" destination="false"/>')}${note(3, 0, 3)}${note(4, 1, 2)}${note(5, 2, 0)}${note(6, 3, 2, '<Tie origin="false" destination="true"/>')}${note(7, 0, 2)}</Notes>
<Rhythms><Rhythm id="0"><NoteValue>Quarter</NoteValue></Rhythm><Rhythm id="1"><NoteValue>Eighth</NoteValue></Rhythm>
 <Rhythm id="2"><NoteValue>Half</NoteValue></Rhythm><Rhythm id="3"><NoteValue>Quarter</NoteValue><AugmentationDot count="1"/></Rhythm></Rhythms>
</GPIF>`;
  const data = Buffer.from(gpif, 'utf8');

  // .gp: ZIP, einmal gespeichert, einmal komprimiert
  const zip = (method) => {
    const name = Buffer.from('Content/score.gpif'), body = method ? zlib.deflateRawSync(data) : data, crc = zlib.crc32 ? zlib.crc32(data) : 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 42);
    const cdOff = 30 + name.length + body.length, cd = Buffer.concat([ch, name]);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(cdOff, 16);
    return new Uint8Array(Buffer.concat([lh, name, body, cd, end]));
  };
  // .gpx: BCFS mit einem Dateieintrag, dann BCFZ nur aus Literalen
  const SEC = 0x1000, nSec = Math.ceil(data.length / SEC);
  const fs = Buffer.alloc(SEC * (2 + nSec));
  fs.writeUInt32LE(2, SEC); fs.write('score.gpif', SEC + 4, 'latin1'); fs.writeUInt32LE(data.length, SEC + 0x8C);
  for (let i = 0; i < nSec; i++) fs.writeUInt32LE(2 + i, SEC + 0x94 + 4 * i);
  data.copy(fs, 2 * SEC);
  const bcfs = Buffer.concat([Buffer.from('BCFS'), fs]);
  const bitsOut = []; const put = (v, n, rev) => { for (let i = 0; i < n; i++) bitsOut.push(rev ? (v >> i) & 1 : (v >> (n - 1 - i)) & 1); };
  for (let i = 0; i < bcfs.length; i += 3) { const k = Math.min(3, bcfs.length - i); put(0, 1); put(k, 2, true); for (let j = 0; j < k; j++) put(bcfs[i + j], 8); }
  const packed = Buffer.alloc(Math.ceil(bitsOut.length / 8)); bitsOut.forEach((b, i) => { if (b) packed[i >> 3] |= 0x80 >> (i & 7); });
  const head = Buffer.alloc(8); head.write('BCFZ', 0, 'latin1'); head.writeUInt32LE(bcfs.length, 4);
  const gpx = new Uint8Array(Buffer.concat([head, packed]));

  for (const [tag, bytes] of [['gp gespeichert', zip(0)], ['gp komprimiert', zip(8)], ['gpx BCFZ', gpx], ['gpx BCFS', new Uint8Array(bcfs)]]) {
    let r;
    try { r = await T.importGuitarPro(bytes); } catch (e) { ok(false, `GP-Import ${tag}: ${e.message}`); continue; }
    ok(r.docs.length === 2, `GP-Import ${tag}: ${r.docs.length} statt 2 Gitarrenspuren`);
    const d = r.docs[0], n = d.blocks[0].notes;
    ok(d.name === 'Test & Lied – Gitarre' && d.bpm === 100 && d.time === '3/4', `GP-Import ${tag}: Kopfdaten ${d.name} ${d.bpm} ${d.time}`);
    const sig = n.map(x => x.rest ? 'r' + x.dur : x.pos.map(p => p.s + ':' + p.f).join('+') + '/' + x.dur).join(' ');
    // Takt 1: C Viertel, Achtelpause, Achtel, Viertel; Takt 2: Akkord Halbe, Haltebogen-Ziel wird Pause, Pausen am Ende entfallen
    ok(sig === '1:3/q re 2:2/e 3:2/q 0:3+1:2+2:0/h', `GP-Import ${tag}: ${sig}`);
    const comp = T.computeDoc(d);
    ok(comp[0].measures.length === 2 && comp[0].measures.every(M => M.events.reduce((a, e) => a + e.dur, 0) === T.meterOf('3/4').len), `GP-Import ${tag}: Takte`);
    // Drop D: tiefe Saite Bund 2 = E, auf Standardstimmung leere E-Saite; punktierte Viertel = Viertel + Achtelpause (am Ende entfällt sie)
    const dd = r.docs[1].blocks[0].notes.map(x => x.rest ? 'r' + x.dur : x.pos.map(p => p.s + ':' + p.f).join('+') + '/' + x.dur).join(' ');
    ok(dd === '0:0/q' && r.warn.some(w => /Stimmung/.test(w)), 'GP-Import ' + tag + ': Drop D ' + dd);
  }
  let err = '';
  try { await T.importGuitarPro(new Uint8Array([0x18, ...Buffer.from('FICHIER GUITAR PRO v5.00')])); } catch (e) { err = e.message; }
  ok(/gp5/.test(err), 'GP-Import: alte Formate werden erkannt');
};
