// Stacks from photos (SC-R70 to SC-R75): stack changes in the proposals Photo Ctrl's skill writes to the data repo
// (PH-R90 to PH-R93). Boxes are named by ID, or by a ref Tool Ctrl filled in with `added` when it made the box.
// No page code: tested on made-up records.
import { getC, isBox, moveBox, badJoints, stackHeight, modelOf } from './core.js';

export const PROPOSALS_DIR = 'proposals';
const RANK = { Sure: 0, Likely: 1, Guess: 2 };
const sureOf = (v) => (v && v.sure in RANK ? v.sure : 'Guess');

// where a box in the stack shows in the photos, from the change that named it (SC-R75, PH-R115)
function whereOf(prop, b) {
  for (const ch of prop.changes || []) {
    if (b.ref && ch.type === 'newBox' && ch.ref === b.ref) return ch.where || [];
    if (b.box && ch.type === 'model' && ch.box === b.box) return ch.where || [];
    if (b.box && ch.type === 'items' && ch.box === b.box && ch.where?.length) return ch.where;
  }
  return b.where || [];
}

// SC-R70: every waiting stack change, ready when all its boxes are in the record
export function proposedStacks(rec, files) {
  const out = [];
  for (const f of files) {
    const prop = f.json;
    if (!prop || +prop.format > 1 || prop.status === 'Declined') continue;
    (prop.changes || []).forEach((ch, ci) => {
      if (ch.type !== 'stack' || ch.status) return;
      const boxes = (ch.boxes || []).map((b) => {
        const id = b.box || prop.added?.[b.ref] || '';
        const c = id ? getC(rec, id) : null;
        return { id, ref: b.ref || '', sure: sureOf(b), ok: !!c && isBox(c), where: whereOf(prop, b) };
      });
      const missing = boxes.filter((b) => !b.ok);
      out.push({ file: f, ci, set: prop.set, on: ch.on?.value || '', onSure: sureOf(ch.on), boxes, ready: boxes.length > 1 && !missing.length,
        waitingFor: missing.map((b) => b.id || b.ref) });
    });
  }
  return out.sort((a, b) => (b.ready - a.ready) || (a.set < b.set ? -1 : 1)); // ready to accept first
}

// SC-R71, SC-R74: the proposed stack's height and any joint that won't lock
export function check(rec, ids) {
  const st = { cart: '', boxes: ids };
  return { height: stackHeight(rec, st), bad: badJoints(rec, st) };
}

// SC-R72: other boxes of the same model that could take a place
export function swapsFor(rec, ids, i) {
  const c = getC(rec, ids[i]); if (!c) return [];
  const m = modelOf(c).id; if (!m) return [];
  return rec.containers.filter((x) => isBox(x) && x.id !== c.id && !ids.includes(x.id) && modelOf(x).id === m).map((x) => x.id);
}

// SC-R73: build the stack as a set of drags would: each box out of where it is, the bottom on the floor,
// each next one on the one below. Returns { ok, why, undo, touched }; nothing changes when it fails.
export function applyStack(rec, ids, location = '') {
  const { bad } = check(rec, ids);
  if (bad.length) return { ok: false, why: `${bad[0].upper} can't sit on ${bad[0].lower}: ${bad[0].why}` };
  const done = [], touched = new Set();
  const step = (id, to) => {
    const r = moveBox(rec, id, to);
    if (!r.ok) throw new Error(`${id}: ${r.why}`);
    done.push(r); r.touched.forEach((t) => touched.add(t));
  };
  const undo = () => { for (const r of done.slice().reverse()) r.undo(); };
  try {
    for (const id of ids) step(id, { tray: true });
    step(ids[0], { floor: true });
    if (location) { const b = getC(rec, ids[0]); b.location = location; }
    for (let i = 1; i < ids.length; i++) step(ids[i], { on: ids[i - 1] });
  } catch (e) { undo(); return { ok: false, why: e.message }; }
  return { ok: true, undo, touched: [...touched] };
}

// PH-R92: the stack change gets its own status; the file stays as the record of what was proposed
export function markStack(prop, ci, status, today, ids = []) {
  const changes = (prop.changes || []).map((ch, i) => (i === ci ? { ...ch, status, reviewed: today, ...(ids.length ? { stacked: ids } : {}) } : ch));
  return { ...prop, changes };
}
