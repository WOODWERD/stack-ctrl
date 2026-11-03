// Stack Ctrl rules. No page code here: everything in this file is tested by SC-A ID.
// It reads and writes Tool Ctrl's record (TC-R130 to TC-R144) and changes only sitsOn and location (SC-R42).
import { SYSTAINERS } from './systainers.js';

export const MODEL_KINDS = ['Systainer', 'Sortainer', 'Systainer drawer unit', 'Systainer tool', 'Cart']; // TC-R130
export const WIDTH = { M: 396, L: 508, MIDI: 496, XXL: 792, MAXI: 596, S: 265, MINI: 265, XXS: 105, MICRO: 105, other: 512 };
const BY_ID = new Map(SYSTAINERS.map((m) => [m.id, m]));
export const getModel = (id) => BY_ID.get(id) || null;

// ---------- the boxes ----------
export const isBox = (c) => c.status === 'active' && MODEL_KINDS.includes(c.kindOfBox); // SC-R04
export const getC = (rec, id) => rec.containers.find((c) => c.id === id);

// The model a box is drawn with. No model and Not listed draw M-sized (SC-R13); an ID this list
// doesn't know draws as Not listed (SC-R05, TC-E18).
export function modelOf(c) {
  if (c.model === 'other') return { id: 'other', name: c.modelOther?.name || 'Not listed', gen: 'other', fp: 'M', w: 396, h: c.modelOther?.h || 137, foot: 7, drawers: 0, kind: '', notListed: true };
  const m = c.model && getModel(c.model);
  if (m) return m;
  if (c.model) return { id: c.model, name: 'Not on this list', gen: 'other', fp: 'M', w: 396, h: 137, foot: 7, drawers: 0, kind: '', notListed: true };
  if (c.kindOfBox === 'Cart') return { id: '', name: 'Cart, no model', gen: 'cart', fp: 'cart', w: 508, h: 160, foot: 0, drawers: 0, kind: 'cart', noModel: true };
  return { id: '', name: 'No model', gen: 'none', fp: 'M', w: 396, h: 137, foot: 7, drawers: 0, kind: 'none', noModel: true };
}
export const isCart = (c) => c.kindOfBox === 'Cart' || modelOf(c).kind === 'cart';
export const widthOf = (m) => (m.fp === 'cart' ? m.w : WIDTH[m.fp] || m.w || 396);

// ---------- where a box is (TC-R13) ----------
export function rootOf(rec, id) {
  const seen = new Set();
  let c = getC(rec, id);
  while (c && c.sitsOn && !seen.has(c.id)) { seen.add(c.id); const up = getC(rec, c.sitsOn); if (!up) break; c = up; }
  return c;
}
export const locationOf = (rec, id) => rootOf(rec, id)?.location || '';

// ---------- locking (SC-R30 to SC-R35) ----------
// Can `upper` lock on top of `lower`? { ok, why, check } — check marks a fit no source confirms.
export function canSit(upper, lower) {
  const u = modelOf(upper), l = modelOf(lower);
  if (isCart(upper)) return { ok: false, why: 'A cart goes at the bottom of a stack.' };
  if (['XXS', 'MICRO'].includes(u.fp) || ['XXS', 'MICRO'].includes(l.fp)) return { ok: false, why: 'That box is too small to stack.' };
  if (u.fp === 'other' || (l.fp === 'other' && !isCart(lower))) return { ok: false, why: `${u.fp === 'other' ? u.name : l.name} doesn't stack in this version.` };
  if (isCart(lower)) {
    if (['S', 'MINI', 'MIDI', 'MAXI'].includes(u.fp)) return { ok: false, why: 'A cart takes Systainer³, T-Loc and Classic boxes, not Minis, Midis or Maxis.' };
    return { ok: true, check: u.noModel || u.notListed || l.noModel };
  }
  const small = (m) => m.fp === 'S' || m.fp === 'MINI';
  if (small(u) !== small(l)) return { ok: false, why: 'Minis and S boxes only stack with each other.' };
  if (l.kind === 'tb' && u.kind !== 'tb') return { ok: false, why: 'Nothing goes on a ToolBox but another ToolBox; its handle is in the way.' };
  if (l.kind === 'sb') return { ok: false, why: 'Nothing goes on a StorageBox; its handle is in the way.' };
  if (u.fp === 'MAXI' || l.fp === 'MAXI') return u.fp === l.fp ? { ok: true } : { ok: false, why: 'A Maxi only stacks with another Maxi here. Two boxes side by side are for a later version.' };
  if (u.fp === 'XXL' || l.fp === 'XXL') return u.fp === l.fp ? { ok: true } : { ok: false, why: 'An XXL only stacks with another XXL here. Side by side is for a later version.' };
  if (u.gen === 'C' && l.gen !== 'C' && !l.noModel && !l.notListed) return { ok: false, why: 'Classic boxes go underneath newer ones.' };
  const lm = (m) => (m.fp === 'L' ? 'L' : 'M');
  return { ok: true, check: lm(u) !== lm(l) || u.noModel || u.notListed || l.noModel || l.notListed };
}

// ---------- stacks from sitsOn (SC-R45) ----------
// A stack is a cart, or a box standing on nothing, with what sits on it. Several boxes on one thing,
// as older records allowed, are listed in ID order and marked orderNotSet.
export function layout(rec) {
  const boxes = rec.containers.filter(isBox);
  const ids = new Set(boxes.map((b) => b.id));
  const kids = new Map();
  for (const b of boxes) if (b.sitsOn) { if (!kids.has(b.sitsOn)) kids.set(b.sitsOn, []); kids.get(b.sitsOn).push(b.id); }
  for (const k of kids.values()) k.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const placed = new Set(), stacks = [];
  const chainFrom = (start) => {
    const list = [], seen = new Set();
    let order = true, q = [...(kids.get(start) || [])];
    if (q.length > 1) order = false;
    while (q.length) {
      const id = q.shift();
      if (seen.has(id) || placed.has(id)) continue;
      seen.add(id); list.push(id);
      const k = kids.get(id) || [];
      if (k.length > 1) order = false;
      q = [...k, ...q];
    }
    return { list, order };
  };
  const roots = boxes.filter((b) => !b.sitsOn || !ids.has(b.sitsOn) || b.sitsOn === b.id)
    .sort((a, b) => (locationOf(rec, a.id)).localeCompare(locationOf(rec, b.id)) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const tray = [];
  for (const r of roots) {
    const { list, order } = chainFrom(r.id);
    const cart = isCart(r);
    if (!cart && !list.length) { tray.push(r.id); placed.add(r.id); continue; }
    placed.add(r.id); list.forEach((x) => placed.add(x));
    const base = r.sitsOn && !ids.has(r.sitsOn) ? getC(rec, r.sitsOn) : null; // SC-E03
    stacks.push({ cart: cart ? r.id : '', boxes: cart ? list : [r.id, ...list], orderNotSet: !order, location: locationOf(rec, r.id), standsOn: base ? base.id : '' });
  }
  // SC-E02: anything left is in a loop; it goes to the tray, marked
  const loops = boxes.filter((b) => !placed.has(b.id)).map((b) => b.id);
  for (const s of stacks) s.height = stackHeight(rec, s);
  return { stacks, tray: [...tray, ...loops], loops, others: rec.containers.filter((c) => c.status === 'active' && !isBox(c)).length };
}

// ---------- height (SC-R20, SC-R21) ----------
// Each box adds its height without its foot; the bottom foot counts once, on the floor. On a cart the stack
// starts at the cart's top and the bottom foot sits in the cart.
export const addOf = (m, bottomOnFloor) => (bottomOnFloor ? m.h : m.h - (m.foot || 0));
export function stackHeight(rec, s) {
  let mm = s.cart ? modelOf(getC(rec, s.cart)).h : 0;
  s.boxes.forEach((id, i) => { mm += addOf(modelOf(getC(rec, id)), i === 0 && !s.cart); });
  return Math.round(mm * 10) / 10;
}
// Joints that break the locking rules, written before (SC-R46): [{ upper, lower, why }]
export function badJoints(rec, s) {
  const out = [], chain = s.cart ? [s.cart, ...s.boxes] : s.boxes;
  for (let i = 1; i < chain.length; i++) { const r = canSit(getC(rec, chain[i]), getC(rec, chain[i - 1])); if (!r.ok) out.push({ upper: chain[i], lower: chain[i - 1], why: r.why }); }
  return out;
}
const FR = ['', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8'];
export function inches(mm) { const t = Math.round(mm / 25.4 * 8); const r = t % 8; return `${Math.floor(t / 8)}${r ? ' ' + FR[r] : ''} in`; }
export const mmText = (mm) => `${Math.round(mm).toLocaleString('en-US')} mm`;

// ---------- moves (SC-R40 to SC-R44) ----------
// to: { tray: true } | { floor: true } | { on: id } — `on` puts the box directly on that box or cart, and whatever
// sat there now sits on the moved box. Boxes above the moved box close the gap. Returns { ok, why, undo }.
export function moveBox(rec, id, to) {
  const c = getC(rec, id);
  if (!c || !isBox(c)) return { ok: false, why: 'That box isn\'t in Stack Ctrl.' };
  const above = rec.containers.filter((x) => isBox(x) && x.sitsOn === id);
  let target = null, displaced = [];
  if (to.on) {
    target = getC(rec, to.on);
    if (!target || target.id === id) return { ok: false, why: 'A box can\'t sit on itself.' };
    const r = canSit(c, target);
    if (!r.ok) return { ok: false, why: r.why };
    displaced = rec.containers.filter((x) => isBox(x) && x.sitsOn === target.id && x.id !== id);
    for (const d of displaced) { const k = canSit(d, c); if (!k.ok) return { ok: false, why: `${d.id} can't sit on ${c.id}: ${k.why}` }; }
  }
  if (isCart(c) && !to.tray && !to.floor) return { ok: false, why: 'A cart goes at the bottom of a stack.' };
  const touched = new Set([id, ...above.map((x) => x.id), ...displaced.map((x) => x.id)]);
  const before = [...touched].map((t) => { const x = getC(rec, t); return [t, x.sitsOn, x.location]; });
  const was = locationOf(rec, id);
  // close the gap: the boxes above take this box's place
  for (const a of above) { a.sitsOn = c.sitsOn === a.id ? '' : c.sitsOn; if (!a.sitsOn) a.location = was; }
  if (to.on) {
    c.sitsOn = target.id;
    for (const d of displaced) d.sitsOn = id;
    c.location = locationOf(rec, target.id);
  } else { c.sitsOn = ''; c.location = was; } // SC-R43: a box sent to the tray or floor keeps its last location
  return { ok: true, undo: () => { for (const [t, s, l] of before) { const x = getC(rec, t); x.sitsOn = s; x.location = l; } }, touched: [...touched] };
}

// ---------- search (SC-R60) ----------
export function findBoxes(rec, q) {
  const w = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!w.length) return [];
  return rec.containers.filter(isBox).filter((c) => { const t = `${c.id} ${c.name} ${modelOf(c).name}`.toLowerCase(); return w.every((x) => t.includes(x)); }).map((c) => c.id);
}
