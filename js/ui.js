// Oberfläche: Bibliothek, Bausteinliste, Einstellungen, Tabulatur, Eingabe, Wiedergabe, Export.
'use strict';
(() => {
const $ = id => document.getElementById(id);
const LS_KEY = 'tabwerk-v1', PREF_KEY = 'tabwerk-prefs';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};

// ---------- Zustand ----------
let lib = store.get(LS_KEY);
if (!lib || !Array.isArray(lib.docs) || !lib.docs.length) {
  const ex = exampleDoc();
  lib = { docs: [ex], currentId: ex.id };
} else {
  lib.docs = lib.docs.map(d => { try { return sanitizeDoc(d); } catch (e) { return null; } }).filter(Boolean);
  if (!lib.docs.length) { const ex = exampleDoc(); lib.docs = [ex]; lib.currentId = ex.id; }
}
let doc = lib.docs.find(d => d.id === lib.currentId) || lib.docs[0];
lib.currentId = doc.id;
let comp = [];
let sel = { bi: doc.blocks.length ? 0 : null, fi: null, fi2: null, k: null, k2: null };
let hist = { undo: [], redo: [], last: null };
const ui = { mode: 'after', dur: null, markStart: null, libConfirm: null, userScrollUntil: 0, multi: new Set(), chord: { root: 'A', q: 'min', fret: 0 }, clip: store.get('tabwerk-clip') };
const prefs = Object.assign({ countin: true, metro: true, loop: false, follow: true, theme: null, keyFilter: 'first', sugTab: 'scale', sugSeventh: false, sugAs: 'power', view: 'edit', altSpan: 5 }, store.get(PREF_KEY) || {});
if (prefs.theme && !document.documentElement.hasAttribute('data-theme')) document.documentElement.setAttribute('data-theme', prefs.theme);

let saveT = 0;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => { if (!store.set(LS_KEY, lib)) status('Speichern im Browser nicht möglich. Bitte über „Datei“ sichern.'); }, 250); }
function savePrefs() { store.set(PREF_KEY, prefs); }
function status(t) { $('status').textContent = t || ''; }
const cur = () => sel.bi != null ? doc.blocks[sel.bi] : null;

// Änderung mit Rückgängig-Verlauf
function commit(fn, o = {}) {
  const before = JSON.stringify(doc);
  fn(doc);
  if (JSON.stringify(doc) === before) return false;
  if (!(o.coalesce && o.coalesce === hist.last)) { hist.undo.push(before); if (hist.undo.length > 150) hist.undo.shift(); }
  hist.last = o.coalesce || null; hist.redo = [];
  doc.updated = Date.now();
  refresh(o);
  return true;
}
function restore(json) {
  const fresh = JSON.parse(json);
  Object.keys(doc).forEach(k => delete doc[k]);
  Object.assign(doc, fresh);
  if (sel.bi != null && sel.bi >= doc.blocks.length) sel.bi = doc.blocks.length ? doc.blocks.length - 1 : null;
  clearSel(); hist.last = null; ui.markStart = null;
  refresh();
}
function undo() { if (!hist.undo.length) return; hist.redo.push(JSON.stringify(doc)); restore(hist.undo.pop()); status('Rückgängig gemacht.'); }
function redo() { if (!hist.redo.length) return; hist.undo.push(JSON.stringify(doc)); restore(hist.redo.pop()); status('Wiederhergestellt.'); }

function refresh(o = {}) {
  comp = computeDoc(doc);
  if (sel.bi != null && sel.fi != null) {
    const evs = comp[sel.bi] ? comp[sel.bi].measures.flatMap(m => m.events) : [];
    const e = evs.find(x => x.fi === sel.fi);
    sel.k = e ? e.k : null;
    if (!e) { sel.fi = null; sel.fi2 = null; sel.k2 = null; }
    if (e && sel.fi2 != null) { const e2 = evs.find(x => x.fi === sel.fi2); sel.k2 = e2 ? e2.k : null; if (!e2) sel.fi2 = null; }
  }
  if (sel.k != null && !evByK(sel.k)) clearSel();
  updateSelBar();
  if (!o.skipName) $('docName').value = doc.name;
  renderBlocks();
  if (!o.skipInsp) renderInspector();
  renderSheet();
  $('undo').disabled = !hist.undo.length; $('redo').disabled = !hist.redo.length;
  renderKeyBar(); renderSugg(); renderView();
  $('bpm').value = doc.bpm; $('bpmOut').value = doc.bpm;
  $('docTime').value = doc.time || '4/4'; $('bpmLabel').textContent = meterOf(doc.time).compound ? '♩. =' : meterOf(doc.time).type === 8 ? '♪ =' : '♩ =';
  saveSoon();
}

// ---------- Hilfen ----------
const h = escHtml;
function segHTML(key, opts, val, extra = '') {
  return `<div class="seg" data-seg="${key}" ${extra}>` + opts.map(([v, l, dis]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(val)}"${dis ? ' disabled' : ''}>${l}</button>`).join('') + '</div>';
}
function selHTML(key, opts, val, id) {
  return `<select data-field="${key}" id="${id || 'f-' + key}">` + opts.map(([v, l]) => `<option value="${h(v)}"${String(v) === String(val) ? ' selected' : ''}>${h(l)}</option>`).join('') + '</select>';
}
function ctl(label, inner, cls = '') { return `<div class="ctl ${cls}"><span class="label">${label}</span>${inner}</div>`; }
function rootOpts(mode) { return ROOTS[mode].map(([r, f]) => [r, `${keyName(r, mode)} (${f === 0 ? 'ohne' : Math.abs(f) + (f > 0 ? ' ♯' : ' ♭')})`]); }
function relRoot(root, from, to) {
  const f = (ROOTS[from].find(x => x[0] === root) || [0, 0])[1];
  return (ROOTS[to].find(x => x[1] === f) || ROOTS[to][0])[0];
}
function unitOpts(withDefault) { return (withDefault ? [['', 'Standard des Musters']] : []).concat(GEN_UNITS.map(k => [k, UNITS[k].label])); }
function fmtDate(t) { const d = new Date(t); return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
function slug(t) { return (t || 'tabwerk').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'tabwerk'; }
// ---------- Tonart des Stücks ----------
const LEV_ORDER = { fit: 0, related: 1, outside: 2 };
function onlyFit() { return !!doc.key && prefs.keyFilter === 'only'; }
// Auswahllisten: Passendes zuerst und markiert, bei „Nur passende“ Unpassendes ausblenden (aktueller Wert bleibt)
function markOpts(opts, levelOf, curVal) {
  if (!doc.key) return opts;
  let list = opts.map(([v, l]) => ({ v, l, lev: levelOf(v) || 'fit' }));
  list = list.map((x, i) => Object.assign(x, { i })).sort((a, c) => LEV_ORDER[a.lev] - LEV_ORDER[c.lev] || a.i - c.i);
  if (onlyFit()) list = list.filter(x => x.lev !== 'outside' || String(x.v) === String(curVal));
  return list.map(x => [x.v, x.l + (x.lev === 'fit' ? ' ✓' : x.lev === 'related' ? ' (verwandt)' : ' (passt nicht)')]);
}
function fitPill(f) { return f ? `<span class="fit fit-${f.level}" title="${h(f.text)}">${LEVEL_TEXT[f.level]}</span>` : ''; }
function keyOptsHTML() {
  const o = ['<option value="">keine</option>'];
  ['major', 'minor'].forEach(m => { o.push(`<optgroup label="${m === 'major' ? 'Dur' : 'Moll'}">`); ROOTS[m].slice().sort((a, c) => a[1] - c[1]).forEach(([r]) => o.push(`<option value="${r}|${m}">${h(keyName(r, m))}</option>`)); o.push('</optgroup>'); });
  return o.join('');
}
function renderKeyBar() {
  const sel2 = $('docKey');
  if (!sel2.options.length) sel2.innerHTML = keyOptsHTML();
  sel2.value = doc.key ? `${doc.key.root}|${doc.key.mode}` : '';
  $('keyFilter').hidden = !doc.key;
  $('keyFilter').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === prefs.keyFilter)));
}
function renderSugg() {
  const el = $('sugg');
  if (!doc.key) { el.innerHTML = '<p class="hint small">Tonart oben wählen, dann erscheinen hier passende Skalen, Akkorde und Akkordfolgen.</p>'; $('addLabel').textContent = 'Hinzufügen'; return; }
  $('addLabel').textContent = onlyFit() ? `Frei hinzufügen (startet in ${keyLabel(doc.key)})` : 'Frei hinzufügen';
  const prev = chordBefore(comp, sel.bi == null ? comp.length - 1 : sel.bi, null);
  const all = suggestions(doc.key, { seventh: prefs.sugSeventh, prev });
  const tabs = [['next', 'Nächster Akkord'], ['scale', 'Skalen & Übungen'], ['chord', 'Akkorde'], ['prog', 'Folgen']];
  if (prefs.sugTab === 'next' && !prev) prefs.sugTab = 'chord';
  let items = all.filter(x => x.group === prefs.sugTab).map((x, i) => Object.assign(x, { idx: all.indexOf(x) }));
  items.sort((a, c) => LEV_ORDER[a.level] - LEV_ORDER[c.level]);
  if (onlyFit()) items = items.filter(x => x.level !== 'outside');
  ui.sugAll = all;
  const nextNote = prefs.sugTab === 'next' ? (prev ? `<p class="hint small">Nach ${h(prev.name)} (Baustein ${prev.from + 1}) in ${h(keyLabel(doc.key))}, übliche Fortsetzungen zuerst.</p>` : '<p class="hint small">Noch kein Akkord davor. Erst einen Akkord oder eine Akkordfolge einfügen.</p>') : '';
  el.innerHTML = `<span class="label">Vorschläge für ${h(keyLabel(doc.key))}</span>
    ${segHTML('sugTab', tabs.map(([v, l]) => [v, l, v === 'next' && !prev]), prefs.sugTab)}
    ${['chord', 'prog', 'next'].includes(prefs.sugTab) ? segHTML('sugSeventh', [['false', 'Dreiklänge'], ['true', 'Vierklänge']], String(prefs.sugSeventh)) + segHTML('sugAs', [['power', 'Powerchord'], ['chord', 'voller Akkord'], ['arp', 'Arpeggio']], prefs.sugAs) : ''}
    ${nextNote}
    <div class="sugg-list">${items.map(x => `<div class="sug-row"><button type="button" class="btn sug lev-${x.level}" data-sug="${x.idx}" title="Einfügen"><b>${h(x.label)}</b><small>${h(x.sub)}</small>${fitPill({ level: x.level, text: x.sub })}</button><button type="button" class="btn prev-btn" data-prev="${x.idx}" aria-label="Vorschau ${h(x.label)}" title="Vorschau anhören, ohne einzufügen" aria-pressed="${ui.previewIdx === x.idx}">${ui.previewIdx === x.idx ? '■' : '▶'}</button></div>`).join('') || '<span class="hint small">Keine Vorschläge.</span>'}</div>
    <p class="hint small">▶ spielt den Vorschlag so, wie er eingefügt würde, mit dem Takt davor. Klick auf den Namen fügt ihn ein.</p>`;
}
// Einfügen eines Vorschlags planen (ohne etwas zu ändern), damit Vorschau und Einfügen gleich sind
function gripsFor(chords, power) {
  let ref = lastToneBefore();
  return chords.map(c => {
    const f = chordFretNear(c.root, power ? '5' : c.quality, ref), pos = power ? powerVoicing(c.root, c.quality, f) : chordVoicing(c.root, c.quality, f);
    if (pos.length) ref = { s: pos[0].s, f: pos[0].f };
    return { c, pos, name: power ? powerName(c.root, c.quality) : chordName(c.root, c.quality) };
  }).filter(g => g.pos.length > 1);
}
function planInsertion(sug) {
  const nb = sug.make();
  const at = sel.bi == null ? doc.blocks.length : sel.bi + 1;
  if (prefs.sugAs !== 'arp' && (nb.kind === 'chord' || nb.kind === 'prog')) {
    const chords = nb.kind === 'chord' ? [{ root: nb.root, quality: nb.quality }] : progChords(nb).map(c => ({ root: c.root, quality: c.quality }));
    const power = prefs.sugAs === 'power', grips = gripsFor(chords, power);
    if (!grips.length) return null;
    const meta = g => ({ root: g.c.root, quality: g.c.quality, power });
    const b = cur();
    if (b && b.kind === 'free') {
      const r = freeRange(), pos = r ? r[1] + 1 : b.notes.length, d0 = ui.dur || barPieces(meterOf(doc.time).len)[0];
      return { mode: 'into', bi: sel.bi, pos, notes: grips.map(g => ({ pos: g.pos, dur: d0, chord: meta(g) })), grips, power };
    }
    const blk = newBlock('free', doc.key ? { type: 'scale', root: doc.key.root, mode: doc.key.mode } : undefined);
    if (!doc.key) blk.ref = null;
    const pieces = barPieces(meterOf(doc.time).len);
    blk.notes = grips.flatMap(g => pieces.map(d => ({ pos: clone(g.pos), dur: d, chord: meta(g) })));
    blk.title = chords.length === 1 ? `${grips[0].name}${power ? ' (für ' + chordName(chords[0].root, chords[0].quality) + ')' : ''}` : `${sug.label} (${power ? 'Powerchords' : 'Akkorde'})`;
    return { mode: 'block', at, block: blk, grips, power };
  }
  return { mode: 'block', at, block: nb };
}
function applyPlan(d, plan) {
  if (plan.mode === 'into') d.blocks[plan.bi].notes.splice(plan.pos, 0, ...clone(plan.notes));
  else d.blocks.splice(plan.at, 0, clone(plan.block));
}
function insertSuggestion(sug) {
  const plan = planInsertion(sug);
  if (!plan) { status('Für diesen Akkord gibt es keinen Griff.'); return; }
  if (plan.mode === 'into') { sel.fi = plan.pos + plan.notes.length - 1; sel.fi2 = plan.notes.length > 1 ? plan.pos : null; sel.k2 = null; }
  commit(d => applyPlan(d, plan));
  if (plan.mode === 'block') { sel = { bi: plan.at, fi: null, fi2: null, k: null, k2: null }; refresh(); }
  if (plan.grips) {
    plan.grips[0].pos.forEach((p, i) => setTimeout(() => Player.preview(OPEN[p.s] + p.f), i * 25));
    status(`${plan.grips.map(g => g.name + ' (' + g.pos.map(p => STR_NAMES[p.s] + p.f).join(' ') + ')').join(', ')} eingefügt.` + (plan.power ? ' Später erweitern: Akkord anklicken, dann „Zum vollen Akkord“.' : ' Akkord auswählen und „Als Arpeggio auflösen“, um ihn in Einzeltöne zu zerlegen.'));
  } else status(`${sug.label} hinzugefügt (${sug.sub}).`);
}
// Vorschau: so klingt es eingefügt, mit dem Takt davor als Übergang
async function previewSuggestion(idx) {
  if (ui.previewIdx === idx && Player.isPlaying()) { Player.stop(); return; }
  const sug = ui.sugAll[idx]; if (!sug) return;
  const plan = planInsertion(sug); if (!plan) { status('Für diesen Akkord gibt es keinen Griff.'); return; }
  const tmp = clone(doc); applyPlan(tmp, plan);
  const tc = computeDoc(tmp);
  let nos = [];
  if (plan.mode === 'block') nos = tc[plan.at].measures.map(m => m.no);
  else tc[plan.bi].measures.forEach(m => { if (m.events.some(e => e.fi != null && e.fi >= plan.pos && e.fi < plan.pos + plan.notes.length)) nos.push(m.no); });
  if (!nos.length) return;
  const range = { from: Math.max(1, Math.min(...nos) - 1), to: Math.max(...nos) };
  setPlayUi(false);
  ui.previewIdx = idx; renderSugg();
  try {
    await Player.start(tc, null, {
      bpm: () => doc.bpm, countIn: () => false, loop: () => false, metronome: () => false, range,
      onNote: () => {}, onStop: () => { ui.previewIdx = null; renderSugg(); status(''); }
    });
    status(`Vorschau: ${plan.grips ? plan.grips.map(g => g.name).join(', ') + (plan.power ? ' als Powerchord' + (plan.grips.length > 1 ? 's' : '') : '') : sug.label}` + (range.from < Math.min(...nos) ? ', mit dem Takt davor.' : '.') + ' Noch nichts eingefügt.');
  } catch (err) { ui.previewIdx = null; renderSugg(); status(err.message); }
}
$('sugg').addEventListener('click', e => {
  const sb = e.target.closest('.seg button');
  if (sb) { const k = sb.parentElement.dataset.seg; if (k === 'sugTab') prefs.sugTab = sb.dataset.v; if (k === 'sugSeventh') prefs.sugSeventh = sb.dataset.v === 'true'; if (k === 'sugAs') prefs.sugAs = sb.dataset.v; savePrefs(); renderSugg(); return; }
  const pv = e.target.closest('[data-prev]'); if (pv) { previewSuggestion(+pv.dataset.prev); return; }
  const it = e.target.closest('[data-sug]'); if (!it) return;
  const sug = ui.sugAll[+it.dataset.sug]; if (!sug) return;
  if (ui.previewIdx != null) Player.stop();
  insertSuggestion(sug);
});
$('docKey').addEventListener('change', e => {
  const v = e.target.value;
  commit(d => { d.key = v ? { root: v.split('|')[0], mode: v.split('|')[1] } : null; });
  status(v ? `Tonart ${keyLabel(doc.key)}: Bausteine werden geprüft, leiterfremde Töne markiert.` : 'Keine Tonart gesetzt.');
});
$('keyFilter').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; prefs.keyFilter = b.dataset.v; savePrefs(); refresh(); });

function clearSel() { sel.fi = null; sel.fi2 = null; sel.k = null; sel.k2 = null; }
function evByK(k) { for (const B of comp) for (const M of B.measures) for (const e of M.events) if (e.k === k) return { B, e }; return null; }
function noteLabel(e) { return `${STR_NAMES[e.s]}-Saite, Bund ${e.f} (${deNote(e.sp.letter, e.sp.alter)})`; }

// ---------- Bausteinliste ----------
function blockMeta(B) {
  const b = B.block, u = b.kind === 'exercise' && !b.unit ? UNITS[SECTIONS.find(s => s.id === b.section).unit] : UNITS[b.unit];
  const parts = [u.label, `${B.measures.length} ${B.measures.length === 1 ? 'Takt' : 'Takte'}`];
  if (b.series && b.series.kind !== 'none' && b.series.items.length) parts.push(`Reihe: ${{ keys: 'Tonarten', positions: 'Lagen', octaves: 'Oktaven' }[b.series.kind]} ×${b.series.items.length + 1}`);
  return parts;
}
function renderBlocks() {
  const ol = $('blocks');
  $('blockCount').textContent = doc.blocks.length ? `${doc.blocks.length}` : '';
  if (!doc.blocks.length) { ol.innerHTML = '<li class="empty">Noch keine Bausteine. Füge unten den ersten hinzu.</li>'; return; }
  ol.innerHTML = comp.map((B, i) => `<li class="blk${i === sel.bi ? ' sel' : ''}${ui.multi.has(B.block.id) ? ' multi' : ''}" data-bi="${i}" draggable="true" tabindex="0" aria-label="Baustein ${i + 1}: ${h(blockTitle(B.block))}">
    <span class="handle" title="Ziehen zum Verschieben" aria-hidden="true">⋮⋮</span>
    <div class="blk-main"><div class="kind">${i + 1} · ${KINDS[B.block.kind]}</div><div class="blk-title">${h(blockTitle(B.block))}</div><div class="blk-meta">${blockMeta(B).map(x => `<span>${h(x)}</span>`).join('')}${fitPill(blockFit(B, doc.key))}</div></div>
    <div class="blk-tools">
      <button class="btn ghost" data-act="up" title="Nach oben" aria-label="Nach oben"${i === 0 ? ' disabled' : ''}>↑</button>
      <button class="btn ghost" data-act="down" title="Nach unten" aria-label="Nach unten"${i === doc.blocks.length - 1 ? ' disabled' : ''}>↓</button>
      <button class="btn ghost" data-act="dup" title="Kopieren" aria-label="Kopieren">⧉</button>
      <button class="btn ghost danger" data-act="del" title="Löschen" aria-label="Löschen">✕</button>
    </div></li>`).join('');
}
function renderMulti() {
  const n = ui.multi.size, bar = $('multiBar');
  bar.hidden = n < 2;
  if (n >= 2) bar.innerHTML = `<span>${n} Bausteine markiert</span><button class="btn sm primary" data-multi="merge">Zu einer Tonfolge zusammenführen</button><button class="btn sm" data-multi="clear">Markierung aufheben</button>`;
}
function selectBlock(i, scroll) {
  if (sel.bi === i) return;
  sel = { bi: i, fi: null, fi2: null, k: null, k2: null }; ui.markStart = null;
  renderBlocks(); renderInspector(); markSheetSel(); renderSugg();
  if (scroll) { const el = document.querySelector(`.tb[data-bi="${i}"]`); if (el) el.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); }
}
function moveBlock(from, to) {
  if (to < 0 || to >= doc.blocks.length || from === to) return;
  commit(d => { const [b] = d.blocks.splice(from, 1); d.blocks.splice(to, 0, b); });
  sel.bi = to; clearSel(); refresh();
}
$('blocks').addEventListener('click', e => {
  const li = e.target.closest('.blk'); if (!li) return;
  const i = +li.dataset.bi, act = e.target.closest('[data-act]');
  if (!act && (e.ctrlKey || e.metaKey || e.shiftKey)) {
    if (!ui.multi.size && sel.bi != null) ui.multi.add(doc.blocks[sel.bi].id);
    if (e.shiftKey && sel.bi != null) { const [a, c] = [Math.min(sel.bi, i), Math.max(sel.bi, i)]; for (let x = a; x <= c; x++) ui.multi.add(doc.blocks[x].id); }
    else { const id = doc.blocks[i].id; ui.multi.has(id) ? ui.multi.delete(id) : ui.multi.add(id); }
    renderBlocks(); renderMulti();
    return;
  }
  if (!act) {
    if (ui.multi.size) { ui.multi.clear(); renderMulti(); }
    const narrow = innerWidth < 980;
    selectBlock(i, !narrow);
    if (narrow) $('inspector').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    return;
  }
  const a = act.dataset.act;
  if (a === 'up') moveBlock(i, i - 1);
  else if (a === 'down') moveBlock(i, i + 1);
  else if (a === 'dup') { commit(d => { const c = JSON.parse(JSON.stringify(d.blocks[i])); c.id = uid(); d.blocks.splice(i + 1, 0, c); }); sel = { bi: i + 1, fi: null, fi2: null, k: null, k2: null }; refresh(); status('Baustein kopiert.'); }
  else if (a === 'del') { const t = blockTitle(doc.blocks[i]); ui.multi.delete(doc.blocks[i].id); commit(d => d.blocks.splice(i, 1)); sel = { bi: doc.blocks.length ? Math.min(i, doc.blocks.length - 1) : null, fi: null, fi2: null, k: null, k2: null }; refresh(); renderMulti(); status(`„${t}“ gelöscht. Rückgängig mit Strg+Z.`); }
});
$('multiBar').addEventListener('click', e => {
  const b = e.target.closest('[data-multi]'); if (!b) return;
  if (b.dataset.multi === 'clear') { ui.multi.clear(); renderBlocks(); renderMulti(); return; }
  const idx = doc.blocks.map((x, i) => ui.multi.has(x.id) ? i : -1).filter(i => i >= 0);
  if (idx.length < 2) return;
  const meter = meterOf(doc.time);
  const merged = mergeBlocks(idx.map(i => doc.blocks[i]), meter);
  commit(d => { for (let k = idx.length - 1; k >= 0; k--) d.blocks.splice(idx[k], 1); d.blocks.splice(idx[0], 0, merged); });
  ui.multi.clear(); renderMulti();
  sel = { bi: idx[0], fi: null, fi2: null, k: null, k2: null }; refresh();
  status(`${idx.length} Bausteine zu einer freien Tonfolge zusammengeführt. Rückgängig mit Strg+Z.`);
});
$('blocks').addEventListener('keydown', e => {
  const li = e.target.closest('.blk'); if (!li || e.target !== li) return;
  const i = +li.dataset.bi;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBlock(i, true); }
  if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveBlock(i, i - 1); focusBlock(i - 1); }
  if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveBlock(i, i + 1); focusBlock(i + 1); }
});
function focusBlock(i) { const el = document.querySelector(`.blk[data-bi="${i}"]`); if (el) el.focus(); }
// Ziehen und Ablegen
let dragFrom = null;
$('blocks').addEventListener('dragstart', e => { const li = e.target.closest('.blk'); if (!li) return; dragFrom = +li.dataset.bi; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (x) {} });
$('blocks').addEventListener('dragend', () => { dragFrom = null; document.querySelectorAll('.blk').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after')); });
$('blocks').addEventListener('dragover', e => {
  if (dragFrom == null) return; const li = e.target.closest('.blk'); if (!li) return;
  e.preventDefault();
  const r = li.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
  document.querySelectorAll('.blk').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  li.classList.add(after ? 'drop-after' : 'drop-before');
});
$('blocks').addEventListener('drop', e => {
  if (dragFrom == null) return; const li = e.target.closest('.blk'); if (!li) return;
  e.preventDefault();
  const r = li.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
  let to = +li.dataset.bi + (after ? 1 : 0); if (to > dragFrom) to--;
  const from = dragFrom; dragFrom = null;
  moveBlock(from, to);
});
$('addGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-kind]'); if (!b) return;
  const prev = cur();
  const like = prev && (prev.type || prev.ref) ? { type: prev.type || (prev.ref && prev.ref.type), mode: prev.mode || (prev.ref && prev.ref.mode), root: prev.root && ROOTS[prev.mode || 'minor'] ? prev.root : (prev.ref && prev.ref.root) } : null;
  let nb;
  if (onlyFit()) {
    const K = { type: 'scale', root: doc.key.root, mode: doc.key.mode };
    nb = newBlock(b.dataset.kind, K);
    if (nb.kind === 'chord') { const c = diatonicChord(K.root, K.mode, 0, false); Object.assign(nb, { root: c.root, quality: c.quality, fret: bestChordFret(c.root, c.quality) }); }
    if (nb.kind === 'prog') nb.mode = K.mode;
  } else nb = newBlock(b.dataset.kind, like && like.mode && ROOTS[like.mode].some(r => r[0] === like.root) ? like : null);
  const at = sel.bi == null ? doc.blocks.length : sel.bi + 1;
  commit(d => d.blocks.splice(at, 0, nb));
  sel = { bi: at, fi: null, fi2: null, k: null, k2: null }; refresh();
  status(`${KINDS[nb.kind]} hinzugefügt.` + (nb.kind === 'free' ? ' Töne per Klick aufs Griffbrett eingeben.' : ''));
  const ins = $('inspector'); if (ins.getBoundingClientRect().top < 0 || ins.getBoundingClientRect().top > innerHeight * .6) ins.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
});

// ---------- Einstellungen ----------
function renderInspector() {
  const el = $('inspector'), b = cur();
  if (!b) { el.innerHTML = '<div class="empty">Wähle links einen Baustein aus oder füge einen neuen hinzu. Jeder Baustein beginnt in der Tabulatur auf einem neuen Takt.</div>'; return; }
  const B = comp[sel.bi];
  let html = `<div class="insp-head"><span class="kind">${KINDS[b.kind]}</span><input type="text" class="title-in" id="f-title" placeholder="${h(blockTitle(Object.assign({}, b, { title: '' })))}" value="${h(b.title || '')}" aria-label="Titel des Bausteins" maxlength="80"></div>`;
  if (B.err) html += `<div class="warn">Dieser Baustein lässt sich nicht berechnen: ${h(B.err)}</div>`;
  if (B.warn.length) html += `<div class="warn">${B.warn.map(h).join('<br>')}</div>`;
  const fit = blockFit(B, doc.key);
  if (fit) html += `<div class="fit-line">${fitPill(fit)}<span>${h(fit.text)}</span></div>`;
  const kindHTML = { exercise: inspExercise, scale: inspScale, chord: inspChord, prog: inspProg, free: inspFree }[b.kind](b, B);
  html += kindHTML;
  html += inspSeries(b);
  el.innerHTML = html;
}
function keyControls(b) {
  return ctl('Leiter', segHTML('type', [['scale', 'Tonleiter'], ['penta', 'Pentatonik'], ['blues', 'Blues']], b.type)) +
    ctl('Tongeschlecht', segHTML('mode', [['minor', 'Moll'], ['major', 'Dur']], b.mode)) +
    ctl('Grundton', selHTML('root', markOpts(rootOpts(b.mode), r => scaleLevel(r, b.mode, b.type, doc.key), b.root), b.root)) +
    ctl('Fingersatz', segHTML('system', [['pos', 'Lage'], ['nps', b.type === 'scale' ? '3 pro Saite' : b.type === 'penta' ? 'Boxen' : 'Boxen + Blue Note']], b.system));
}
function shapeOpts(b) {
  const { set, shapes } = blockShape(b), best = bestShape(shapes).f;
  return shapes.map(s => {
    const fs = s.notes.map(n => n.f), d = set[degreeOf(set, s.notes[0].m)];
    return [s.f, `Bund ${Math.min(...fs)}–${Math.max(...fs)} · ab ${deNote(d.letter, d.alter)}${s.f === best ? ' · größter Umfang' : ''}`];
  });
}
function shapeBoard(set, shape, cls, opt = {}) {
  const fs = shape.notes.map(n => n.f), lo = Math.min(...fs) === 0 ? 0 : Math.max(0, Math.min(...fs)), hi = Math.max(Math.max(...fs), lo + 4);
  const dots = shape.notes.map((n, i) => {
    const d = set[degreeOf(set, n.m)];
    return { s: n.s, f: n.f, cls: cls(i, d), label: deNote(d.letter, d.alter), blue: d.blue, end: opt.ends && opt.ends.includes(i) };
  });
  return `<div class="fb-wrap" id="board">${renderFretboard({ lo, hi, dots, hit: !!opt.hit })}</div>`;
}
function inspExercise(b) {
  const { set, shape } = blockShape(b);
  return `<div class="grid">${keyControls(b)}
    ${ctl('Lage', selHTML('fret', shapeOpts(b), shape.f))}
    ${ctl('Umfang', segHTML('range', [['root', 'ab Grundton'], ['full', 'ganze Lage']], b.range))}
    ${ctl('Muster', `<div class="chips">${SECTIONS.map(s => `<button type="button" class="chip" data-chip="section" data-v="${s.id}" aria-pressed="${b.section === s.id}">${sectionTitle(s.id, b.type)}</button>`).join('')}</div>`, 'wide')}
    ${ctl('Notenwert', selHTML('unit', unitOpts(true), b.unit || ''))}
  </div>${shapeBoard(set, shape, (i, d) => d.degree === 0 ? 'on-root' : 'on')}`;
}
function inspScale(b) {
  const { set, shape } = blockShape(b), r = scaleRange(b, shape);
  const ends = ui.markStart != null ? [ui.markStart] : [r.from, r.to];
  const hint = ui.markStart != null ? 'Jetzt den Endton anklicken.' : 'Ausschnitt festlegen: Startton und dann Endton im Griffbild anklicken.';
  return `<div class="grid">${keyControls(b)}
    ${ctl('Lage', selHTML('fret', shapeOpts(b), shape.f))}
    ${ctl('Richtung', segHTML('dir', [['up', 'auf'], ['down', 'ab'], ['updown', 'auf + ab'], ['downup', 'ab + auf']], b.dir))}
    ${ctl('Notenwert', selHTML('unit', unitOpts(false), b.unit))}
  </div>
  <div class="toolbar"><span class="hint">${hint}</span><span class="sep"></span>
    <button class="btn sm" data-do="rangeAll">Ganze Lage</button><button class="btn sm" data-do="rangeRoot">Ab tiefstem Grundton</button><button class="btn sm" data-do="rangeOct">Eine Oktave</button></div>
  ${shapeBoard(set, shape, (i, d) => (ui.markStart != null ? i === ui.markStart : i >= r.from && i <= r.to) ? (d.degree === 0 ? 'on-root' : 'on') : 'off', { ends, hit: true })}
  <p class="hint">${r.to - r.from + 1} Töne von ${noteName(set, shape.notes[r.from])} bis ${noteName(set, shape.notes[r.to])}.</p>`;
}
function noteName(set, n) { const d = set[degreeOf(set, n.m)]; return `${deNote(d.letter, d.alter)} (${STR_NAMES[n.s]}-Saite, Bund ${n.f})`; }
function chordControls(b) {
  return ctl(`Lage <em>ab Bund <output id="fretOut">${b.fret}</output></em>`, `<div class="range-row"><input type="range" min="0" max="15" step="1" value="${b.fret}" data-range="fret" aria-label="Lage ab Bund"></div>`) +
    ctl('Umfang', segHTML('range', [['oct1', '1 Oktave'], ['oct2', '2 Oktaven'], ['all', 'ganze Lage']], b.range)) +
    ctl('Muster', segHTML('pattern', [['up', 'auf'], ['down', 'ab'], ['updown', 'auf + ab']], b.pattern)) +
    ctl(b.kind === 'prog' ? 'Länge pro Akkord' : 'Länge', segHTML('length', [['once', 'einmal'], [1, '1 Takt'], [2, '2 Takte']], b.length)) +
    ctl('Notenwert', selHTML('unit', unitOpts(false), b.unit));
}
function inspChord(b) {
  const { set, shape } = blockShape(b);
  const idx = new Set(arpeggioIdx(set, shape.notes, b.range, b.pattern, 'once', b.unit));
  return `<div class="grid">
    ${ctl('Grundton', selHTML('root', markOpts(CHORD_ROOTS.map(r => [r, deName(r) + (doc.key && chordDegree(r, doc.key) >= 0 ? ' · ' + romanOf(chordDegree(r, doc.key), diatonicChord(doc.key.root, doc.key.mode, chordDegree(r, doc.key), false).quality) : '')]), r => chordRootLevel(r, doc.key), b.root), b.root))}
    ${ctl('Akkord', selHTML('quality', markOpts(chordEntries().map(([k, c]) => [k, `${deName(b.root)}${c.sym} · ${c.label}`]), q => doc.key ? chordFit(b.root, q, doc.key).level : null, b.quality), b.quality))}
    ${chordControls(b)}
  </div>${chordBoard(set, shape.notes, b.fret, i => idx.has(i))}
  <p class="hint">Töne: ${set.map(t => deNote(t.letter, t.alter)).join(' · ')}</p>`;
}
function chordBoard(set, notes, fret, inArp) {
  const lo = fret, hi = fret + 5;
  const dots = notes.map((n, i) => { const d = set[degreeOf(set, n.m)]; return { s: n.s, f: n.f, cls: inArp(i) ? (d.degree === 0 ? 'on-root' : 'on') : 'off', label: deNote(d.letter, d.alter) }; });
  return `<div class="fb-wrap" id="board">${renderFretboard({ lo, hi, dots })}</div>`;
}
function inspProg(b) {
  const chords = progChords(b), sc = buildScale(b.root, b.mode, 'scale');
  const degOpts = sc.map((t, i) => [i, `${ROMAN[i]} · ${deNote(t.letter, t.alter)}`]);
  const qOpts = [['auto', 'leitereigen']].concat(chordEntries().map(([k, c]) => [k, k === '5' ? '5 · Powerchord' : c.sym || 'Dur']));
  const first = chords[0];
  let board = '';
  if (first) { const set = buildChord(first.root, first.quality), notes = shapePosition(set, b.fret); board = chordBoard(set, notes, b.fret, () => true) + `<p class="hint">Griffbild: ${h(chordName(first.root, first.quality))}, der erste Akkord in dieser Lage.</p>`; }
  return `<div class="grid">
    ${ctl('Tongeschlecht', segHTML('mode', [['major', 'Dur'], ['minor', 'Moll']], b.mode))}
    ${ctl('Tonart', selHTML('root', markOpts(rootOpts(b.mode), r => scaleLevel(r, b.mode, 'scale', doc.key), b.root), b.root))}
    ${ctl('Akkordart', segHTML('seventh', [[false, 'Dreiklänge'], [true, 'Vierklänge']], b.seventh))}
    ${ctl('Vorlage', `<select id="f-preset" data-do-change="preset"><option value="">Vorlage wählen …</option>${PROG_PRESETS.map(p => `<option value="${p.id}">${h(p.label)}</option>`).join('')}</select>`)}
    ${ctl('Akkorde <em>(Stufe · Art)</em>', `<div class="prog-chords">${b.chords.map((c, i) => `<div class="pc"><b>${h(chordName(chords[i].root, chords[i].quality))}</b>
        <select data-pc="${i}" data-pk="deg" aria-label="Stufe von Akkord ${i + 1}">${degOpts.map(([v, l]) => `<option value="${v}"${v === c.deg ? ' selected' : ''}>${h(l)}</option>`).join('')}</select>
        <select data-pc="${i}" data-pk="q" aria-label="Art von Akkord ${i + 1}">${markOpts(qOpts, q => { if (!doc.key) return null; const r = q === 'auto' ? diatonicChord(b.root, b.mode, c.deg, b.seventh) : { root: nameOf(sc[c.deg].letter, sc[c.deg].alter), quality: q }; return chordFit(r.root, r.quality, doc.key).level; }, c.q).map(([v, l]) => `<option value="${v}"${v === c.q ? ' selected' : ''}>${h(l)}</option>`).join('')}</select>
        <button class="btn ghost sm" data-pcdel="${i}" aria-label="Akkord ${i + 1} entfernen">✕</button></div>`).join('')}
      <button class="btn sm" data-do="pcAdd">+ Akkord</button></div>`, 'wide')}
    ${chordControls(b)}
  </div>${board}`;
}
const DUR_LABEL = { w: 'Ganze', h: 'Halbe', q: 'Viertel', tri4: 'Viertel³', e: 'Achtel', tri8: 'Achtel³', s16: '16tel', tri16: '16tel³' };
function freeRange() {
  const b = cur(); if (!b || b.kind !== 'free' || sel.fi == null) return null;
  const c = sel.fi2 != null ? sel.fi2 : sel.fi;
  return [Math.min(sel.fi, c), Math.max(sel.fi, c)];
}
// Griffe eines ausgewählten Akkords: gemerkter Akkord, sonst aus den Tönen erkannt
function chordInfoOf(n) {
  if (!n || n.rest || notePos(n).length < 2) return null;
  if (n.chord) return { root: n.chord.root, quality: n.chord.quality, power: !!n.chord.power };
  const c = identifyChord(notePos(n).map(p => OPEN[p.s] + p.f));
  if (!c) return null;
  return c.quality ? { root: c.root, quality: c.quality, power: false } : { root: c.root, quality: 'maj', power: true };
}
function gripList(n) { const c = chordInfoOf(n); return c ? chordVoicingsAll(c.root, c.quality, c.power) : []; }
function gripCtl(n, pos) {
  const list = gripList(n); if (list.length < 2) return '';
  const i = list.findIndex(v => voicingKey(v) === voicingKey(pos)), bass = pos.slice().sort((x, y) => x.s - y.s)[0];
  return `<span class="gripctl"><button class="btn sm" data-do="gripPrev" aria-label="Vorheriger Griff">◀</button><span class="small">Griff ${i >= 0 ? i + 1 : '–'} von ${list.length} · Grundton ${STR_NAMES[bass.s]}-Saite Bund ${bass.f}</span><button class="btn sm" data-do="gripNext" aria-label="Nächster Griff">▶</button></span>`;
}
function inspFree(b, B) {
  const ref = b.ref;
  const set = ref ? buildScale(ref.root, ref.mode, ref.type) : keyScale(doc.key);
  const r = freeRange();
  const ctxChord = chordBefore(comp, sel.bi, r ? r[1] : null);
  const ctxPcs = ctxChord ? new Set(ctxChord.pcs) : null;
  const n = r ? b.notes[sel.fi] : null;
  const pos = n && !n.rest ? notePos(n) : [];
  const single = pos.length === 1;
  const tech = single ? (n.tech || {}) : {};
  const curDur = n ? (n.dur || b.unit) : (ui.dur || b.unit);
  const notes = B.measures.flatMap(m => m.events).filter(e => e.kind === 'note');
  const hi = Math.max(15, ...notes.flatMap(e => evFrets(e).map(f => f + 1)));
  const dots = [];
  if (set) for (let s2 = 0; s2 < 6; s2++) for (let f = 0; f <= hi; f++) { const d = degreeOf(set, OPEN[s2] + f); if (d >= 0 && !pos.some(p => p.s === s2 && p.f === f)) dots.push({ s: s2, f, cls: ctxPcs && ctxPcs.has(set[d].pc) ? 'chordtone' : 'ghost', label: deNote(set[d].letter, set[d].alter), blue: set[d].blue }); }
  if (ctxPcs && set) for (let s2 = 0; s2 < 6; s2++) for (let f = 0; f <= hi; f++) { const m2 = OPEN[s2] + f; if (ctxPcs.has(mod12(m2)) && degreeOf(set, m2) < 0 && !pos.some(p => p.s === s2 && p.f === f)) { const sp = spellMidi(m2, null, doc.key ? fifthsOf(doc.key.root, doc.key.mode) : 0); dots.push({ s: s2, f, cls: 'chordtone', label: deNote(sp.letter, sp.alter) }); } }
  pos.forEach(p => { const sp = spellMidi(OPEN[p.s] + p.f, set, ref ? fifthsOf(ref.root, ref.mode) : 0); dots.push({ s: p.s, f: p.f, cls: 'on-root', label: deNote(sp.letter, sp.alter), end: true }); });
  const cnt = r ? r[1] - r[0] + 1 : 0;
  const selTxt = !r ? 'Nichts ausgewählt: neue Töne kommen ans Ende.' : cnt > 1 ? `${cnt} Einträge markiert (${r[0] + 1} bis ${r[1] + 1}).` : n.rest ? `Pause ${r[0] + 1} ausgewählt.` : pos.length > 1 ? `Akkord ${r[0] + 1} ausgewählt: ${pos.length} Töne.` : `Ton ${r[0] + 1} ausgewählt: ${STR_NAMES[pos[0].s]}-Saite, Bund ${pos[0].f}.`;
  const modeHint = { after: 'Klick aufs Griffbrett fügt einen Ton nach der Auswahl ein.', replace: 'Klick aufs Griffbrett ersetzt den ausgewählten Ton.', stack: 'Klick aufs Griffbrett legt Töne zum ausgewählten Akkord dazu oder nimmt sie wieder weg.' }[ui.mode];
  const C = ui.chord;
  return `<div class="grid">
    ${ctl('Bezugsleiter', selHTML('reftype', [['none', 'keine'], ['scale', 'Tonleiter'], ['penta', 'Pentatonik'], ['blues', 'Blues']], ref ? ref.type : 'none'))}
    ${ref ? ctl('Tongeschlecht', segHTML('refmode', [['minor', 'Moll'], ['major', 'Dur']], ref.mode)) + ctl('Grundton', selHTML('refroot', markOpts(rootOpts(ref.mode), r => scaleLevel(r, ref.mode, ref.type, doc.key), ref.root), ref.root)) : ''}
  </div>
  <div class="grid">
    ${ctl(`Länge${r ? ' <em>(gilt für die Auswahl)</em>' : ' <em>(für neue Töne)</em>'}`, `<div class="chips" role="group" aria-label="Notenlänge">${FREE_UNITS.map(k => `<button type="button" class="chip" data-dur="${k}" aria-pressed="${k === curDur}">${DUR_LABEL[k]}</button>`).join('')}</div>`, 'wide')}
    ${ctl('Klick aufs Griffbrett', segHTML('insmode', [['after', 'Einfügen'], ['replace', 'Ersetzen'], ['stack', 'Akkord stapeln']], ui.mode))}
    ${ctl('Akkordgriff einfügen', `<div class="toolbar"><select id="chRoot" aria-label="Grundton" style="width:auto">${markOpts(CHORD_ROOTS.map(x => [x, deName(x)]), x => chordRootLevel(x, doc.key), C.root).map(([x, l]) => `<option value="${x}"${x === C.root ? ' selected' : ''}>${h(l)}</option>`).join('')}</select>
      <select id="chQ" aria-label="Akkordart" style="width:auto">${markOpts(chordEntries().map(([k, c]) => [k, k === '5' ? '5 · Powerchord' : c.sym || 'Dur']), q => doc.key ? chordFit(C.root, q, doc.key).level : null, C.q).map(([k, l]) => `<option value="${k}"${k === C.q ? ' selected' : ''}>${h(l)}</option>`).join('')}</select>
      <select id="chFret" aria-label="Lage" style="width:auto">${Array.from({ length: 16 }, (_, i) => `<option value="${i}"${i === C.fret ? ' selected' : ''}>${i === 0 ? 'offen' : 'Bund ' + i}</option>`).join('')}</select>
      <button class="btn sm" data-do="chordIns">Einfügen</button></div>`, 'wide')}
  </div>
  <div class="toolbar" role="toolbar" aria-label="Töne bearbeiten">
    <button class="btn sm" data-do="rest">Pause</button>
    <button class="btn sm" data-do="del"${!r ? ' disabled' : ''}>Löschen</button>
    <button class="btn sm" data-do="prev" aria-label="Vorheriger Eintrag"${!b.notes.length ? ' disabled' : ''}>◀</button>
    <button class="btn sm" data-do="next" aria-label="Nächster Eintrag"${!b.notes.length ? ' disabled' : ''}>▶</button>
    <button class="btn sm" data-do="desel"${!r ? ' disabled' : ''}>Auswahl aufheben</button>
    ${n && n.chord && pos.length > 1 ? `<button class="btn sm" data-do="chordToggle" title="${n.chord.power ? 'Powerchord durch den ganzen Akkord ersetzen' : 'Akkord auf Grundton, Quinte und Oktave reduzieren'}">${cnt > 1 ? (n.chord.power ? 'Markierte zu vollen Akkorden' : 'Markierte zu Powerchords') : n.chord.power ? 'Zum vollen Akkord ' + h(chordName(n.chord.root, n.chord.quality)) : 'Zum Powerchord ' + h(powerName(n.chord.root, n.chord.quality))}</button>` : ''}
    ${gripCtl(n, pos)}
    <button class="btn sm" data-do="arp"${pos.length > 1 ? '' : ' disabled'} title="Akkord in Einzeltöne von tief nach hoch zerlegen, jeder mit der eingestellten Länge">Als Arpeggio auflösen</button>
    <span class="sep"></span>
    <button class="btn sm" data-tech="bend1" aria-pressed="${tech.bend === 1}"${single ? '' : ' disabled'}>Bending ½</button>
    <button class="btn sm" data-tech="bend2" aria-pressed="${tech.bend === 2}"${single ? '' : ' disabled'}>Bending 1</button>
    <button class="btn sm" data-tech="release" aria-pressed="${!!tech.release}"${single && tech.bend ? '' : ' disabled'}>Release</button>
    <button class="btn sm" data-tech="legato" aria-pressed="${!!tech.legato}"${single ? '' : ' disabled'} title="Bindung zum nächsten Ton: aufwärts Hammer-on, abwärts Pull-off">Hammer-on / Pull-off</button>
    <button class="btn sm" data-tech="slide" aria-pressed="${!!tech.slide}"${single ? '' : ' disabled'} title="Slide zum nächsten Ton">Slide</button>
  </div>
  ${ctxChord ? `<p class="hint"><span class="fit fit-related">${h(ctxChord.name)}</span> Akkordtöne von ${h(ctxChord.name)} (zuletzt in Baustein ${ctxChord.from + 1}) sind im Griffbrett hervorgehoben${set ? ', die übrigen Leitertöne blass' : ''}.</p>` : ''}
  <p class="hint">${selTxt} ${modeHint} Umschalt-Klick in der Tabulatur markiert einen Bereich. Tastatur: Pfeiltasten wählen (mit Umschalt erweitern), Entf löscht, P setzt eine Pause, Strg+C/X/V kopiert, schneidet aus, fügt ein.</p>
  <div class="fb-wrap" id="board">${renderFretboard({ lo: 0, hi, dots, hit: true, fw: 34 })}</div>`;
}
// Reihe
function inspSeries(b) {
  const ser = b.series || { kind: 'none', items: [] };
  const opts = seriesOptions(b).map(k => [k, { none: 'keine', keys: 'Tonarten', positions: 'Lagen', octaves: 'Oktaven' }[k], k === 'keys' && b.kind === 'free' && !b.ref]);
  let body = '';
  if (ser.kind === 'keys') {
    const roots = keyRootsFor(b);
    body = `<div class="chips">${ser.items.map((it, i) => `<button type="button" class="chip" data-serdel="${i}" aria-label="${h(seriesLabel(b, 'keys', it))} entfernen">${h(seriesLabel(b, 'keys', it))}<span class="x" aria-hidden="true">✕</span></button>`).join('') || '<span class="hint">Noch keine weiteren Tonarten.</span>'}</div>
      <div class="toolbar"><select id="serAdd" aria-label="Tonart hinzufügen" style="width:auto">${roots.map(r => `<option value="${r}">${h(seriesLabel(b, 'keys', r))}</option>`).join('')}</select><button class="btn sm" data-do="serAdd">Hinzufügen</button><span class="sep"></span>
      <select id="serN" aria-label="Anzahl Schritte" style="width:auto">${[1, 2, 3, 4, 5, 6, 7, 11].map(n => `<option value="${n}"${n === 4 ? ' selected' : ''}>${n} Schritte</option>`).join('')}</select>
      <button class="btn sm" data-preset="7">Quintenzirkel</button><button class="btn sm" data-preset="5">Quartenzirkel</button><button class="btn sm" data-preset="1">chromatisch</button><button class="btn sm" data-preset="2">Ganztöne</button></div>`;
  } else if (ser.kind === 'positions') {
    let frets;
    if (b.kind === 'exercise' || b.kind === 'scale') { const { shapes, shape } = blockShape(b); frets = shapes.map(s => s.f).filter(f => f !== shape.f); }
    else frets = Array.from({ length: 16 }, (_, i) => i).filter(f => f !== b.fret);
    body = `<div class="chips">${frets.map(f => `<button type="button" class="chip" data-sertog="${f}" aria-pressed="${ser.items.includes(f)}">Bund ${f}</button>`).join('')}</div>`;
  } else if (ser.kind === 'octaves') {
    body = `<div class="chips">${[-2, -1, 1, 2].map(o => `<button type="button" class="chip" data-sertog="${o}" aria-pressed="${ser.items.includes(o)}">${o > 0 ? '+' : ''}${o} Oktave${Math.abs(o) > 1 ? 'n' : ''}</button>`).join('')}</div>`;
  }
  const expl = ser.kind === 'none' ? 'Den Baustein danach in weiteren Tonarten, Lagen oder Oktaven wiederholen.' : `Erst die Einstellung oben, dann ${ser.items.length ? 'diese ' + ser.items.length + ' ' + (ser.items.length === 1 ? 'Variante' : 'Varianten') : 'die hier gewählten Varianten'}, jede ab einem neuen Takt.`;
  return `<fieldset class="group"><legend>Reihe</legend>${segHTML('serkind', opts, ser.kind)}<p class="hint">${expl}</p>${body}</fieldset>`;
}
function keyRootsFor(b) {
  if (b.kind === 'chord') return CHORD_ROOTS;
  const mode = b.kind === 'free' ? b.ref.mode : b.mode;
  return ROOTS[mode].map(r => r[0]).slice().sort((a, c) => pcOf(a) - pcOf(c));
}
function baseRootOf(b) { return b.kind === 'free' ? b.ref.root : b.root; }
function rootForPc(b, pc) {
  const pool = keyRootsFor(b).filter(r => pcOf(r) === pc);
  if (!pool.length) return null;
  const flat = /b/.test(baseRootOf(b));
  return pool.find(r => flat ? /b/.test(r) || r.length === 1 : !/b/.test(r)) || pool[0];
}

// Feld-Änderungen aus den Einstellungen
function setField(key, raw) {
  const b = cur(); if (!b) return;
  let val = raw;
  if (raw === 'true') val = true; else if (raw === 'false') val = false;
  commit(d => {
    const x = d.blocks[sel.bi];
    switch (key) {
      case 'type': x.type = val; x.fret = null; x.from = x.to = null; if (x.series.kind === 'positions') x.series.items = []; break;
      case 'mode':
        if (x.kind === 'prog') { if (val !== x.mode) x.root = relRoot(x.root, x.mode, val); x.mode = val; break; }
        if (val !== x.mode) { x.root = relRoot(x.root, x.mode, val); x.fret = null; x.from = x.to = null; x.series = { kind: 'none', items: [] }; }
        x.mode = val; break;
      case 'root': x.root = val; if (x.kind !== 'chord' && x.kind !== 'prog') { x.fret = null; x.from = x.to = null; } if (x.series.kind === 'positions') x.series.items = []; break;
      case 'system': x.system = val; x.fret = null; x.from = x.to = null; if (x.series.kind === 'positions') x.series.items = []; break;
      case 'fret': x.fret = +val; if (x.kind === 'scale') x.from = x.to = null; if (x.series.kind === 'positions') x.series.items = x.series.items.filter(f => f !== +val); break;
      case 'range': x.range = val; break;
      case 'unit': x.unit = val || null; break;
      case 'dir': x.dir = val; break;
      case 'quality': x.quality = val; break;
      case 'pattern': x.pattern = val; break;
      case 'length': x.length = val === 'once' ? 'once' : +val; break;
      case 'seventh': x.seventh = val; break;
      case 'reftype': if (val === 'none') { x.ref = null; if (x.series.kind === 'keys') x.series = { kind: 'none', items: [] }; } else x.ref = Object.assign({ mode: 'minor', root: 'E' }, x.ref || {}, { type: val }); break;
      case 'refmode': if (val !== x.ref.mode) { x.ref.root = relRoot(x.ref.root, x.ref.mode, val); x.series = { kind: 'none', items: [] }; } x.ref.mode = val; break;
      case 'refroot': x.ref.root = val; break;
      case 'serkind': x.series = { kind: val, items: [] }; break;
    }
  });
}
const ins = $('inspector');
ins.addEventListener('click', e => {
  const b = cur(); if (!b) return;
  const segBtn = e.target.closest('.seg button');
  if (segBtn) {
    const key = segBtn.parentElement.dataset.seg, v = segBtn.dataset.v;
    if (key === 'insmode') { ui.mode = v; renderInspector(); return; }
    setField(key, v); return;
  }
  const du = e.target.closest('[data-dur]');
  if (du) { setDur(du.dataset.dur); return; }
  const chip = e.target.closest('[data-chip]');
  if (chip) { commit(d => { d.blocks[sel.bi][chip.dataset.chip] = chip.dataset.v; }); return; }
  const hit = e.target.closest('.fb-hit');
  if (hit) { boardClick(+hit.dataset.s, +hit.dataset.f); return; }
  const tech = e.target.closest('[data-tech]');
  if (tech) { toggleTech(tech.dataset.tech); return; }
  const sd = e.target.closest('[data-serdel]');
  if (sd) { const i = +sd.dataset.serdel; commit(d => d.blocks[sel.bi].series.items.splice(i, 1)); return; }
  const st = e.target.closest('[data-sertog]');
  if (st) { const v = +st.dataset.sertog; commit(d => { const s = d.blocks[sel.bi].series; s.items = s.items.includes(v) ? s.items.filter(x => x !== v) : s.items.concat(v).sort((a, c) => a - c); }); return; }
  const pr = e.target.closest('[data-preset]');
  if (pr) {
    const step = +pr.dataset.preset, n = +$('serN').value, base = pcOf(baseRootOf(b));
    const items = []; for (let i = 1; i <= n; i++) { const r = rootForPc(b, mod12(base + step * i)); if (r && !items.includes(r)) items.push(r); }
    commit(d => { d.blocks[sel.bi].series.items = items; });
    return;
  }
  const pcdel = e.target.closest('[data-pcdel]');
  if (pcdel) { const i = +pcdel.dataset.pcdel; commit(d => d.blocks[sel.bi].chords.splice(i, 1)); return; }
  const act = e.target.closest('[data-do]');
  if (!act) return;
  const a = act.dataset.do;
  if (a === 'serAdd') { const r = $('serAdd').value; commit(d => { const s = d.blocks[sel.bi].series; if (!s.items.includes(r)) s.items.push(r); }); }
  else if (a === 'pcAdd') commit(d => { const c = d.blocks[sel.bi].chords; c.push(c.length ? Object.assign({}, c[c.length - 1]) : { deg: 0, q: 'auto' }); });
  else if (a === 'rangeAll') { ui.markStart = null; commit(d => { const x = d.blocks[sel.bi], { shape } = blockShape(x); x.from = 0; x.to = shape.notes.length - 1; }); }
  else if (a === 'rangeRoot') { ui.markStart = null; commit(d => { const x = d.blocks[sel.bi]; x.from = null; x.to = null; }); }
  else if (a === 'rangeOct') { ui.markStart = null; commit(d => { const x = d.blocks[sel.bi], { set, shape } = blockShape(x); const r0 = Math.max(0, shape.rootIdx); x.from = r0; x.to = Math.min(shape.notes.length - 1, r0 + set.length); }); }
  else if (a === 'rest') freeInsert({ rest: true });
  else if (a === 'del') freeDelete();
  else if (a === 'prev') freeMove(-1);
  else if (a === 'next') freeMove(1);
  else if (a === 'desel') { clearSel(); renderInspector(); markSheetSel(); }
  else if (a === 'gripPrev' || a === 'gripNext') {
    const b = cur(); if (!b || b.kind !== 'free' || sel.fi == null) return;
    const fi = sel.fi, n = b.notes[fi], list = gripList(n); if (list.length < 2) return;
    const i = list.findIndex(v => voicingKey(v) === voicingKey(notePos(n)));
    const j = i < 0 ? 0 : (i + (a === 'gripNext' ? 1 : -1) + list.length) % list.length;
    const pos = clone(list[j]);
    sel.fi2 = null; sel.k2 = null;
    commit(d => { d.blocks[sel.bi].notes[fi].pos = pos; });
    pos.forEach((p, k) => setTimeout(() => Player.preview(OPEN[p.s] + p.f), k * 25));
    status(`Griff ${j + 1} von ${list.length}: ${pos.map(p => STR_NAMES[p.s] + p.f).join(' ')}.`);
  }
  else if (a === 'chordToggle') {
    const b = cur(); if (!b || b.kind !== 'free' || sel.fi == null) return;
    const r = freeRange(), n0 = b.notes[sel.fi]; if (!n0.chord) return;
    const toPower = !n0.chord.power;
    // gilt für alle markierten Akkorde mit gemerktem Akkord
    const changes = [];
    for (let i = r[0]; i <= r[1]; i++) {
      const n = b.notes[i], c = n.chord; if (!c || n.rest || notePos(n).length < 2 || c.power === toPower) continue;
      const bass = notePos(n).slice().sort((x, y) => x.s - y.s)[0];
      const f = chordFretNear(c.root, toPower ? '5' : c.quality, bass);
      const pos = toPower ? powerVoicing(c.root, c.quality, f) : chordVoicing(c.root, c.quality, f);
      if (pos.length > 1) changes.push({ i, pos, chord: Object.assign({}, c, { power: toPower }), name: toPower ? powerName(c.root, c.quality) : chordName(c.root, c.quality) });
    }
    if (!changes.length) { status('Dafür gibt es hier keinen Griff.'); return; }
    commit(d => changes.forEach(ch => { const x = d.blocks[sel.bi].notes[ch.i]; x.pos = ch.pos; x.chord = ch.chord; }));
    changes[0].pos.forEach((p, i) => setTimeout(() => Player.preview(OPEN[p.s] + p.f), i * 25));
    status(changes.length === 1 ? `${changes[0].name}: ${changes[0].pos.map(p => STR_NAMES[p.s] + p.f).join(' ')}.` : `${changes.length} Akkorde ${toPower ? 'zu Powerchords reduziert' : 'zu vollen Akkorden erweitert'}.`);
  }
  else if (a === 'arp') {
    const b = cur(); if (!b || b.kind !== 'free' || sel.fi == null) return;
    const fi = sel.fi, n = b.notes[fi], ps = notePos(n).slice().sort((x, y) => x.s - y.s);
    if (ps.length < 2) return;
    const dur = ui.dur || 'e';
    sel.fi = fi + ps.length - 1; sel.fi2 = fi; sel.k2 = null;
    commit(d => d.blocks[sel.bi].notes.splice(fi, 1, ...ps.map(p => ({ pos: [p], dur }))));
    status(`Akkord in ${ps.length} Einzeltöne zerlegt (${UNITS[dur].label}). Länge, Reihenfolge und Töne lassen sich jetzt einzeln ändern.`);
  }
  else if (a === 'chordIns') {
    ui.chord = { root: $('chRoot').value, q: $('chQ').value, fret: +$('chFret').value };
    const pos = chordVoicing(ui.chord.root, ui.chord.q, ui.chord.fret);
    if (!pos.length) { status('In dieser Lage gibt es keinen Griff für diesen Akkord.'); return; }
    freeInsert({ pos });
    pos.forEach(p => Player.preview(OPEN[p.s] + p.f));
    status(`${chordName(ui.chord.root, ui.chord.q)} eingefügt: ${pos.map(p => STR_NAMES[p.s] + p.f).join(' ')}.`);
  }
  else if (a === 'convert') convertSelected();
});
ins.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.field) { setField(t.dataset.field, t.value); return; }
  if (t.id === 'chRoot' || t.id === 'chQ' || t.id === 'chFret') {
    ui.chord = { root: $('chRoot').value, q: $('chQ').value, fret: +$('chFret').value };
    if (t.id !== 'chFret') {
      // Lage automatisch nah am zuletzt gespielten Ton
      const last = lastToneBefore();
      ui.chord.fret = chordFretNear(ui.chord.root, ui.chord.q, last);
      const v = chordVoicing(ui.chord.root, ui.chord.q, ui.chord.fret);
      status(`Lage ${ui.chord.fret === 0 ? 'offen' : 'Bund ' + ui.chord.fret}: ${v.map(p => STR_NAMES[p.s] + p.f).join(' ')}` + (last ? `, nah am letzten Ton (${STR_NAMES[last.s]}-Saite Bund ${last.f}).` : '.'));
    }
    renderInspector();
    return;
  }
  if (t.dataset.range === 'fret') { setField('fret', t.value); return; }
  if (t.dataset.pc != null) { const i = +t.dataset.pc, k = t.dataset.pk, v = k === 'deg' ? +t.value : t.value; commit(d => { d.blocks[sel.bi].chords[i][k] = v; }); return; }
  if (t.dataset.doChange === 'preset' && t.value) { const p = PROG_PRESETS.find(x => x.id === t.value); commit(d => { const x = d.blocks[sel.bi]; x.chords = p.chords.map(c => Object.assign({}, c)); if (p.id === 'i-iv-v' && x.mode !== 'minor') { x.root = relRoot(x.root, x.mode, 'minor'); x.mode = 'minor'; } }); }
});
ins.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'f-title') { const v = t.value; commit(d => { d.blocks[sel.bi].title = v.trim() ? v : undefined; if (!v.trim()) delete d.blocks[sel.bi].title; }, { coalesce: 'title-' + cur().id, skipInsp: true }); }
  if (t.dataset.range === 'fret') { const o = $('fretOut'); if (o) o.value = t.value; }
});

// Klick aufs Griffbrett
function boardClick(s2, f) {
  const b = cur(); if (!b) return;
  const m = OPEN[s2] + f;
  if (b.kind === 'scale') {
    const { shape } = blockShape(b);
    const i = shape.notes.findIndex(n => n.s === s2 && n.f === f);
    if (i < 0) { status('Dieser Ton gehört nicht zur Lage. Bitte einen markierten Ton anklicken.'); return; }
    Player.preview(m);
    if (ui.markStart == null) { ui.markStart = i; renderInspector(); status('Startton gesetzt. Jetzt den Endton anklicken.'); return; }
    const a = ui.markStart; ui.markStart = null;
    commit(d => { const x = d.blocks[sel.bi]; x.from = Math.min(a, i); x.to = Math.max(a, i); if (i < a && x.dir === 'up') x.dir = 'down'; else if (i > a && x.dir === 'down') x.dir = 'up'; });
    status('Ausschnitt gesetzt.');
    return;
  }
  if (b.kind !== 'free') return;
  Player.preview(m);
  const r = freeRange(), n = r ? b.notes[sel.fi] : null;
  if (ui.mode === 'stack' && n && !n.rest) {
    const fi = sel.fi;
    commit(d => {
      const x = d.blocks[sel.bi].notes[fi];
      let pos = notePos(x).slice();
      if (pos.some(p => p.s === s2 && p.f === f)) pos = pos.filter(p => !(p.s === s2 && p.f === f));
      else pos = pos.filter(p => p.s !== s2).concat({ s: s2, f }).sort((a, c) => a.s - c.s);
      if (!pos.length) { d.blocks[sel.bi].notes.splice(fi, 1); return; }
      const y = { pos };
      if (x.dur) y.dur = x.dur;
      if (pos.length === 1 && x.tech) y.tech = x.tech;
      d.blocks[sel.bi].notes[fi] = y;
    });
    return;
  }
  if (ui.mode === 'replace' && n) {
    const fi = sel.fi;
    commit(d => { const x = d.blocks[sel.bi].notes[fi]; const y = { pos: [{ s: s2, f }], dur: x.dur || ui.dur || b.unit }; if (x.tech && !x.rest) y.tech = x.tech; d.blocks[sel.bi].notes[fi] = y; });
    freeMove(1);
    return;
  }
  freeInsertMany([{ pos: [{ s: s2, f }], dur: ui.dur || b.unit }]);
}
// Letzter Ton vor der Einfügestelle: in der freien Tonfolge, sonst in den Bausteinen davor (bei Akkorden der Basston)
function lastToneBefore() {
  if (sel.bi == null) return null;
  const r = freeRange();
  for (let i = sel.bi; i >= 0; i--) {
    const B = comp[i]; if (!B) continue;
    let evs = B.measures.flatMap(m => m.events).filter(e => e.kind === 'note');
    if (i === sel.bi && r && B.block.kind === 'free') evs = evs.filter(e => e.fi <= r[1]);
    if (evs.length) { const e = evs[evs.length - 1]; return { s: e.s, f: e.f }; }
  }
  return null;
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function freeInsertMany(list) {
  const b = cur(); if (!b || b.kind !== 'free' || !list.length) return;
  const r = freeRange(), at = r ? r[1] + 1 : b.notes.length;
  sel.fi = at + list.length - 1; sel.fi2 = list.length > 1 ? at : null; sel.k2 = null;
  commit(d => d.blocks[sel.bi].notes.splice(at, 0, ...clone(list)));
  scrollSelIntoView();
}
function freeInsert(n) { freeInsertMany([Object.assign({ dur: ui.dur || cur().unit }, n)]); }
function freeDelete() {
  const b = cur(), r = freeRange(); if (!r) return;
  sel.fi = r[0] > 0 ? r[0] - 1 : (b.notes.length > r[1] - r[0] + 1 ? 0 : null); sel.fi2 = null; sel.k2 = null;
  commit(d => d.blocks[sel.bi].notes.splice(r[0], r[1] - r[0] + 1));
}
function freeMove(dir, extend) {
  const b = cur(); if (!b || b.kind !== 'free' || !b.notes.length) return;
  const last = b.notes.length - 1, clamp = x => Math.max(0, Math.min(last, x));
  if (sel.fi == null) { sel.fi = dir > 0 ? 0 : last; sel.fi2 = null; }
  else if (extend) { const ext = clamp((sel.fi2 != null ? sel.fi2 : sel.fi) + dir); sel.fi2 = ext === sel.fi ? null : ext; }
  else { const r = freeRange(); sel.fi = clamp((dir > 0 ? r[1] : r[0]) + dir); sel.fi2 = null; }
  sel.k2 = null;
  refresh(); scrollSelIntoView();
}
function setDur(k) {
  ui.dur = k;
  const r = freeRange();
  if (r) commit(d => { for (let i = r[0]; i <= r[1]; i++) d.blocks[sel.bi].notes[i].dur = k; });
  else renderInspector();
}
function toggleTech(t) {
  const b = cur(); if (!b || b.kind !== 'free' || sel.fi == null) return;
  commit(d => {
    const n = d.blocks[sel.bi].notes[sel.fi]; if (!n || n.rest || notePos(n).length !== 1) return;
    const tc = Object.assign({}, n.tech || {});
    if (t === 'bend1') { tc.bend = tc.bend === 1 ? 0 : 1; if (!tc.bend) delete tc.release; }
    if (t === 'bend2') { tc.bend = tc.bend === 2 ? 0 : 2; if (!tc.bend) delete tc.release; }
    if (t === 'release') tc.release = !tc.release;
    if (t === 'legato') { tc.legato = !tc.legato; if (tc.legato) tc.slide = false; }
    if (t === 'slide') { tc.slide = !tc.slide; if (tc.slide) tc.legato = false; }
    Object.keys(tc).forEach(k => { if (!tc[k]) delete tc[k]; });
    if (Object.keys(tc).length) n.tech = tc; else delete n.tech;
  });
}
function convertSelected() {
  const b = cur(); if (!b || b.kind === 'free') return;
  const evs = comp[sel.bi].measures.flatMap(m => m.events);
  const r = sel.k != null ? evByK(sel.k) : null;
  const fi = r ? evs.indexOf(r.e) : null;
  commit(d => { d.blocks[sel.bi] = toFree(d.blocks[sel.bi], meterOf(d.time)); });
  sel.fi = fi; sel.fi2 = null; sel.k2 = null; refresh();
  status('In freie Tonfolge umgewandelt. Rückgängig mit Strg+Z.');
}

// ---------- Auswahl, Zwischenablage ----------
function rangeEvents() {
  if (sel.k == null) return [];
  const all = comp.flatMap(B => B.measures.flatMap(m => m.events));
  const a = all.findIndex(e => e.k === sel.k), c = all.findIndex(e => e.k === (sel.k2 != null ? sel.k2 : sel.k));
  if (a < 0 || c < 0) return [];
  const [i, j] = a <= c ? [a, c] : [c, a];
  return all.slice(i, j + 1);
}
function selKeys() { return new Set(rangeEvents().filter(e => e.k != null).map(e => e.k)); }
function refOfBlock(b) {
  if (!b) return null;
  if (b.kind === 'free') return b.ref;
  if (b.kind === 'exercise' || b.kind === 'scale') return { type: b.type, root: b.root, mode: b.mode };
  if (b.kind === 'prog') return { type: 'scale', root: b.root, mode: b.mode };
  return null;
}
function selInOneFree() { const b = cur(); return !!(b && b.kind === 'free' && sel.fi != null && (sel.k2 == null || sel.fi2 != null)); }
function copySel() {
  const evs = rangeEvents(); if (!evs.length) { status('Erst Töne in der Tabulatur markieren: Klick, dann Umschalt-Klick.'); return false; }
  ui.clip = { notes: evs.map(evToNote), ref: refOfBlock(cur()) };
  store.set('tabwerk-clip', ui.clip);
  const n = ui.clip.notes.filter(x => !x.rest).length;
  status(`${n} ${n === 1 ? 'Ton' : 'Töne'} kopiert. In einer freien Tonfolge mit Einfügen oder Strg+V einsetzen.`);
  updateSelBar();
  return true;
}
function cutSel() {
  if (!selInOneFree()) { status('Ausschneiden geht nur in freien Tonfolgen. Übungen lassen sich kopieren oder vorher umwandeln.'); return; }
  if (copySel()) { freeDelete(); status('Ausgeschnitten.'); }
}
function pasteSel() {
  if (!ui.clip || !ui.clip.notes || !ui.clip.notes.length) { status('Die Zwischenablage ist leer.'); return; }
  const b = cur();
  if (b && b.kind === 'free') { freeInsertMany(ui.clip.notes); status('Eingefügt.'); return; }
  const nb = newBlock('free', ui.clip.ref || undefined);
  if (!ui.clip.ref) nb.ref = null;
  nb.notes = clone(ui.clip.notes); nb.title = 'Eigene Tonfolge';
  const at = sel.bi == null ? doc.blocks.length : sel.bi + 1;
  commit(d => d.blocks.splice(at, 0, nb));
  sel = { bi: at, fi: null, fi2: null, k: null, k2: null }; refresh();
  status('Als neue freie Tonfolge eingefügt.');
}
function deleteSel() {
  if (selInOneFree()) { freeDelete(); return; }
  if (sel.k != null) status('Töne in Übungen, Skalen und Akkorden lassen sich nicht einzeln löschen. Erst „In freie Tonfolge umwandeln“.');
}
function updateSelBar() {
  const bar = $('selbar'); if (!bar) return;
  const evs = rangeEvents(), n = evs.filter(e => e.kind === 'note').length, hasClip = !!(ui.clip && ui.clip.notes && ui.clip.notes.length);
  if (!evs.length && !hasClip) { bar.hidden = true; return; }
  bar.hidden = false;
  const free = selInOneFree();
  bar.innerHTML = `<span class="muted small">${evs.length ? `${n} ${n === 1 ? 'Ton' : 'Töne'} markiert` : 'Zwischenablage: ' + ui.clip.notes.filter(x => !x.rest).length + ' Töne'}</span>
    <button class="btn sm" data-sb="copy"${evs.length ? '' : ' disabled'}>Kopieren</button>
    <button class="btn sm" data-sb="cut"${free ? '' : ' disabled'}>Ausschneiden</button>
    <button class="btn sm" data-sb="paste"${hasClip ? '' : ' disabled'} title="In die ausgewählte freie Tonfolge, sonst als neue Tonfolge">Einfügen</button>
    <button class="btn sm" data-sb="del"${free ? '' : ' disabled'}>Löschen</button>
    ${evs.length ? '<button class="btn sm ghost" data-sb="clear">Markierung aufheben</button>' : ''}`;
}

// ---------- Tabulatur ----------
function renderSheet() {
  const el = $('sheet');
  if (!comp.length) { el.innerHTML = '<div class="empty">Die Tabulatur erscheint hier, sobald es Bausteine gibt.</div>'; $('sheetInfo').textContent = ''; return; }
  const meter = comp[0].meter;
  const totalM = comp.reduce((a, B) => a + B.measures.length, 0);
  const secs = Math.round(totalM * meter.len / meter.beat * 60 / doc.bpm);
  $('sheetInfo').textContent = `${totalM} Takte im ${meter.label} · etwa ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} Minuten · Klick wählt einen Ton, Umschalt-Klick einen Bereich`;
  const keys = selKeys();
  const keyPcs = doc.key ? new Set(keyScale(doc.key).map(t => t.pc)) : null, blue = doc.key ? bluePcs(doc.key) : null;
  el.innerHTML = comp.map((B, i) => {
    const svgs = B.measures.map((M, mi) => measureSvg(M, B.meter, { sel: keys, keyPcs, bluePcs: blue, firstOfBlock: mi === 0, showTime: M.no === 1, lastOfDoc: i === comp.length - 1 && mi === B.measures.length - 1 })).join('');
    const ul = B.block.kind === 'free' ? 'eigene Längen' : B.unit.label;
    return `<div class="tb${i === sel.bi ? ' sel' : ''}" data-bi="${i}"><div class="tb-head" data-head="${i}"><span class="kind">${i + 1} · ${KINDS[B.block.kind]}</span><h3>${h(blockTitle(B.block))}</h3><span class="muted small">${h(ul)}</span>${fitPill(blockFit(B, doc.key))}
      <button class="btn sm" data-playb="${i}">▶ abspielen</button></div>
      ${selNoteBox(B, i)}<div class="staff">${svgs || '<span class="hint">Noch keine Töne.</span>'}</div></div>`;
  }).join('');
}
function selNoteBox(B, i) {
  if (i !== sel.bi || sel.k == null || B.block.kind === 'free') return '';
  const r = evByK(sel.k); if (!r || r.B.bi !== i) return '';
  return `<div class="note-box">Ausgewählt: ${h(noteLabel(r.e))}. Mit Umschalt-Klick einen Bereich markieren und kopieren, oder den Baustein umwandeln, um Töne direkt zu ändern. <button class="btn sm" data-do="convert">In freie Tonfolge umwandeln</button></div>`;
}
function markSheetSel() {
  document.querySelectorAll('.tb').forEach(t => t.classList.toggle('sel', +t.dataset.bi === sel.bi));
  document.querySelectorAll('.staff g.n.sel').forEach(g => g.classList.remove('sel'));
  selKeys().forEach(k => { const g = document.querySelector(`.staff g.n[data-k="${k}"]`); if (g) g.classList.add('sel'); });
  document.querySelectorAll('.note-box').forEach(n => n.remove());
  if (sel.bi != null && comp[sel.bi]) { const t = document.querySelector(`.tb[data-bi="${sel.bi}"] .staff`); const box = selNoteBox(comp[sel.bi], sel.bi); if (t && box) t.insertAdjacentHTML('beforebegin', box); }
  updateSelBar();
}
function scrollSelIntoView() {
  const k = sel.fi2 != null ? sel.k2 : sel.k;
  if (k == null) return;
  const g = document.querySelector(`.staff g.n[data-k="${k}"]`); if (!g) return;
  const r = g.getBoundingClientRect(), dockH = document.querySelector('.dock').offsetHeight;
  if (r.top < 10 || r.bottom > innerHeight - dockH - 10) g.ownerSVGElement.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
}
$('sheet').addEventListener('click', e => {
  const pb = e.target.closest('[data-playb]'); if (pb) { play(+pb.dataset.playb); return; }
  const cv = e.target.closest('[data-do="convert"]'); if (cv) { convertSelected(); return; }
  const g = e.target.closest('g.n');
  if (g) {
    const k = +g.dataset.k, r = evByK(k); if (!r) return;
    const bi = r.B.bi;
    if (e.shiftKey && sel.k != null) {
      sel.k2 = k === sel.k ? null : k;
      sel.fi2 = bi === sel.bi && sel.fi != null && r.e.fi != null && sel.k2 != null ? r.e.fi : null;
    } else {
      const changed = bi !== sel.bi;
      sel = { bi, k, k2: null, fi: r.e.fi != null ? r.e.fi : null, fi2: null }; ui.markStart = null;
      if (r.e.kind === 'note') [r.e].concat(r.e.extra || []).forEach(t => Player.preview(t.m));
      if (changed) { renderBlocks(); renderSugg(); }
    }
    renderInspector(); markSheetSel();
    return;
  }
  const hd = e.target.closest('[data-head]'); if (hd) selectBlock(+hd.dataset.head);
});
$('selbar').addEventListener('click', e => {
  const b = e.target.closest('[data-sb]'); if (!b) return;
  const a = b.dataset.sb;
  if (a === 'copy') copySel(); else if (a === 'cut') cutSel(); else if (a === 'paste') pasteSel(); else if (a === 'del') deleteSel();
  else if (a === 'clear') { clearSel(); renderInspector(); markSheetSel(); }
});

// ---------- Wiedergabe ----------
let starting = false;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function setPlayUi(on, only) {
  $('play').textContent = on ? '■ Stopp' : '▶ Alles abspielen';
  $('playBlock').textContent = on && only != null ? '■ Stopp' : '▶ Baustein';
}
async function play(only) {
  if (ui.previewIdx != null) { Player.stop(); ui.previewIdx = null; renderSugg(); }
  if (Player.isPlaying() || starting) { Player.stop(); return; }
  if (only === undefined && sel.bi == null) return;
  starting = true; setPlayUi(true, only);
  try {
    const ok = await Player.start(comp, only, {
      bpm: () => doc.bpm, countIn: () => $('countin').checked, loop: () => $('loop').checked, metronome: () => $('metro').checked,
      onNote: k => highlight(k), onStop: () => { highlight(null); setPlayUi(false); status(''); }
    });
    if (ok) status(only != null ? `Spielt Baustein ${only + 1}: ${blockTitle(doc.blocks[only])}` : 'Spielt die ganze Folge' + ($('countin').checked ? ', mit einem Takt Einzähler.' : '.'));
    else setPlayUi(false);
  } catch (err) { setPlayUi(false); status(err.message); }
  starting = false;
}
function highlight(k) {
  const prev = document.querySelector('.staff g.n.on'); if (prev) prev.classList.remove('on');
  if (k == null) return;
  const g = document.querySelector(`.staff g.n[data-k="${k}"]`); if (!g) return;
  g.classList.add('on');
  if ($('follow').checked && Date.now() > ui.userScrollUntil) {
    const r = g.getBoundingClientRect(), dockH = document.querySelector('.dock').offsetHeight;
    if (r.top < 20 || r.bottom > innerHeight - dockH - 10) g.ownerSVGElement.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  }
}
$('play').onclick = () => play(null);
$('playBlock').onclick = () => { if (Player.isPlaying() || starting) Player.stop(); else if (sel.bi != null) play(sel.bi); else status('Erst einen Baustein auswählen.'); };
// Tempo: beim Ziehen sofort hörbar, beim Loslassen als Änderung gespeichert
let bpmBefore = null;
$('bpm').addEventListener('input', e => { if (bpmBefore == null) bpmBefore = doc.bpm; $('bpmOut').value = e.target.value; doc.bpm = +e.target.value; });
$('bpm').addEventListener('change', e => { const v = +e.target.value; if (bpmBefore != null) doc.bpm = bpmBefore; bpmBefore = null; commit(d => { d.bpm = v; }, { coalesce: 'bpm', skipInsp: true }); });
['countin', 'metro', 'loop', 'follow'].forEach(id => { $(id).checked = prefs[id]; $(id).addEventListener('change', e => { prefs[id] = e.target.checked; savePrefs(); }); });
const pauseFollow = () => { if (Player.isPlaying()) ui.userScrollUntil = Date.now() + 4000; };
['wheel', 'touchmove'].forEach(t => addEventListener(t, pauseFollow, { passive: true }));

// ---------- Name, Verlauf, Tastatur ----------
$('docName').addEventListener('input', e => { const v = e.target.value; commit(d => { d.name = v || 'Ohne Namen'; }, { coalesce: 'name', skipName: true, skipInsp: true }); });
$('undo').onclick = undo; $('redo').onclick = redo;
addEventListener('keydown', e => {
  const t = e.target, typing = t.matches && t.matches('input[type=text], input:not([type]), textarea, select, .docname');
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (e.key === 'Escape') { closeMenu(); closeLib(); if (ui.markStart != null) { ui.markStart = null; renderInspector(); } return; }
  if (typing) return;
  if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (!$('lib').hidden) return;
  if (mod && key === 'c' && sel.k != null && !String(getSelection())) { e.preventDefault(); copySel(); return; }
  if (mod && key === 'x' && sel.k != null) { e.preventDefault(); cutSel(); return; }
  if (mod && key === 'v' && ui.clip) { e.preventDefault(); pasteSel(); return; }
  const b = cur();
  if (b && b.kind === 'free' && !t.closest('.blk')) {
    if (e.key === 'Delete' || e.key === 'Backspace') { if (sel.fi != null) { e.preventDefault(); freeDelete(); } }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); freeMove(-1, e.shiftKey); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); freeMove(1, e.shiftKey); }
    else if (key === 'p' && !mod) { e.preventDefault(); freeInsert({ rest: true }); }
  }
  if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) pauseFollow();
});
$('docTime').addEventListener('change', e => { const v = e.target.value; commit(d => { d.time = v; }); status(`Taktart ${v}. Jeder Baustein beginnt weiter auf einem neuen Takt.`); });

// ---------- Bibliothek ----------
function openLib() { ui.libConfirm = null; renderLib(); $('lib').hidden = false; $('libClose').focus(); }
function closeLib() { if ($('lib').hidden) return; $('lib').hidden = true; $('libBtn').focus(); }
function renderLib() {
  const docs = lib.docs.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
  $('libList').innerHTML = docs.map(d => `<li class="lib-item${d.id === doc.id ? ' cur' : ''}" data-id="${d.id}">
    <div class="nm">${h(d.name)}${d.id === doc.id ? ' <span class="kind">geöffnet</span>' : ''}</div>
    <div class="muted small">${d.blocks.length} ${d.blocks.length === 1 ? 'Baustein' : 'Bausteine'} · geändert ${fmtDate(d.updated || Date.now())}</div>
    ${ui.libConfirm === d.id ? `<div class="row"><span>„${h(d.name)}“ endgültig löschen?</span><button class="btn sm danger" data-lib="delyes">Löschen</button><button class="btn sm" data-lib="delno">Abbrechen</button></div>`
      : `<div class="row">${d.id !== doc.id ? '<button class="btn sm primary" data-lib="open">Öffnen</button>' : ''}<button class="btn sm" data-lib="dup">Kopieren</button><button class="btn sm danger" data-lib="del">Löschen</button></div>`}
  </li>`).join('');
}
function switchDoc(d) {
  Player.stop();
  doc = d; lib.currentId = d.id;
  sel = { bi: d.blocks.length ? 0 : null, fi: null, fi2: null, k: null, k2: null }; hist = { undo: [], redo: [], last: null }; ui.markStart = null; ui.multi.clear(); renderMulti();
  refresh();
}
$('libBtn').onclick = openLib;
$('libClose').onclick = closeLib;
$('lib').addEventListener('click', e => { if (e.target === $('lib')) closeLib(); });
$('libNew').onclick = () => { const d = newDoc(); lib.docs.push(d); switchDoc(d); closeLib(); status('Neue Folge angelegt.'); $('docName').focus(); $('docName').select(); };
$('libExample').onclick = () => { const d = exampleDoc(); lib.docs.push(d); switchDoc(d); closeLib(); status('Beispiel hinzugefügt.'); };
$('libList').addEventListener('click', e => {
  const btn = e.target.closest('[data-lib]'); if (!btn) return;
  const id = btn.closest('.lib-item').dataset.id, d = lib.docs.find(x => x.id === id), a = btn.dataset.lib;
  if (a === 'open') { switchDoc(d); closeLib(); }
  else if (a === 'dup') { const c = JSON.parse(JSON.stringify(d)); c.id = uid(); c.name = d.name + ' (Kopie)'; c.updated = Date.now(); lib.docs.push(c); saveSoon(); renderLib(); }
  else if (a === 'del') { ui.libConfirm = id; renderLib(); }
  else if (a === 'delno') { ui.libConfirm = null; renderLib(); }
  else if (a === 'delyes') {
    lib.docs = lib.docs.filter(x => x.id !== id); ui.libConfirm = null;
    if (!lib.docs.length) lib.docs.push(newDoc());
    if (id === doc.id) switchDoc(lib.docs[0]); else saveSoon();
    renderLib(); status('Folge gelöscht.');
  }
});

// ---------- Datei: Export und Import ----------
let downloads = null;
(async () => { try { downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { downloads = null; } })();
async function saveFile(name, data, mime) {
  if (downloads) {
    try { await downloads.save({ filename: name, data }); status(`${name} gespeichert.`); return true; }
    catch (e) { status(e && e.code === 'declined' ? 'Speichern abgebrochen.' : 'Speichern ging hier nicht.'); return false; }
  }
  if (window.claude) { status('Speichern ist in dieser Ansicht nicht möglich.'); return false; }
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  status(`${name} gespeichert.`);
  return true;
}
function closeMenu() { $('exportList').hidden = true; $('exportBtn').setAttribute('aria-expanded', 'false'); }
$('exportBtn').onclick = e => { e.stopPropagation(); const l = $('exportList'); l.hidden = !l.hidden; $('exportBtn').setAttribute('aria-expanded', String(!l.hidden)); };
document.addEventListener('click', e => { if (!e.target.closest('#exportMenu')) closeMenu(); });
$('exportList').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  closeMenu();
  const a = b.dataset.act, base = slug(doc.name);
  if (a === 'musicxml') {
    if (!doc.blocks.length) { status('Die Folge ist noch leer.'); return; }
    const xml = toMusicXML(doc, comp);
    if (window.claude) { if (await saveFile(base + '.zip', new Blob([makeZip([{ name: base + '.musicxml', data: xml }])]))) status('Gespeichert. ZIP entpacken und die .musicxml in Guitar Pro über Datei › Importieren › MusicXML öffnen.'); }
    else if (await saveFile(base + '.musicxml', xml, 'application/vnd.recordare.musicxml+xml')) status('Gespeichert. In Guitar Pro über Datei › Importieren › MusicXML öffnen.');
  } else if (a === 'json') saveFile(base + '.json', JSON.stringify({ app: 'tabwerk', version: 1, doc }, null, 1), 'application/json');
  else if (a === 'libjson') saveFile('tabwerk_bibliothek.json', JSON.stringify({ app: 'tabwerk', version: 1, docs: lib.docs }, null, 1), 'application/json');
  else if (a === 'import') $('importFile').click();
  else if (a === 'copyxml') {
    const xml = toMusicXML(doc, comp);
    navigator.clipboard.writeText(xml).then(() => status(`MusicXML kopiert. In einen Editor einfügen und als ${base}.musicxml speichern.`)).catch(() => status('Kopieren wurde vom Browser blockiert.'));
  }
});
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    if (/.gpx?$/i.test(f.name)) {
      const { docs, warn } = await importGuitarPro(new Uint8Array(await f.arrayBuffer()));
      docs.forEach(d => { d.updated = Date.now(); });
      lib.docs.push(...docs); switchDoc(docs[0]);
      status((docs.length === 1 ? `„${docs[0].name}“ importiert.` : `${docs.length} Gitarrenspuren als eigene Folgen importiert, in der Bibliothek.`) + (warn.length ? ' Hinweis: ' + warn.join('; ') + '.' : ''));
      return;
    }
    const data = JSON.parse(await f.text());
    const list = Array.isArray(data.docs) ? data.docs : data.doc ? [data.doc] : Array.isArray(data.blocks) ? [data] : null;
    if (!list) throw new Error('Die Datei enthält keine Übungsfolge.');
    const added = list.map(sanitizeDoc).map(d => { if (lib.docs.some(x => x.id === d.id)) { d.id = uid(); d.name += ' (importiert)'; } d.updated = Date.now(); return d; });
    lib.docs.push(...added); switchDoc(added[0]);
    status(added.length === 1 ? `„${added[0].name}“ importiert.` : `${added.length} Folgen importiert.`);
  } catch (err) { status('Import fehlgeschlagen: ' + (err.message || 'Datei nicht lesbar').replace(/.$/, '') + '.'); }
});

// ---------- Ansicht „Andere Lagen“ ----------
// Zweite Seite neben dem Editor: zeigt, wo sich dieselben Töne (oder derselbe Akkord) an anderer Stelle des Griffbretts spielen lassen.

// Quelle: markierte Töne, sonst der ausgewählte Baustein. Pausen bleiben für Vorschau und Einfügen erhalten.
// Ergebnis: evs (Töne und Pausen), notes (nur Töne), groups (Tonhöhen je Ton/Akkord), orig (Griffe wie notiert),
// bi (Baustein, falls alle Töne aus einem stammen), free (Töne lassen sich dort direkt ersetzen)
function altSource() {
  let evs = rangeEvents(), label = 'Markierte Töne';
  if (!evs.length && sel.bi != null && comp[sel.bi]) { evs = comp[sel.bi].measures.flatMap(m => m.events); label = blockTitle(doc.blocks[sel.bi]); }
  // Pausen am Anfang und Ende gehören nicht zur Abfolge
  evs = evs.slice();
  while (evs.length && evs[evs.length - 1].kind === 'rest') evs.pop();
  while (evs.length && evs[0].kind === 'rest') evs.shift();
  const notes = evs.filter(e => e.kind === 'note');
  if (!notes.length) return null;
  const bis = new Set(notes.map(e => { const r = e.k != null ? evByK(e.k) : null; return r ? r.B.bi : -1; }));
  const bi = bis.size === 1 ? [...bis][0] : -1;
  const free = bi >= 0 && doc.blocks[bi].kind === 'free' && notes.every(e => e.fi != null);
  return { evs, notes, label, bi, free, groups: notes.map(e => [e].concat(e.extra || []).map(t => t.m)), orig: notes.map(e => [e].concat(e.extra || []).map(t => ({ s: t.s, f: t.f }))) };
}
// Einträge einer freien Tonfolge mit neuen Griffen, Rhythmus und Pausen wie in der Quelle
function altNotes(src, pos) {
  let i = 0;
  return src.evs.map(e => { const n = evToNote(e); if (!n.rest) n.pos = pos[i++].map(p => ({ s: p.s, f: p.f })); return n; });
}
// Griffbrett für eine Variante. Ohne labelOf zeigen die Punkte die Reihenfolge (1, 2, 3 …), mit labelOf den Tonnamen (Akkorde).
// Jeder Punkt trägt in data-n die Nummern der Töne, die er darstellt, damit die Wiedergabe ihn hervorheben kann.
function altBoard(pos, labelOf) {
  // Ausschnitt: ein Bund Rand um die gegriffenen Töne, mindestens sechs Bünde breit
  const all = pos.flat(), fr = all.map(p => p.f).filter(f => f > 0);
  const lo = all.some(p => p.f === 0) || !fr.length ? 0 : Math.max(1, Math.min(...fr) - 1), hi = Math.min(MAX_FRET, Math.max(fr.length ? Math.max(...fr) + 1 : 4, lo + 5));
  // Mehrfach gespielte Stellen: je Durchgang ein eigener Punkt mit seiner Nummer nebeneinander im Bund
  const at = new Map();
  pos.forEach((g, i) => g.forEach(p => {
    const k = p.s + ':' + p.f;
    if (!at.has(k)) at.set(k, []);
    const list = at.get(k);
    if (labelOf && list.length) { list[0].n += ' ' + i; return; }
    list.push({ n: String(i), s: p.s, f: p.f, cls: labelOf ? (labelOf(p).root ? 'on-root' : 'on') : i === 0 ? 'on-root' : 'on', label: labelOf ? labelOf(p).text : String(i + 1) });
  }));
  // Bünde so breit machen, dass die Punkte einer Stelle nebeneinander passen (höchstens sechs)
  const maxOf = open => Math.max(1, ...[...at.values()].filter(l => (l[0].f === 0) === open).map(l => l.length));
  const step = 18, fw = Math.min(6 * step + 6, Math.max(36, maxOf(false) * step + 6)), ow = Math.min(6 * step + 6, Math.max(38, maxOf(true) * step + 6));
  const dots = [];
  at.forEach(list => {
    // Passt nicht alles in den Bund, zeigt der letzte Punkt „+Anzahl“ und steht für alle übrigen Töne
    const room = Math.floor(((list[0].f === 0 ? ow : fw) - 6) / step);
    const shown = list.length > room ? list.slice(0, room - 1).concat(Object.assign({}, list[room - 1], { label: '+' + (list.length - room + 1), n: list.slice(room - 1).map(d => d.n).join(' ') })) : list;
    if (shown.length === 1) { dots.push(shown[0]); return; }
    shown.forEach((d, j) => dots.push(Object.assign(d, { dx: (j - (shown.length - 1) / 2) * step, r: 8 })));
  });
  return `<div class="fb-wrap">${renderFretboard({ lo, hi, dots, fw, ow })}</div>`;
}
// Tabulatur als Text (z. B. „E0 A2 D2+G2“), jeder Eintrag einzeln hervorhebbar
function altTab(pos) { return pos.map((g, i) => `<span data-n="${i}">${h(g.map(p => STR_NAMES[p.s] + p.f).join('+'))}</span>`).join(' '); }
// Wiedergabe: gerade gespielten Ton im Griffbrett und in der Tabulatur der Karte hervorheben
function altHighlight(ci, n) {
  document.querySelectorAll('#altView .play').forEach(x => x.classList.remove('play'));
  if (n == null) return;
  document.querySelectorAll(`#altView .alt-card[data-ai="${ci}"] [data-n~="${n}"]`).forEach(x => x.classList.add('play'));
}
// Bundbereich einer Variante für die Überschrift
function altWhere(pos) {
  const fr = pos.flat().map(p => p.f).filter(f => f > 0);
  if (!fr.length) return { lo: 0, text: 'Leere Saiten' };
  const lo = Math.min(...fr), hi = Math.max(...fr);
  return { lo, text: lo === hi ? `Bund ${lo}` : `Bund ${lo}–${hi}` };
}
// Umschalten zwischen Editor und „Andere Lagen“ (gemerkt in den Einstellungen)
function renderView() {
  const alt = prefs.view === 'alt';
  $('viewSwitch').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === prefs.view)));
  document.querySelector('.work').hidden = alt; document.querySelector('.sheet-area').hidden = alt;
  $('altView').hidden = !alt;
  if (alt) renderAlt();
}
// Liste der Varianten: zuerst „Wie notiert“, dann die Alternativen als Karten
function renderAlt() {
  const el = $('altView'), span = prefs.altSpan;
  const src = altSource();
  // Ein einzelner Akkord: alle Griffe dieses Akkords, dazu dieselben Töne in anderen Lagen
  const chord = src && src.notes.length === 1 && src.orig[0].length > 1 ? chordInfoOf(evToNote(src.notes[0])) : null;
  const spanSeg = `<div class="seg" id="altSpan" aria-label="Griffweite">${[4, 5, 6].map(v => `<button type="button" data-span="${v}" aria-pressed="${v === span}">${v} Bünde</button>`).join('')}</div>`;
  const head = `<div class="alt-head"><h2>Andere Lagen</h2>${spanSeg}
    <span class="muted small">${chord ? 'Alle Griffe des Akkords auf dem Griffbrett, Grundton hervorgehoben.' : 'Gleiche Töne in gleicher Reihenfolge. Je Lage bleibt der Fingersatz in der Lage, solange es geht; Töne, die dort nicht liegen, werden mit kurzem Lagenwechsel gespielt. Die Zahlen zeigen die Reihenfolge.'}</span></div>`;
  if (!src) { ui.alt = null; el.innerHTML = head + '<div class="empty">Im Editor einen Baustein auswählen oder in der Tabulatur Töne oder einen Akkord markieren (Klick, dann Umschalt-Klick). Hier erscheinen dann alle Stellen auf dem Griffbrett, an denen sich dasselbe spielen lässt.</div>'; return; }
  if (src.notes.length > 200) { ui.alt = null; el.innerHTML = head + '<div class="empty">Das sind mehr als 200 Töne. Bitte einen kürzeren Bereich markieren.</div>'; return; }
  const origKey = src.orig.map(voicingKey).join('|');
  let alts = altPositions(src.groups, span);
  let labelOf = null, name = '';
  if (chord) {
    const set = buildChord(chord.root, chord.quality), rpc = pcOf(chord.root);
    name = chord.power ? powerName(chord.root, chord.quality) : chordName(chord.root, chord.quality);
    labelOf = p => { const m = OPEN[p.s] + p.f, sp = spellMidi(m, set); return { text: deNote(sp.letter, sp.alter), root: mod12(m) === rpc }; };
    // Akkordgriffe aus der Griffliste ergänzen, soweit sie nicht schon als gleiche Töne gefunden wurden
    const same = new Set(alts.map(a => a.key));
    const grips = chordVoicingsAll(chord.root, chord.quality, chord.power).map(v => ({ pos: [v], key: voicingKey(v), grip: true })).filter(g => !same.has(g.key));
    alts = alts.map(a => Object.assign(a, { exact: true })).concat(grips);
    const lowOf = a => altWhere(a.pos).lo;
    alts.sort((x, y) => lowOf(x) - lowOf(y));
  }
  // Die notierte Fassung steht schon oben
  alts = alts.filter(a => a.key !== origKey);
  ui.alt = { src, list: [{ pos: src.orig, orig: true }].concat(alts) };
  const n = src.notes.length;
  const card = (a, i) => {
    const playing = ui.altPlay === i && Player.isPlaying();
    const bass = a.pos[0].slice().sort((x, y) => x.s - y.s)[0];
    // Zusatz zur Überschrift: bei Akkorden Basssaite und Art des Griffs, bei Tonfolgen die Lagenwechsel
    const sub = chord ? ` · Bass ${STR_NAMES[bass.s]}-Saite${a.orig ? '' : a.grip ? ' · andere Umkehrung/Oktave' : ' · gleiche Töne'}`
      : a.shifts ? ` · ${a.shifts} ${a.shifts === 1 ? 'Ton' : 'Töne'} mit Lagenwechsel, gesamt ${altWhere(a.pos).text}` : '';
    return `<div class="alt-card${a.orig ? ' orig' : ''}" data-ai="${i}"><div class="alt-card-head"><h3>${a.orig ? 'Wie notiert · ' + altWhere(a.pos).text : a.w != null && !chord ? `Lage Bund ${a.w}–${a.w + a.span - 1}` : altWhere(a.pos).text}<span class="muted small">${h(sub)}</span></h3>
      <button class="btn sm" data-altplay="${i}">${playing ? '■ Stopp' : '▶ abspielen'}</button>
      ${a.orig ? '' : `${src.free ? `<button class="btn sm" data-altuse="${i}" title="${chord ? 'Den Akkord im Baustein durch diesen Griff ersetzen' : 'Die Töne im Baustein auf diese Lage umsetzen'}">Übernehmen</button>` : ''}<button class="btn sm" data-altins="${i}" title="Als neue freie Tonfolge hinter dem Baustein einfügen">Als Tonfolge einfügen</button>`}</div>
      ${altBoard(a.pos, labelOf)}<div class="alt-tab">${altTab(a.pos)}</div></div>`;
  };
  const what = chord ? `Akkord ${name}` : `${src.label}: ${n} ${n === 1 ? 'Ton' : 'Töne'}`;
  const found = alts.length ? `${alts.length} ${chord ? (alts.length === 1 ? 'anderer Griff' : 'andere Griffe') : alts.length === 1 ? 'andere Lage' : 'andere Lagen'} gefunden.` : 'Mit dieser Griffweite gibt es keine andere Lage. Eine größere Griffweite oder einen kürzeren Bereich versuchen.';
  el.innerHTML = head + `<p class="muted small">${h(what)}. ${found}</p><div class="alt-list">${ui.alt.list.map(card).join('')}</div>`;
}
// Variante i anhören: als eigene freie Tonfolge im Tempo der Folge, gespielte Töne werden hervorgehoben.
// Ein zweiter Klick auf dieselbe Variante stoppt.
async function altPlay(i) {
  if (Player.isPlaying()) { const was = ui.altPlay; Player.stop(); if (was === i) return; }
  const a = ui.alt && ui.alt.list[i]; if (!a) return;
  const tmp = clone(doc), nb = newBlock('free'); nb.ref = null; nb.notes = altNotes(ui.alt.src, a.pos);
  tmp.blocks = [nb];
  ui.altPlay = i;
  try {
    // Die Wiedergabe meldet Ereignis-Schlüssel, die Karte kennt Tonnummern: Zuordnung vorab bauen
    const tc = computeDoc(tmp), kIdx = new Map();
    tc[0].measures.flatMap(m => m.events).filter(e => e.kind === 'note').forEach((e, j) => kIdx.set(e.k, j));
    await Player.start(tc, 0, {
      bpm: () => doc.bpm, countIn: () => false, loop: () => $('loop').checked, metronome: () => $('metro').checked,
      onNote: k => altHighlight(i, kIdx.get(k)), onStop: () => { altHighlight(null); ui.altPlay = null; if (prefs.view === 'alt') renderAlt(); status(''); }
    });
    renderAlt();
    status(`Spielt ${altWhere(a.pos).text}.`);
  } catch (err) { ui.altPlay = null; status(err.message); }
}
$('altView').addEventListener('click', e => {
  const sp = e.target.closest('[data-span]'); if (sp) { prefs.altSpan = +sp.dataset.span; savePrefs(); renderAlt(); return; }
  const pl = e.target.closest('[data-altplay]'); if (pl) { altPlay(+pl.dataset.altplay); return; }
  if (!ui.alt) return;
  const { src } = ui.alt;
  // Übernehmen: Griffe im Baustein ersetzen (nur freie Tonfolgen, rückgängig machbar)
  const us = e.target.closest('[data-altuse]');
  if (us) {
    const a = ui.alt.list[+us.dataset.altuse];
    commit(d => src.notes.forEach((ev, i) => { d.blocks[src.bi].notes[ev.fi].pos = a.pos[i].map(p => ({ s: p.s, f: p.f })); }));
    status(`Auf ${altWhere(a.pos).text} umgesetzt. Rückgängig mit Strg+Z.`);
    return;
  }
  // Als neue freie Tonfolge direkt hinter dem Quell-Baustein einfügen
  const ins = e.target.closest('[data-altins]');
  if (ins) {
    const a = ui.alt.list[+ins.dataset.altins];
    const base = src.bi >= 0 ? doc.blocks[src.bi] : cur(), ref = refOfBlock(base);
    const nb = newBlock('free', ref || undefined); if (!ref) nb.ref = null;
    nb.notes = altNotes(src, a.pos);
    nb.title = `${src.label.slice(0, 50)} · ab Bund ${altWhere(a.pos).lo}`;
    const at = src.bi >= 0 ? src.bi + 1 : sel.bi != null ? sel.bi + 1 : doc.blocks.length;
    commit(d => d.blocks.splice(at, 0, nb));
    status(`Als Baustein ${at + 1} eingefügt, im Editor zu sehen.`);
  }
});
$('viewSwitch').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (ui.altPlay != null) Player.stop();
  prefs.view = b.dataset.v; savePrefs(); renderView();
});

// ---------- Farbschema ----------
$('themeBtn').onclick = () => {
  const now = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', now); prefs.theme = now; savePrefs();
};

// Höhe der Wiedergabeleiste für den unteren Abstand
const dock = document.querySelector('.dock');
const setDockVar = () => document.documentElement.style.setProperty('--dock-h', dock.offsetHeight + 'px');
if (window.ResizeObserver) new ResizeObserver(setDockVar).observe(dock);
setDockVar();

refresh();
})();
