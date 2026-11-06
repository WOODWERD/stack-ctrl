// Stack Ctrl page. Rules live in core.js; this file draws them and handles drag and drop.
import * as s from './core.js';
import { loadRecord, patchContainers } from './store.js';
import { proposedStacks, check, swapsFor, applyStack, markStack, PROPOSALS_DIR } from './proposals.js';

const TOOL_CTRL = '../tool-ctrl/';
const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e[k] = v;
    else if (k === 'class') e.className = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(3)) if (kid != null && kid !== false) e.append(kid instanceof Node ? kid : String(kid));
  return e;
}

// Tool Ctrl's See in Stack Ctrl link puts the box ID after the #, so it opens found (TC-R156, SC-R60)
const asked = (() => { try { return decodeURIComponent(location.hash.slice(1)).trim().slice(0, 20); } catch { return ''; } })();
const S = { rec: null, q: asked, loc: '', zoom: 'fit', sel: '', drag: null, note: null, undo: [], phone: false, updated: false,
  files: [], props: [], propI: 0, propIds: {}, propSel: -1, propPhoto: 0, propPics: null, propNote: null };
const rec = () => S.rec;
const chan = 'BroadcastChannel' in window ? new BroadcastChannel('tool-ctrl-record') : null; // SC-R06

// ---------- the front profile (SC-R12) ----------
function profile(m) {
  const out = [], H = m.h - (m.foot || 0), y = (mm) => `${Math.round(1000 * mm / H) / 10}%`;
  if (m.kind === 'none' || m.kind === 'cart') return out;
  const lid = m.kind === 'tb' ? 0 : 30;
  if (lid) out.push(['pl-lid', `top:${y(lid)}`]);
  if (m.kind !== 'tool') out.push(['pl-col', `top:${y(lid)};left:22%`], ['pl-col', `top:${y(lid)};left:78%`]);
  const nd = m.kind === 'combi' ? 1 : m.drawers;
  if (nd > 0) {
    const top0 = m.kind === 'combi' ? H - (H - lid) * 0.4 : lid, d = (H - top0) / nd;
    for (let i = 0; i < nd; i++) { const t = top0 + i * d; if (i > 0 || m.kind === 'combi') out.push(['pl-drw', `top:${y(t)}`]); out.push(['pl-hdl', `top:${y(t + d * 0.72)};height:${y(Math.min(14, d * 0.2))}`]); }
  } else if (m.gen === 'S3' && m.kind !== 'tool' && H >= 100) {
    out.push(['pl-pan', `top:${y(lid + 10)};bottom:${y(16)};left:3%`], ['pl-pan', `top:${y(lid + 10)};bottom:${y(16)};left:81%`]);
  } else if (m.gen !== 'S3' && m.kind !== 'tool' && H >= 100) {
    const n = H <= 135 ? 1 : H <= 190 ? 2 : H <= 240 ? 3 : H <= 340 ? 4 : 5, cy = lid + (H - lid) * 0.55;
    out.push(['pl-sub', `top:${y(lid + 14)};left:3%`], ['pl-sub', `top:${y(lid + 14)};left:81%`]);
    for (let i = 0; i < n; i++) { const t = cy + (i - (n - 1) / 2) * 9; out.push(['pl-rib', `top:${y(t)};left:3%`], ['pl-rib', `top:${y(t)};left:81%`]); }
  }
  if (m.kind !== 'tb') out.push(['pl-latch', `top:${y(Math.max(0, lid - 22))};height:${y(Math.min(46, H * 0.36))}`]);
  if (m.kind !== 'tool') out.push(['pl-clip', `bottom:0;height:${y(9)}`]);
  return out;
}

let K = 3; // mm per px
const px = (mm) => Math.max(1, Math.round(mm / K * 10) / 10);

function boxEl(c, addMm, { hit = false, bad = '', check = false } = {}) {
  const m = s.modelOf(c), w = px(s.widthOf(m)), hh = px(addMm);
  const cls = ['box', m.noModel && 'nomodel', c.id === S.sel && 'sel', hit && 'hit', bad && 'badj', check && !bad && 'chk', S.drag?.id === c.id && 'ghost'].filter(Boolean).join(' ');
  const el = h('button', { type: 'button', class: cls, style: `width:${w}px;height:${hh}px`, 'data-id': c.id,
    'aria-label': `${c.id} ${c.name || ''}, ${m.name}${bad ? `. ${bad}` : check ? '. Check this fit' : ''}`, title: bad || (check ? 'Check this fit: no source confirms these two lock this way' : ''),
    onclick: () => { if (S.justDragged) return; S.sel = S.sel === c.id ? '' : c.id; render(); document.querySelector(`[data-id="${c.id}"]`)?.focus(); }, // keep focus for the arrow keys (SC-R50)
    onkeydown: (e) => keyMove(e, c.id),
    onpointerdown: (e) => startDrag(e, c.id) },
  profile(m).map(([k, st]) => h('b', { class: k, style: st })),
  h('span', { class: 'bid' }, c.id),
  hh >= 34 && w >= 70 && h('span', { class: 'bnm' }, c.name || ''),
  hh >= 52 && w >= 70 && h('span', { class: 'bmd' }, m.noModel ? 'No model' : m.name),
  c.modelFrom === 'catalog' && !m.noModel && h('span', { class: 'fm', title: 'Model from the catalog. Check your box in Tool Ctrl' }));
  return el;
}
function cartEl(c) {
  const m = s.modelOf(c);
  return h('div', { class: `cart${c.id === S.sel ? ' sel' : ''}`, style: `width:${px(m.w)}px;height:${px(m.h)}px`, role: 'img', 'aria-label': `${c.id}, ${m.name}` },
    h('span', { class: 'deck' }), h('span', { class: 'wh l' }), h('span', { class: 'wh r' }));
}
// A drop place, lit when the carried box locks there (SC-S05)
function slot(target, w) {
  const d = S.drag; if (!d) return null;
  const c = s.getC(rec(), d.id), t = s.getC(rec(), target);
  if (!c || target === d.id) return null;
  const ok = s.canSit(c, t).ok && !rec().containers.some((x) => s.isBox(x) && x.sitsOn === target && x.id !== d.id && !s.canSit(x, c).ok);
  if (!ok) return null;
  return h('span', { class: `drop${d.over === target ? ' on' : ''}`, 'data-on': target, style: `width:${w}px` });
}
// The place under the bottom box of a floor stack: the carried box goes underneath and lifts the stack (SC-R40)
function slotUnder(bottom, w) {
  const d = S.drag; if (!d || d.id === bottom) return null;
  const c = s.getC(rec(), d.id), b = s.getC(rec(), bottom);
  if (!c || s.isCart(c) || !s.canSit(b, c).ok) return null;
  return h('span', { class: `drop${d.over === 'under:' + bottom ? ' on' : ''}`, 'data-under': bottom, style: `width:${w}px` });
}

// ---------- page ----------
function render() {
  const app = $('app'), r = rec();
  leds();
  if (!r) return app.replaceChildren(h('section', { class: 'tier' },
    h('div', { class: 'tier-h' }, h('span', { class: 'n' }, 1), h('h2', {}, 'Get started'), h('span', { class: 'tier-d' }, 'Stack Ctrl shows what Tool Ctrl records'), h('span', { class: 'tier-s idle' }, 'No record on this device')),
    h('div', { class: 'pad' },
      h('p', { style: 'margin:0;max-width:62ch' }, "Stack Ctrl shows the Systainers you record in Tool Ctrl, drawn to scale, and lets you arrange them into stacks. There's no Tool Ctrl record in this browser yet."),
      h('div', { class: 'row' }, h('a', { class: 'key go', href: TOOL_CTRL }, 'Open Tool Ctrl'), h('span', { class: 'small' }, 'Record your boxes there, with each Systainer\'s model, then come back.')),
      h('div', { class: 'health' }, h('b', {}, 'Nothing is created here'), h('span', {}, 'Stack Ctrl reads Tool Ctrl\'s record on this device and never starts one of its own. On another device, open Tool Ctrl first so it can sync your record from GitHub.')))));
  const L = s.layout(r);
  const total = L.stacks.reduce((n, x) => n + x.boxes.length, 0) + L.tray.length;
  if (!total) return app.replaceChildren(h('section', { class: 'tier' },
    h('div', { class: 'tier-h' }, h('span', { class: 'n' }, 1), h('h2', {}, 'Nothing to stack yet'), h('span', { class: 'tier-d' }, 'Systainers only'), h('span', { class: 'tier-s idle' }, '0 boxes')),
    h('div', { class: 'pad' },
      h('p', { style: 'margin:0;max-width:62ch' }, `Your Tool Ctrl record holds ${L.others} ${L.others === 1 ? 'container' : 'containers'}, but none is a Systainer, Sortainer, Systainer drawer unit, Systainer tool or Cart.`),
      h('div', { class: 'health' }, h('b', {}, 'To see a box here'), h('span', {}, 'In Tool Ctrl, set its kind of box to Systainer and pick its model, such as SYS3 M 187. Bags, Packouts and chests stay in Tool Ctrl only.')),
      h('div', { class: 'row' }, h('a', { class: 'key go', href: TOOL_CTRL }, 'Open Tool Ctrl')))));

  const locs = [...new Set(L.stacks.map((x) => x.location).filter(Boolean))].sort();
  const stacks = L.stacks.filter((x) => !S.loc || x.location === S.loc);
  const hits = new Set(s.findBoxes(r, S.q));
  // SC-R17: fit all to the screen, or 1 : 3; a phone draws 1 : 5 at least
  const tallest = Math.max(600, ...stacks.map((x) => x.height));
  K = S.zoom === 'fit' ? Math.max(S.phone ? 5 : 3, Math.ceil(tallest / (S.phone ? 360 : 480))) : (S.phone ? 5 : 3);
  const noModel = r.containers.filter((c) => s.isBox(c) && s.modelOf(c).noModel && !s.isCart(c));

  const col = (st) => {
    const bad = s.badJoints(r, st), badOf = (id) => bad.find((b) => b.upper === id)?.why || '';
    const ws = st.boxes.map((id) => px(s.widthOf(s.modelOf(s.getC(r, id)))));
    const topW = ws[ws.length - 1] || px(508);
    const kids = [];
    const top = st.boxes.length ? st.boxes[st.boxes.length - 1] : st.cart;
    kids.push(h('span', { class: 'hgt' }, s.mmText(st.height), h('small', {}, s.inches(st.height))));
    if (st.orderNotSet) kids.push(h('span', { class: 'tag', title: 'These boxes all sit on the same thing in Tool Ctrl. Drag one to set the order.' }, 'Order not set'));
    kids.push(slot(top, topW));
    for (let i = st.boxes.length - 1; i >= 0; i--) {
      const id = st.boxes[i], c = s.getC(r, id), m = s.modelOf(c);
      const below = i > 0 ? s.getC(r, st.boxes[i - 1]) : st.cart ? s.getC(r, st.cart) : null;
      kids.push(boxEl(c, s.addOf(m, i === 0 && !st.cart), { hit: hits.has(id), bad: badOf(id), check: below ? !!s.canSit(c, below).check : false }));
      if (i > 0) kids.push(slot(st.boxes[i - 1], ws[i - 1]));
      else if (!st.cart) kids.push(slotUnder(id, ws[0]));
    }
    if (st.cart) { if (st.boxes.length) kids.push(slot(st.cart, px(508))); kids.push(cartEl(s.getC(r, st.cart))); }
    else if (st.standsOn) kids.push(h('div', { class: 'block' }, st.standsOn));
    const base = st.cart ? s.getC(r, st.cart) : null;
    kids.push(h('span', { class: 'gl' }), h('span', { class: 'lab' }, h('b', { class: 'mono' }, base ? base.id : 'Floor'), h('small', {}, [base && s.modelOf(base).name, st.location || 'No location'].filter(Boolean).join(' · '))));
    return h('div', { class: `col${st.boxes.some((id) => hits.has(id)) ? ' found' : ''}` }, kids);
  };

  const floor = h('section', { class: 'tier' },
    h('div', { class: 'tier-h' }, h('span', { class: 'n' }, 1), h('h2', {}, 'Floor'), h('span', { class: 'tier-d' }, 'Stacks as they stand, to scale'), h('span', { class: `tier-s ${stacks.length ? 'ok' : 'idle'}` }, stacks.length ? `${stacks.length} ${stacks.length === 1 ? 'stack' : 'stacks'}` : 'No stacks yet')),
    h('div', { class: 'pad' },
      h('div', { class: 'fbar' },
        h('label', { class: 'search' }, h('input', { id: 'q', value: S.q, placeholder: 'Find a box by ID, name or model', 'aria-label': 'Find a box', oninput: (e) => { S.q = e.target.value; render(); const i = $('q'); i.focus(); i.setSelectionRange(S.q.length, S.q.length); } })),
        locs.length > 1 && h('select', { class: 'pick', 'aria-label': 'Location', onchange: (e) => { S.loc = e.target.value; render(); } }, h('option', { value: '' }, 'All locations'), locs.map((l) => h('option', { value: l, selected: l === S.loc }, l))),
        h('span', { class: 'segc', role: 'group', 'aria-label': 'Zoom' },
          h('button', { type: 'button', 'aria-pressed': String(S.zoom === 'fit'), onclick: () => { S.zoom = 'fit'; render(); } }, 'Fit all'),
          h('button', { type: 'button', 'aria-pressed': String(S.zoom !== 'fit'), onclick: () => { S.zoom = 'actual'; render(); } }, S.phone ? '1 : 5' : '1 : 3')),
        h('span', { class: 'small mono' }, `Scale 1 : ${K}`),
        !S.phone && h('button', { type: 'button', class: 'key', disabled: !S.undo.length, onclick: undo }, 'Undo'),
        h('span', { class: 'count' }, h('b', {}, total), ' boxes · ', h('b', {}, L.stacks.length), ' stacks')),
      S.note && h('div', { class: `health ${S.note.tone}` }, h('b', {}, S.note.title), h('span', {}, S.note.text)),
      S.drag && h('div', { class: 'health carry carrynote', role: 'status' }, h('b', {}, `Carrying ${S.drag.id}`), h('span', {}, 'Drop it on a lit place, on the floor to start a stack, or on the tray. Esc puts it back.')),
      noModel.length > 0 && !S.drag && h('div', { class: 'health warn' }, h('b', {}, `${noModel.length} ${noModel.length === 1 ? 'box has' : 'boxes have'} no model`), h('span', {}, `${noModel.slice(0, 4).map((c) => c.id).join(', ')}${noModel.length > 4 ? ' and more' : ''} ${noModel.length === 1 ? 'is' : 'are'} drawn as an outline at a standard height until you pick ${noModel.length === 1 ? 'its' : 'their'} Systainer model in Tool Ctrl.`), h('a', { class: 'key', href: TOOL_CTRL }, 'Set in Tool Ctrl')),
      S.q && h('p', { class: 'small', style: 'margin:0' }, hits.size ? `${hits.size} found: ${[...hits].map((id) => { const st = L.stacks.find((x) => x.boxes.includes(id)); return `${id} ${st ? `in the stack on ${st.cart || 'the floor'}${st.location ? `, ${st.location}` : ''}` : 'in the tray'}`; }).slice(0, 4).join(' · ')}` : `No box matches “${S.q}”.`),
      h('div', { class: `floorz${S.drag ? ' dragging' : ''}`, 'data-floor': '1' }, stacks.length ? stacks.map(col) : h('div', { class: 'emptyfloor', 'data-floor': '1' }, S.phone ? 'No stacks yet.' : 'Drag a box from the tray onto the floor to start a stack. Drop the next one on top of it.')),
      h('p', { class: 'small', style: 'margin:0' }, `Heights are from the floor. Each box adds its height without its foot; the bottom foot counts once, or sits in the cart.${L.others ? ` ${L.others === 1 ? 'One container that isn\'t a Systainer, such as a bag or Packout, isn\'t' : `${L.others} containers that aren't Systainers, such as bags and Packouts, aren't`} shown.` : ''}`)));

  const tray = h('section', { class: `tier${S.drag ? ' droptier' : ''}`, 'data-tray': '1' },
    h('div', { class: 'tier-h' }, h('span', { class: 'n' }, 2), h('h2', {}, 'Tray'), h('span', { class: 'tier-d' }, 'Boxes not in a stack'), h('span', { class: 'tier-s idle' }, `${L.tray.length} ${L.tray.length === 1 ? 'box' : 'boxes'}`)),
    h('div', { class: 'pad' },
      h('div', { class: `trayz${S.drag ? ' dragging' : ''}`, 'data-tray': '1' }, L.tray.length ? L.tray.map((id) => { const c = s.getC(r, id); return boxEl(c, s.modelOf(c).h, { hit: hits.has(id), bad: L.loops.includes(id) ? 'This box sat in a loop in the record' : '' }); }) : h('span', { class: 'small' }, 'Every box is in a stack.')),
      !S.phone && h('p', { class: 'small', style: 'margin:0' }, 'Drag a box onto the floor or a stack. Dragging a box back here takes it out of its stack; the boxes above close the gap. Arrow keys move a selected box up or down its stack.')));

  const main = h('div', { style: 'display:flex;flex-direction:column;gap:21px;min-width:0' }, proposalsArea(), floor, tray);
  app.replaceChildren(S.sel && s.getC(r, S.sel) ? h('div', { class: 'split' }, main, details(S.sel, L)) : main);
}

// SC-S08
function details(id, L) {
  const r = rec(), c = s.getC(r, id), m = s.modelOf(c);
  const st = L.stacks.find((x) => x.boxes.includes(id) || x.cart === id);
  const above = r.containers.find((x) => s.isBox(x) && x.sitsOn === id);
  const rd = (k, v) => h('div', {}, h('dt', {}, k), h('dd', {}, v));
  const i = st ? st.boxes.indexOf(id) : -1;
  return h('section', { class: 'tier' },
    h('div', { class: 'tier-h' }, h('span', { class: 'n' }, 3), h('h2', { class: 'mono' }, id), h('span', { class: 'tier-d' }, c.name || ''), c.modelFrom === 'catalog' && !m.noModel ? h('span', { class: 'tier-s warn' }, 'Check the model') : h('span', { class: 'tier-s ok' }, st ? 'In a stack' : 'In the tray')),
    h('div', { class: 'pad' },
      h('dl', { class: 'read' },
        rd('Model', h('span', { class: 'mono' }, m.name)),
        !m.noModel && rd('Size', h('span', { class: 'mono' }, `${s.widthOf(m)} × ${m.d || 296} × ${m.h}`)),
        i >= 0 && rd('Adds to its stack', h('span', { class: 'mono' }, s.mmText(s.addOf(m, i === 0 && !st.cart)))),
        st && rd('Stack height', h('span', { class: 'mono' }, `${s.mmText(st.height)} · ${s.inches(st.height)}`)),
        rd('Sits on', h('span', { class: 'mono' }, c.sitsOn ? `${c.sitsOn} · ${s.getC(r, c.sitsOn)?.name || ''}` : 'Nothing')),
        rd('On top of it', h('span', { class: 'mono' }, above ? `${above.id} · ${above.name}` : 'Nothing')),
        rd('Location', s.locationOf(r, id) || 'Not set'), rd('Kind of box', c.kindOfBox)),
      c.modelFrom === 'catalog' && !m.noModel && h('div', { class: 'health warn' }, h('b', {}, `Ships in ${m.name}. Check your box`), h('span', {}, 'Tool Ctrl filled this from the catalog. If yours came in another Systainer, change it in Tool Ctrl.')),
      m.noModel && h('div', { class: 'health warn' }, h('b', {}, 'No model'), h('span', {}, 'Drawn at a standard height. Pick its Systainer model in Tool Ctrl.')),
      h('div', { class: 'row' }, h('a', { class: 'key', href: TOOL_CTRL }, 'Open in Tool Ctrl'),
        !S.phone && st && !s.isCart(c) && h('button', { type: 'button', class: 'key', onclick: () => move(id, { tray: true }) }, 'Move to tray'),
        h('span', { class: 'sp' }), h('button', { type: 'button', class: 'key', onclick: () => { S.sel = ''; render(); } }, 'Close')),
      h('p', { class: 'small', style: 'margin:0' }, 'Name, model and contents change in Tool Ctrl. Stack Ctrl changes only where a box sits.')));
}


// ---------- Stacks from photos (SC-S10, SC-R70 to SC-R75) ----------
// Stack changes from the proposals in the data repo, read with Tool Ctrl's connection in this browser.
// Photos come from the photo repo through Photo Ctrl's connection, held only while shown.
const b64text = (t) => { const u = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
const fromB64 = (b) => { const s = atob(String(b).replace(/\s/g, '')); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
function gh(repo, token) {
  const call = async (path, opts = {}) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { ...opts, cache: 'no-store', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
      let json = null; try { json = await r.json(); } catch { /* empty */ }
      return { status: r.status, json };
    } catch { return { status: 0 }; }
  };
  return {
    async list(path) { const r = await call(`/contents/${path}`); return r.status === 200 && Array.isArray(r.json) ? r.json.filter((e) => e.type === 'file') : []; },
    async read(path) { const r = await call(`/contents/${path}`); return r.status === 200 ? { text: new TextDecoder().decode(fromB64(r.json.content)), sha: r.json.sha } : null; },
    async write(path, text, sha, message) { const r = await call(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: b64text(text), sha }) }); return r.status === 200 || r.status === 201 ? r.json.content.sha : null; },
    async blob(sha) { const r = await call(`/git/blobs/${sha}`); return r.status === 200 ? fromB64(r.json.content) : null; },
  };
}
const toolConn = () => { try { const o = JSON.parse(localStorage.getItem('toolctrl.github')); return o && o.repo && o.token ? o : null; } catch { return null; } };
function photoConn() { // read only; never creates Photo Ctrl's store
  return new Promise((ok) => {
    let rq; try { rq = indexedDB.open('photo-ctrl'); } catch { ok(null); return; }
    rq.onupgradeneeded = () => rq.transaction.abort();
    rq.onerror = () => ok(null);
    rq.onsuccess = () => { const d = rq.result; if (!d.objectStoreNames.contains('meta')) { d.close(); ok(null); return; }
      const g = d.transaction('meta').objectStore('meta').get('conn'); g.onsuccess = () => { d.close(); ok(g.result?.repo ? g.result : null); }; g.onerror = () => { d.close(); ok(null); }; };
  });
}
async function loadProposals() {
  const conn = toolConn(); if (!conn || !rec()) return;
  const api = gh(conn.repo, conn.token), files = [];
  for (const f of (await api.list(PROPOSALS_DIR)).filter((x) => x.name.endsWith('.json'))) {
    const t = await api.read(f.path); if (!t) continue;
    try { files.push({ path: f.path, sha: t.sha, json: JSON.parse(t.text) }); } catch { /* not a proposal */ }
  }
  S.files = files; refreshProps(); render();
}
function refreshProps() {
  const key = S.props[S.propI] && `${S.props[S.propI].set}:${S.props[S.propI].ci}`;
  S.props = proposedStacks(rec(), S.files);
  const i = S.props.findIndex((p) => `${p.set}:${p.ci}` === key);
  if (i < 0) { S.propI = 0; dropPics(); S.propSel = -1; } else S.propI = i;
}
function dropPics() { for (const u of S.propPics?.urls || []) if (u) URL.revokeObjectURL(u); S.propPics = null; }
async function loadPics(p) {
  const conn = await photoConn(), repo = p.file.json.photoRepo;
  if (!conn || conn.repo !== repo) { S.propPics = { none: true, repo }; render(); return; }
  S.propPics = { loading: true, urls: [] };
  const api = gh(conn.repo, conn.token);
  const files = (await api.list(`sets/${p.set}`)).filter((f) => /^\d+\.jpg$/.test(f.name)).sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10));
  const urls = [];
  for (const f of files) { const b = await api.blob(f.sha); urls.push(b ? URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })) : null); }
  if (S.props[S.propI] !== p) { urls.forEach((u) => u && URL.revokeObjectURL(u)); return; }
  S.propPics = { urls, none: !urls.length, gone: !urls.length, repo }; render();
}
const idsOf = (p) => S.propIds[`${p.set}:${p.ci}`] || p.boxes.map((b) => b.id);
const SURE = { Sure: 's', Likely: 'l', Guess: 'g' };
function shotEl(url, b) {
  const shot = h('div', { class: 'shot' }, h('img', { src: url, alt: `Photo ${S.propPhoto + 1} of the stack` }));
  const w = b?.where?.find((x) => x.photo === S.propPhoto + 1);
  const pts = (w?.outline || []).map(([x, y]) => [Math.min(1, Math.max(0, x)) * 100, Math.min(1, Math.max(0, y)) * 100]);
  if (pts.length >= 3) { // SC-R75
    const list = pts.map((q) => q.map((n) => +n.toFixed(2)).join(',')).join(' ');
    const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sv.setAttribute('viewBox', '0 0 100 100'); sv.setAttribute('preserveAspectRatio', 'none'); sv.setAttribute('aria-hidden', 'true');
    sv.innerHTML = `<path d="M0 0H100V100H0Z M${list.replace(/ /g, ' L')} Z" fill="rgba(12,11,9,.55)" fill-rule="evenodd"/><polygon points="${list}" fill="none" stroke="#0C0B09" stroke-width="5" vector-effect="non-scaling-stroke"/><polygon points="${list}" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="${b.sure === 'Guess' ? '7 5' : 'none'}" vector-effect="non-scaling-stroke"/>`;
    shot.append(sv);
    const top = Math.min(...pts.map((q) => q[1])), bottom = Math.max(...pts.map((q) => q[1])), left = Math.min(...pts.map((q) => q[0]));
    shot.append(h('span', { class: `hlt${top < 8 ? ' below' : ''}`, style: `left:${Math.max(1, left)}%;top:${top < 8 ? bottom : top}%` }, `${b.id} · ${s.getC(rec(), b.id)?.name || ''} · ${b.sure}`));
  }
  return shot;
}
function proposalsArea() {
  if (!S.props.length) return null;
  const n = S.props.length;
  if (S.phone) return h('div', { class: 'health warn' }, h('b', {}, `${n} proposed ${n === 1 ? 'stack' : 'stacks'} from photos`), h('span', {}, 'Review them on a computer or iPad.'));
  const p = S.props[S.propI], r = rec(), ids = idsOf(p);
  if (p.ready && !S.propPics) loadPics(p);
  const boxes = p.boxes.map((b, i) => ({ ...b, id: ids[i] }));
  const sel = boxes[S.propSel] || null;
  const { height, bad } = p.ready ? check(r, ids) : { height: 0, bad: [] };
  const badOf = (id) => bad.find((x) => x.upper === id)?.why || '';
  // the proposed stack, drawn to scale from the bottom up (SC-R71)
  const col = p.ready && h('div', { class: 'col' }, h('span', { class: 'hgt' }, s.mmText(height), h('small', {}, s.inches(height))),
    boxes.slice().reverse().map((b) => {
      const i = boxes.indexOf(b), c = s.getC(r, b.id), m = s.modelOf(c), add = s.addOf(m, i === 0);
      return h('div', { class: 'prow' },
        h('button', { type: 'button', class: `box prop${i === S.propSel ? ' sel' : ''}${badOf(b.id) ? ' badj' : ''}`, style: `width:${px(s.widthOf(m))}px;height:${px(add)}px`, title: badOf(b.id),
          'aria-label': `${b.id} ${c.name || ''}, ${m.name}, ${b.sure}${badOf(b.id) ? '. ' + badOf(b.id) : ''}`, onclick: () => { S.propSel = i; const w = b.where?.[0]; if (w) S.propPhoto = w.photo - 1; render(); } },
          h('span', { class: 'bid' }, b.id), px(add) >= 34 && h('span', { class: 'bnm' }, c.name || ''), px(add) >= 52 && h('span', { class: 'bmd' }, m.noModel ? 'No model' : m.name)),
        h('span', { class: `sure ${SURE[b.sure]}` }, b.sure));
    }),
    h('span', { class: 'gl' }), h('span', { class: 'lab' }, h('b', {}, 'Floor'), h('small', {}, p.on ? `Stood on a ${s.getModel(p.on)?.name || p.on} in the photo · ${p.onSure}` : 'Base not read')));
  const now = h('ul', { class: 'nowlist' }, boxes.map((b) => { const c = s.getC(r, b.id); const where = !c ? 'not in your record yet' : c.sitsOn ? `on ${c.sitsOn}` : c.standing ? 'on the floor' : 'in the tray'; return h('li', {}, h('b', { class: 'mono' }, b.id || b.ref), ` ${c?.name || ''} · ${where}`); }));
  const swaps = p.ready ? boxes.map((b, i) => ({ b, i, opts: swapsFor(r, ids, i) })).filter((x) => x.opts.length) : [];
  const pics = S.propPics || {};
  return h('section', { class: 'tier' },
    h('div', { class: 'tier-h' }, h('h2', {}, 'Proposed stacks'), h('span', { class: 'tier-d' }, 'From photos, drawn to scale'), h('span', { class: 'tier-s warn' }, `${n} waiting`)),
    h('div', { class: 'pad' },
      h('div', { class: 'row' }, h('b', {}, `Stack ${S.propI + 1} of ${n}`), h('span', { class: 'small mono' }, p.set), h('span', { class: 'sp' }),
        h('button', { type: 'button', class: 'key', disabled: S.propI === 0, onclick: () => goProp(S.propI - 1) }, '‹ Previous'),
        h('button', { type: 'button', class: 'key', disabled: S.propI >= n - 1, onclick: () => goProp(S.propI + 1) }, 'Next ›')),
      S.propNote && h('div', { class: `health ${S.propNote.tone}` }, h('b', {}, S.propNote.title), h('span', {}, S.propNote.text)),
      !p.ready ? h('div', { class: 'health' }, h('b', {}, 'Waiting for Tool Ctrl'), h('span', {}, `Some boxes in this stack aren't in your record yet. Add them in Tool Ctrl's From photos, then come back.`), h('a', { class: 'key', href: TOOL_CTRL }, 'Open Tool Ctrl'))
        : h('div', { class: 'split even' },
          h('div', { class: 'propdraw' }, col, h('div', { class: 'stack', style: 'gap:8px;min-width:0' }, h('h3', { class: 'micro' }, 'Where they are now'), now)),
          h('div', { class: 'stack', style: 'gap:8px;min-width:0' },
            pics.urls?.length ? shotEl(pics.urls[S.propPhoto] || pics.urls[0], sel) : h('div', { class: 'health' }, h('b', {}, pics.loading ? 'Getting the photo' : pics.gone ? 'The photo is gone' : 'Photo not shown here'), h('span', {}, pics.loading ? 'From your photo repo…' : pics.gone ? 'This set was deleted from the photo repo.' : `Connect Photo Ctrl to ${pics.repo || 'your photo repo'} in this browser to see the stack's photo.`)),
            pics.urls?.length > 1 && h('div', { class: 'row' }, pics.urls.map((u, i) => h('button', { type: 'button', class: 'key', 'aria-pressed': String(i === S.propPhoto), onclick: () => { S.propPhoto = i; render(); } }, `Photo ${i + 1}`))),
            h('p', { class: 'small', style: 'margin:0' }, 'Choose a box in the stack to see it in the photo.'))),
      bad.length > 0 && h('div', { class: 'health warn' }, h('b', {}, "That won't lock"), h('span', {}, `${bad[0].upper} can't sit on ${bad[0].lower}: ${bad[0].why} Swap a box or decline the stack.`)),
      swaps.length > 0 && h('div', { class: 'row' }, swaps.map(({ b, i, opts }) => h('label', { class: 'small' }, `Swap ${b.id} for `, h('select', { class: 'pick', onchange: (e) => { const next = ids.slice(); next[i] = e.target.value; S.propIds[`${p.set}:${p.ci}`] = next; render(); } },
        h('option', { value: b.id }, `${b.id} (as read)`), opts.map((o) => h('option', { value: o }, `${o} · ${s.getC(r, o)?.name || ''}`)))))),
      p.ready && h('div', { class: 'row' },
        h('button', { type: 'button', class: 'key go', disabled: bad.length > 0, onclick: () => acceptProp(p) }, 'Accept stack'),
        h('button', { type: 'button', class: 'key', onclick: () => declineProp(p) }, 'Decline'),
        h('span', { class: 'small' }, 'Accept moves each box as a drag would. One Undo puts them all back.'))));
}
function goProp(i) { dropPics(); S.propI = Math.max(0, Math.min(S.props.length - 1, i)); S.propSel = -1; S.propPhoto = 0; S.propNote = null; render(); }
async function writeProp(p, json, message) {
  const conn = toolConn(); if (!conn) return false;
  const sha = await gh(conn.repo, conn.token).write(p.file.path, JSON.stringify(json, null, 2) + '\n', p.file.sha, message);
  if (sha) { p.file.sha = sha; p.file.json = json; return true; }
  return false;
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
async function acceptProp(p) { // SC-R73
  const ids = idsOf(p), r = rec();
  const loc = ids.map((id) => s.locationOf(r, id)).find(Boolean) || '';
  const res = applyStack(r, ids, loc);
  if (!res.ok) { S.propNote = { tone: 'warn', title: "That won't lock", text: `${res.why} Nothing moved.` }; render(); return; }
  await save(res.touched);
  const prior = p.file.json;
  const ok = await writeProp(p, markStack(prior, p.ci, 'Accepted', today(), ids), `Stack Ctrl: accepted the stack from ${p.set}`);
  S.undo.push({ touched: res.touched, undo: () => { res.undo(); writeProp(p, prior, `Stack Ctrl: undo the stack from ${p.set}`).then(() => { refreshProps(); render(); }); } });
  S.note = { tone: 'ok', title: 'Stack accepted', text: `${ids.join(', ')} now stand bottom to top${loc ? ` at ${loc}` : ''}.${ok ? '' : ' The proposal file couldn\'t be marked; it may show again.'}` };
  refreshProps(); render();
}
async function declineProp(p) {
  if (!confirm(`Decline the stack from ${p.set}? Nothing moves. The proposal stays in your repo, marked Declined.`)) return;
  if (!(await writeProp(p, markStack(p.file.json, p.ci, 'Declined', today()), `Stack Ctrl: declined the stack from ${p.set}`))) { S.propNote = { tone: 'warn', title: 'Not saved', text: 'GitHub didn\'t take the change. Try again in a minute.' }; render(); return; }
  refreshProps(); render();
}

// ---------- moves, saved at once (SC-R42) ----------
async function move(id, to) {
  const res = s.moveBox(rec(), id, to);
  if (!res.ok) { S.note = { tone: 'warn', title: "That won't lock", text: `${res.why} ${id} stayed where it was.` }; render(); return; } // SC-R36
  S.note = null; S.undo.push(res); render();
  await save(res.touched);
}
async function save(ids) {
  const r = rec();
  try { await patchContainers(ids.map((id) => { const c = s.getC(r, id); return { id, sitsOn: c.sitsOn, location: c.location, standing: !!c.standing }; })); chan?.postMessage({ from: 'stack-ctrl', ids }); }
  catch { S.note = { tone: 'bad', title: 'Not saved', text: 'This browser refused to save. Reload Stack Ctrl and try again.' }; render(); }
}
async function undo() { const u = S.undo.pop(); if (!u) return; u.undo(); render(); await save(u.touched); } // SC-R44

// SC-R50: arrow keys move a focused box up or down its stack
function keyMove(e, id) {
  if (S.phone || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const L = s.layout(rec()), st = L.stacks.find((x) => x.boxes.includes(id)); if (!st) return;
  e.preventDefault();
  const i = st.boxes.indexOf(id);
  if (e.key === 'ArrowUp' && i < st.boxes.length - 1) move(id, { on: st.boxes[i + 1] });
  if (e.key === 'ArrowDown' && i > 1) move(id, { on: st.boxes[i - 2] });
  if (e.key === 'ArrowDown' && i === 1) move(id, st.cart ? { on: st.cart } : { under: st.boxes[0] });
  requestAnimationFrame(() => document.querySelector(`[data-id="${id}"]`)?.focus());
}

// ---------- drag and drop (SC-R40, SC-R51) ----------
function startDrag(e, id) {
  if (S.phone || e.button > 0) return;
  const c = s.getC(rec(), id); if (!c || s.isCart(c)) return;
  const x0 = e.clientX, y0 = e.clientY, src = e.currentTarget;
  let started = false, ghost = null;
  const moveH = (ev) => {
    if (!started) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; started = true; S.drag = { id, over: '' }; S.sel = ''; ghost = src.cloneNode(true); ghost.className += ' drag'; ghost.style.position = 'fixed'; ghost.style.pointerEvents = 'none'; ghost.style.zIndex = 50; document.body.append(ghost); render(); }
    ghost.style.left = `${ev.clientX - ghost.offsetWidth / 2}px`; ghost.style.top = `${ev.clientY - 12}px`;
    const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-on],[data-under]');
    const over = t ? (t.dataset.on || 'under:' + t.dataset.under) : '';
    if (over !== S.drag.over) { S.drag.over = over; document.querySelectorAll('.drop').forEach((d) => d.classList.toggle('on', (d.dataset.on || 'under:' + d.dataset.under) === over)); }
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', moveH); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', esc);
    if (!started) return;
    ghost?.remove(); S.justDragged = true; setTimeout(() => { S.justDragged = false; }, 50);
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    S.drag = null;
    const on = el?.closest('[data-on]'), under = el?.closest('[data-under]'), fl = el?.closest('[data-floor]'), tr = el?.closest('[data-tray]');
    const onBox = el?.closest('.box[data-id]');
    if (under) move(id, { under: under.dataset.under });
    else if (on) move(id, { on: on.dataset.on });
    else if (onBox && onBox.dataset.id !== id) move(id, { on: onBox.dataset.id }); // refused with its reason if it won't lock (SC-S06)
    else if (tr) move(id, { tray: true });
    else if (fl && !el.closest('.box')) move(id, { floor: true });
    else render();
  };
  const esc = (ev) => { if (ev.key === 'Escape') { ghost?.remove(); S.drag = null; window.removeEventListener('pointermove', moveH); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', esc); render(); } };
  window.addEventListener('pointermove', moveH); window.addEventListener('pointerup', up); window.addEventListener('keydown', esc);
}

function leds() {
  const l = $('ledRec'); if (!l) return;
  const t = !S.rec ? ['led', 'No Tool Ctrl record'] : S.updated ? ['led on-busy', 'Updated from Tool Ctrl'] : ['led on-ok', 'Synced by Tool Ctrl'];
  l.className = t[0]; l.querySelector('span').textContent = t[1];
}

// ---------- start ----------
const mq = matchMedia('(max-width:767px)');
S.phone = mq.matches; document.body.classList.toggle('ro', S.phone);
mq.addEventListener('change', () => { S.phone = mq.matches; document.body.classList.toggle('ro', S.phone); render(); });
async function load() { try { S.rec = await loadRecord(); } catch { S.rec = null; } }
// SC-S09: Tool Ctrl changed the record in another tab
chan?.addEventListener('message', async (e) => {
  if (e.data?.from === 'stack-ctrl' || S.drag) return;
  await load(); S.updated = true; S.undo = []; refreshProps(); render(); loadProposals();
  setTimeout(() => { S.updated = false; leds(); }, 3000);
});
await load();
render();
loadProposals(); // SC-R70
