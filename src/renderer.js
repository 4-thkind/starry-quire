// Book layout (page-flip indices): 0 = front cover, 1-2 = index spread,
// 3.. = note pages (note i -> book page NOTE0 + i), last = back cover.
// Page turning, curl, shadows and drag physics come from StPageFlip (MIT, vendor/page-flip.js).
const LINE = 40, HEAD = 70, BOTTOM = 56;   // keep in sync with style.css
const NOTE0 = 3, AHEAD = 4;                 // blank pages kept ready after the last written one
const $ = s => document.querySelector(s);

let pages = [];      // [{date, id, heading, body}] in book order
let pf = null;       // PageFlip instance
let els = [];        // page elements handed to page-flip, in book order
let noteCount = 0;   // note pages currently in the book (always even)
let coilMode = '';

const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const toDate = s => new Date(s + 'T00:00');
const shortDate = s => toDate(s).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isBlank = p => !p.body.replace(/<[^>]*>|&nbsp;/g, '').trim();
const even = n => n + (n % 2);

// Index topic = first heading on the page, else its first line of text.
function topicOf(p) {
  const d = document.createElement('div');
  d.innerHTML = p.body;
  const h = d.querySelector('h1,h2');
  const first = [...d.childNodes].map(n => n.textContent.trim()).find(Boolean);
  return ((h && h.textContent.trim()) || first || '(untitled)').slice(0, 80);
}

// ---------- data ----------
async function init() {
  const notes = await window.api.load();
  Object.keys(notes).filter(d => Array.isArray(notes[d])).sort().forEach(d =>
    notes[d].forEach(n => {
      let body = n.body || '';
      // pages from the older version kept the heading in a separate box: fold it into the page
      if (n.heading && n.heading.trim()) body = `<h1>${esc(n.heading.trim())}</h1>` + body;
      pages.push({ date: d, id: n.id, heading: '', body });
    }));
  pages = pages.filter(p => !isBlank(p));
  noteCount = even(Math.max(pages.length + AHEAD, 6));
  bind();
  createBook(0);
}

function toNotes() {
  const out = {};
  pages.forEach(p => (out[p.date] ||= []).push({ id: p.id, heading: p.heading, body: p.body }));
  return out;
}

let saveT = null;
function queueSave() {
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    await window.api.save(toNotes());
    refreshIndex();
    const s = $('#saved'); s.classList.add('show');
    setTimeout(() => s.classList.remove('show'), 900);
  }, 400);
}

// read a note page's DOM back into the model
function capture(el) {
  if (!el || el.dataset.i === undefined) return;
  const i = +el.dataset.i;
  const body = el.querySelector('.lines').innerHTML;
  if (i >= pages.length && !body.trim()) return;
  while (pages.length <= i) pages.push({
    date: todayStr(), id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), heading: '', body: ''
  });
  pages[i].body = body;
}

// ---------- building the book ----------
function div(cls, density, html = '') {
  const el = document.createElement('div');
  el.className = cls; el.dataset.density = density; el.innerHTML = html;
  return el;
}

function notePage(i) {   // note i sits at book page NOTE0+i: even i -> left page, odd -> right
  const el = div('page ' + (i % 2 ? 'right' : 'left'), 'soft',
    `<div class="lines" contenteditable="true" spellcheck="false"></div><div class="pg-num">${i + 1}</div>`);
  el.dataset.i = i;
  el.querySelector('.lines').innerHTML = pages[i] ? pages[i].body : '';
  return el;
}

function buildEls() {
  return [
    div('page cover', 'hard', '<div class="cover-label"><span>Notes</span></div>'),
    div('page left index', 'soft'),
    div('page right index', 'soft'),
    ...Array.from({ length: noteCount }, (_, i) => notePage(i)),
    div('page backcover', 'hard', '<div class="back-art"></div>')
  ];
}

function createBook(start) {
  if (pf) pf.destroy();   // destroy() also removes #book, so make a fresh one
  if (!$('#book')) $('#bookwrap').insertAdjacentHTML('afterbegin', '<div id="book"></div>');
  const pw = Math.floor(innerWidth / 2), H = innerHeight;
  // keep "Notes" on the cover's torn-paper label whatever the window shape
  const s = Math.max(1, (pw / H) / (736 / 1308));
  document.documentElement.style.setProperty('--lt', (9 * s).toFixed(2) + '%');
  document.documentElement.style.setProperty('--lh', (19.4 * s).toFixed(2) + '%');
  els = buildEls();
  pf = new St.PageFlip($('#book'), {
    width: pw, height: H, size: 'stretch', minWidth: 200, maxWidth: pw, minHeight: 200, maxHeight: H,
    showCover: true, usePortrait: false, autoSize: true,
    flippingTime: 900, drawShadow: true, maxShadowOpacity: 1,
    disableFlipByClick: true, startPage: start
  });
  pf.on('changeState', e => {
    if (e.data === 'flipping' || e.data === 'user_fold') { setCoil('spread'); placeBook('spread'); }
    if (e.data === 'read') settle();
  });
  pf.loadFromHTML(els);
  mountCoil();
  refreshIndex();
  settle();
}

// after every turn: spiral style, centring of a closed book, and topping up blank pages
function settle() {
  const c = pf.getCurrentPageIndex(), last = pf.getPageCount() - 1;
  const mode = c === 0 ? 'front' : c >= last ? 'back' : 'spread';
  setCoil(mode);
  placeBook(mode);
  if (mode === 'spread' && c >= NOTE0 + noteCount - AHEAD) grow();
}

// The spiral lives inside page-flip's block, between the resting pages (z 1-3) and the page being
// turned (z 5): a lifted page passes over the rings instead of sliding under them.
// page-flip empties the block whenever it reloads pages, so put the spiral back each time.
const coilEl = document.querySelector('#coil');
function mountCoil() { document.querySelector('.stf__block').appendChild(coilEl); }

function placeBook(mode) {   // a closed book sits in the middle of the desk, not off to one side
  $('#bookwrap').style.transform = mode === 'front' ? 'translateX(-25%)' : mode === 'back' ? 'translateX(25%)' : 'none';
}

// unlimited pages: add another spread pair of blank pages before the back cover
function grow() {
  const add = Array.from({ length: AHEAD }, (_, k) => notePage(noteCount + k));
  noteCount += AHEAD;
  els.splice(els.length - 1, 0, ...add);
  pf.updateFromHtml(els);
  mountCoil();
}

function refreshIndex() {
  if (!els.length) return;
  els[1].innerHTML = indexHTML('left');
  els[2].innerHTML = indexHTML('right');
}

function indexHTML(side) {
  const cap = Math.max(3, Math.floor((innerHeight - HEAD - BOTTOM) / LINE));
  const rows = pages.map((p, i) => isBlank(p) ? '' :
    `<div class="idx-row" data-go="${i}"><span class="idx-date">${shortDate(p.date)}</span>` +
    `<span class="idx-topic">${esc(topicOf(p))}</span>` +
    `<span class="idx-dots"></span><span class="idx-pg">${i + 1}</span></div>`).filter(Boolean);
  const hdr = '<div class="idx-row hdr"><span class="idx-date">Date</span><span class="idx-topic">Topic</span>' +
    '<span class="idx-dots"></span><span class="idx-pg">Page</span></div>';
  if (side === 'left') {
    const body = rows.length ? rows.slice(0, cap - 1).join('')
      : '<div class="idx-row hdr">nothing yet — turn the page to start writing →</div>';
    return `<div class="pg-head"><div class="idx-title">Index</div></div><div class="lines">${hdr}${body}</div>`;
  }
  const rest = rows.slice(cap - 1);   // continues on the right page (scrolls if it ever overflows)
  return `<div class="pg-head"><div class="idx-title">Index <span class="contd">contd.</span></div></div>` +
    `<div class="lines">${hdr}${rest.join('')}</div>`;
}

// ---------- spiral wire (SVG, drawn over the spine) ----------
const METAL = `<stop offset="0" stop-color="#fbfcfd"/><stop offset=".35" stop-color="#c9cdd3"/>
  <stop offset=".7" stop-color="#868b93"/><stop offset="1" stop-color="#4d5259"/>`;
const HOLE = `<stop offset="0" stop-color="#000"/><stop offset=".65" stop-color="#1b1b1b"/><stop offset="1" stop-color="#3b3b3b"/>`;

function coilSVG(H, step, holes, wire) {
  const n = Math.floor((H - 30) / step), top = (H - (n - 1) * step) / 2;
  let h = '', w = '';
  for (let k = 0; k < n; k++) { const y = top + k * step; h += holes(y); w += `<path d="${wire(y)}"/>`; }
  return `<defs><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">${METAL}</linearGradient>
    <radialGradient id="hole">${HOLE}</radialGradient>
    <filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="1.8"/></filter></defs>
    <g fill="url(#hole)" stroke="rgba(0,0,0,.25)">${h}</g>
    <g fill="none" stroke="rgba(0,0,0,.45)" stroke-width="5" stroke-linecap="round" filter="url(#soft)" transform="translate(3 6)">${w}</g>
    <g fill="none" stroke="url(#metal)" stroke-width="4.6" stroke-linecap="round">${w}</g>
    <g fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.1" stroke-linecap="round" transform="translate(-.4 -1.3)">${w}</g>`;
}

function setCoil(mode) { if (mode !== coilMode) { coilMode = mode; drawCoil(); } }

function drawCoil() {
  const cx = Math.floor(innerWidth / 2), W = cx * 2, H = innerHeight, svg = coilEl;   // block = 2 pages wide
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if (coilMode === 'spread') {   // open: loops run from the left page's holes over the spine into the right page
    const lx = cx - 22, rx = cx + 22;
    svg.innerHTML = coilSVG(H, 24,
      y => `<ellipse cx="${lx}" cy="${y}" rx="4.5" ry="5"/><ellipse cx="${rx}" cy="${y + 4}" rx="4.5" ry="5"/>`,
      y => `M${lx} ${y} C ${lx + 1} ${y - 15}, ${rx - 1} ${y - 11}, ${rx} ${y + 4}`);
  } else {                       // closed: loops come out of the cover and wrap round its spine edge
    const m = coilMode === 'front' ? 1 : -1, x = d => cx + m * d;
    svg.innerHTML = coilSVG(H, 24,
      y => `<ellipse cx="${x(20)}" cy="${y}" rx="4.5" ry="5"/>`,
      y => `M${x(20)} ${y} C ${x(8)} ${y - 15}, ${x(-24)} ${y - 13}, ${x(-25)} ${y + 1} C ${x(-26)} ${y + 9}, ${x(-12)} ${y + 12}, ${x(0)} ${y + 10}`);
  }
}

// ---------- formatting (keyboard only) ----------
const HILITE = 'rgb(255, 236, 128)';
const exec = (cmd, val = null) => document.execCommand(cmd, false, val);
const inList = () => document.queryCommandState('insertUnorderedList') || document.queryCommandState('insertOrderedList');

// Chromium's formatBlock/list commands sometimes restore the caret one character early
// (lines containing spaces), so Enter would split the last letter off a heading.
// Record the selection as text offsets, run the command, and put it back if it drifted.
function textOffset(root, node, off) {
  const r = document.createRange(); r.setStart(root, 0); r.setEnd(node, off);
  return r.toString().length;
}
function pointAt(root, n) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let t, last = null;
  while ((t = w.nextNode())) { if (n <= t.length) return [t, n]; n -= t.length; last = t; }
  return last ? [last, last.length] : [root, root.childNodes.length];
}
function keepSelection(root, fn) {
  const s = getSelection();
  if (!s.rangeCount) return fn();
  const r0 = s.getRangeAt(0);
  const a = textOffset(root, r0.startContainer, r0.startOffset), b = textOffset(root, r0.endContainer, r0.endOffset);
  fn();
  if (!s.rangeCount) return;
  const r1 = s.getRangeAt(0);
  if (textOffset(root, r1.startContainer, r1.startOffset) === a && textOffset(root, r1.endContainer, r1.endOffset) === b) return;
  const [sn, so] = pointAt(root, a), [en, eo] = pointAt(root, b);
  const r = document.createRange(); r.setStart(sn, so); r.setEnd(en, eo);
  s.removeAllRanges(); s.addRange(r);
}

// the line (top-level block of the page) holding the caret
function caretLine(lines) {
  let n = getSelection().anchorNode;
  while (n && n.parentNode !== lines) n = n.parentNode;
  return n;
}

// Ctrl+Shift+H: first line of a page -> big title, any other line -> smaller sub-heading; again -> normal
function toggleHeading(lines) {
  const cur = document.queryCommandValue('formatBlock');
  if (cur === 'h1' || cur === 'h2') { exec('formatBlock', 'div'); return; }
  const line = caretLine(lines);
  const first = !line || [...lines.childNodes].find(n => n.textContent.trim() || n.nodeName !== '#text') === line;
  exec('formatBlock', first ? 'h1' : 'h2');
}

function toggleHighlight() {
  exec('styleWithCSS', true);
  const on = document.queryCommandValue('backColor') === HILITE;
  exec('hiliteColor', on ? 'transparent' : HILITE);
  exec('styleWithCSS', false);
}

function clearFormat() {
  exec('removeFormat');
  if (inList()) exec(document.queryCommandState('insertOrderedList') ? 'insertOrderedList' : 'insertUnorderedList');
  exec('formatBlock', 'div');
}

// typed shortcuts: -> → , <- ← , => ⇒ , <-> ↔ ; "- " / "* " starts bullets, "1. " starts a numbered list
const ARROWS = [['->', '→'], ['<-', '←'], ['=>', '⇒'], ['←>', '↔']];
function autoFormat() {
  const sel = getSelection();
  const node = sel.anchorNode, off = sel.anchorOffset;
  if (!node || node.nodeType !== 3) return;
  const before = node.data.slice(0, off).replace(/ /g, ' ');
  const swap = (len, text) => {
    const r = document.createRange(); r.setStart(node, off - len); r.setEnd(node, off);
    sel.removeAllRanges(); sel.addRange(r);
    exec('insertText', text);
  };
  for (const [a, b] of ARROWS) if (before.endsWith(a)) return swap(a.length, b);
  if (node.previousSibling || inList() || !['- ', '* ', '1. '].includes(before)) return;
  // make the list while the marker text still holds the line open, then drop the marker
  // (an emptied line collapses and the browser would list the line above instead)
  const lines = node.parentElement.closest('.lines');
  keepSelection(lines, () => exec(before === '1. ' ? 'insertOrderedList' : 'insertUnorderedList'));
  const n = sel.anchorNode, o = sel.anchorOffset;
  if (n && n.nodeType === 3 && o >= before.length && n.data.slice(o - before.length, o).replace(/ /g, ' ') === before) {
    const r = document.createRange(); r.setStart(n, o - before.length); r.setEnd(n, o);
    sel.removeAllRanges(); sel.addRange(r);
    exec('delete');
  }
}

// ---------- input ----------
const next = () => pf.flipNext('bottom');
const prev = () => pf.flipPrev('bottom');

function bind() {
  $('#next').onclick = next;
  $('#prev').onclick = prev;
  $('#toc').onclick = () => pf.flip(1, 'bottom');

  const wrap = $('#bookwrap');
  // page-flip treats every press on the book as the start of a page drag and cancels it.
  // Presses on the writing area, index rows and the cover must stay ours: caret, selection, clicks.
  const keep = e => { if (e.target.closest('.lines[contenteditable], .idx-row, .cover')) e.stopPropagation(); };
  wrap.addEventListener('mousedown', keep, true);
  wrap.addEventListener('touchstart', keep, true);

  wrap.addEventListener('click', e => {
    if (e.target.closest('.cover') && pf.getCurrentPageIndex() === 0) return next();
    const r = e.target.closest('.idx-row[data-go]');
    if (r) pf.flip(NOTE0 + +r.dataset.go, 'bottom');
  });
  wrap.addEventListener('input', e => {
    capture(e.target.closest('[data-i]'));
    queueSave();
    if (e.inputType === 'insertText') autoFormat();
  });
  wrap.addEventListener('paste', e => {          // paste as plain text so lines stay aligned
    if (!e.target.closest('.lines')) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  wrap.addEventListener('keydown', e => {
    const lines = e.target.closest && e.target.closest('.lines[contenteditable]');
    if (!lines) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const fmt = ctrl && e.shiftKey ? {
      KeyH: () => toggleHeading(lines),
      KeyY: toggleHighlight,
      KeyX: () => exec('strikeThrough'),
      Digit8: () => exec('insertUnorderedList'),
      Digit7: () => exec('insertOrderedList')
    }[e.code] : ctrl && e.code === 'Backslash' ? clearFormat : null;
    if (fmt) { e.preventDefault(); keepSelection(lines, fmt); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (inList()) exec(e.shiftKey ? 'outdent' : 'indent'); else exec('insertText', '    ');
    }
  });

  $('#help').onclick = () => $('#keys').classList.toggle('hidden');
  $('#keys').onclick = () => $('#keys').classList.add('hidden');
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'Slash') { e.preventDefault(); $('#keys').classList.toggle('hidden'); return; }
    if (e.key === 'PageDown') { e.preventDefault(); next(); return; }
    if (e.key === 'PageUp') { e.preventDefault(); prev(); return; }
    if (e.target.closest && e.target.closest('input,[contenteditable]')) return;
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'Home') pf.flip(1, 'bottom');
    if (e.key === 'Escape') pf.flip(0, 'bottom');
  });

  // two-finger trackpad swipe: one turn per gesture, ignore momentum tail
  let acc = 0, locked = false, quiet = null;
  window.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    clearTimeout(quiet);
    quiet = setTimeout(() => { acc = 0; locked = false; }, 220);
    if (locked) return;
    acc += e.deltaX;
    if (Math.abs(acc) > 60) { locked = true; acc > 0 ? next() : prev(); }
  }, { passive: true });

  let rz = null;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => { coilMode = ''; createBook(pf.getCurrentPageIndex()); }, 200);
  });

  // flush synchronously on quit so the last keystrokes are never lost
  window.addEventListener('beforeunload', () => {
    clearTimeout(saveT);
    window.api.saveSync(toNotes());
  });
}

init();
