// Run: npm test. Made-up records only; no one's real equipment.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../site/core.js';

let n = 0;
const box = (rec, model, f = {}) => { const id = f.id || `WW-${String(++n).padStart(3, '0')}`; const c = { id, name: f.name || id, kindOfBox: f.kob || 'Systainer', model, sitsOn: f.on || '', location: f.loc || '', status: 'active', ...f.more }; rec.containers.push(c); return c; };
const fresh = () => { n = 0; return { meta: {}, containers: [], compartments: [], items: [] }; };

test('SC-A02 three boxes dropped into one stack stand 747 mm', () => {
  const r = fresh();
  const a = box(r, 'sys3-m-137'), b = box(r, 'sys3-m-187'), c = box(r, 'sys3-m-437');
  assert.ok(s.moveBox(r, c.id, { floor: true }).ok);
  assert.ok(s.moveBox(r, b.id, { on: c.id }).ok);
  assert.ok(s.moveBox(r, a.id, { on: b.id }).ok);
  const { stacks, tray } = s.layout(r);
  assert.equal(stacks.length, 1); assert.deepEqual(tray, []);
  assert.deepEqual(stacks[0].boxes, [c.id, b.id, a.id]);
  assert.equal(stacks[0].height, 747);
  assert.deepEqual([b.sitsOn, a.sitsOn], [c.id, b.id]);
});
test('SC-A03 taking the middle box out closes the gap', () => {
  const r = fresh();
  const c = box(r, 'sys3-m-437'), b = box(r, 'sys3-m-187', { on: 'WW-001' }), a = box(r, 'sys3-m-137', { on: 'WW-002' });
  assert.ok(s.moveBox(r, b.id, { tray: true }).ok);
  assert.deepEqual([a.sitsOn, b.sitsOn], [c.id, '']);
  assert.equal(s.layout(r).stacks[0].height, 567);
});
test('SC-A04 a box dropped on a cart takes the cart\'s location', () => {
  const r = fresh();
  const cart = box(r, 'sys-rb', { kob: 'Cart', loc: 'Shop wall', id: 'WW-030' });
  const b = box(r, 'sys3-m-187', { loc: 'Loft' });
  assert.ok(s.moveBox(r, b.id, { on: cart.id }).ok);
  assert.deepEqual([b.sitsOn, s.locationOf(r, b.id)], ['WW-030', 'Shop wall']);
  // SC-R21: on a cart the stack starts at its top; the bottom foot sits in the cart
  assert.equal(s.layout(r).stacks[0].height, 159 + 180);
});
test('SC-A05 a Classic box never goes on a newer one', () => {
  const r = fresh();
  const low = box(r, 'sys3-m-187'), cl = box(r, 'classic-2');
  const res = s.moveBox(r, cl.id, { on: low.id });
  assert.equal(res.ok, false); assert.equal(res.why, 'Classic boxes go underneath newer ones.');
  assert.equal(cl.sitsOn, '');
  assert.ok(s.moveBox(r, low.id, { on: cl.id }).ok); // newer on Classic is fine
});
test('SC-A06 nothing but a ToolBox goes on a ToolBox', () => {
  const r = fresh();
  const tb = box(r, 'sys3-tb-m-137'), m = box(r, 'sys3-m-187'), tb2 = box(r, 'sys3-tb-m-237');
  assert.equal(s.moveBox(r, m.id, { on: tb.id }).ok, false);
  assert.ok(s.moveBox(r, tb2.id, { on: tb.id }).ok);
});
test('SC-A07 S boxes and Minis only lock to each other', () => {
  const r = fresh();
  const m = box(r, 'sys3-m-187'), sm = box(r, 'sys3-s-76'), mini = box(r, 'sys-mini-1-tl');
  assert.equal(s.moveBox(r, sm.id, { on: m.id }).ok, false);
  assert.ok(s.moveBox(r, mini.id, { on: sm.id }).ok);
});
test('SC-A08 several boxes on one cart show as one stack, order not set', () => {
  const r = fresh();
  box(r, 'sys-rb', { kob: 'Cart', id: 'WW-068' });
  for (const m of ['sys3-m-337', 'sys3-m-237', 'sys3-m-187']) box(r, m, { on: 'WW-068' });
  const st = s.layout(r).stacks[0];
  assert.equal(st.orderNotSet, true); assert.deepEqual(st.boxes, ['WW-001', 'WW-002', 'WW-003']);
});
test('SC-A09 a box with no model draws M-sized and stacks marked to check', () => {
  const r = fresh();
  const a = box(r, ''), b = box(r, 'sys3-m-187');
  const m = s.modelOf(a);
  assert.deepEqual([m.noModel, m.fp, m.h], [true, 'M', 137]);
  assert.equal(s.canSit(b, a).check, true);
});
test('SC-A10 undo puts sitsOn and location back', () => {
  const r = fresh();
  const c = box(r, 'sys3-m-437', { loc: 'Shop' }), b = box(r, 'sys3-m-187', { on: 'WW-001' }), a = box(r, 'sys3-m-137', { loc: 'Truck' });
  const snap = JSON.stringify(r);
  const u1 = s.moveBox(r, a.id, { on: c.id }), u2 = s.moveBox(r, b.id, { tray: true }), u3 = s.moveBox(r, c.id, { tray: true });
  [u3, u2, u1].forEach((u) => u.undo());
  assert.equal(JSON.stringify(r), snap);
});
test('SC-A13 a move changes only sitsOn and location', () => {
  const r = fresh();
  const c = box(r, 'sys3-m-437', { more: { notes: 'n', kind: 'k', modelFrom: 'catalog' } }), a = box(r, 'sys3-m-137');
  const before = JSON.parse(JSON.stringify(r.containers));
  s.moveBox(r, a.id, { on: c.id });
  r.containers.forEach((x, i) => { const b = before[i]; for (const k of Object.keys(b)) if (!['sitsOn', 'location'].includes(k)) assert.deepEqual(x[k], b[k], k); });
});
test('SC-R04 only Systainer kinds show; others are counted', () => {
  const r = fresh();
  box(r, 'sys3-m-187'); box(r, '', { kob: 'Bag' }); box(r, '', { kob: 'Packout' });
  const l = s.layout(r);
  assert.deepEqual([l.tray.length, l.others], [1, 2]);
});
test('SC-R34 L on M is allowed and marked to check', () => {
  const r = fresh();
  const m = box(r, 'sys3-m-187'), l = box(r, 'sys3-l-187');
  const k = s.canSit(l, m);
  assert.deepEqual([k.ok, k.check], [true, true]);
});
test('SC-R12 inserting between boxes keeps the stack whole', () => {
  const r = fresh();
  const c = box(r, 'sys3-m-437'), a = box(r, 'sys3-m-137', { on: 'WW-001' }), x = box(r, 'sys3-m-187');
  assert.ok(s.moveBox(r, x.id, { on: c.id }).ok);
  assert.deepEqual(s.layout(r).stacks[0].boxes, [c.id, x.id, a.id]);
});
test('SC-E02 a loop goes to the tray', () => {
  const r = fresh();
  box(r, 'sys3-m-187', { on: 'WW-002' }); box(r, 'sys3-m-187', { on: 'WW-001' });
  const l = s.layout(r);
  assert.deepEqual(l.loops, ['WW-001', 'WW-002']);
});
test('SC-R22 heights read in mm and inches', () => {
  assert.equal(s.mmText(1159), '1,159 mm');
  assert.equal(s.inches(1159), '45 5/8 in');
});
test('SC-A14 one box dropped on the floor stands there as a stack, and back in the tray it leaves', () => {
  const r = fresh();
  const a = box(r, 'sys3-m-187');
  assert.deepEqual(s.layout(r).tray, [a.id]);
  assert.ok(s.moveBox(r, a.id, { floor: true }).ok);
  let l = s.layout(r);
  assert.deepEqual([l.stacks.length, l.stacks[0].height, l.tray.length], [1, 187, 0]);
  assert.ok(s.moveBox(r, a.id, { tray: true }).ok);
  l = s.layout(r);
  assert.deepEqual([l.stacks.length, l.tray], [0, [a.id]]);
});
test('SC-A15 taking the bottom box out leaves the rest standing on the floor', () => {
  const r = fresh();
  const c = box(r, 'sys3-m-437'), b = box(r, 'sys3-m-187', { on: 'WW-001' });
  assert.ok(s.moveBox(r, c.id, { tray: true }).ok);
  const l = s.layout(r);
  assert.deepEqual([l.stacks.length, l.stacks[0].boxes, b.standing], [1, [b.id], true]);
});
