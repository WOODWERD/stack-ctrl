// Stacks from photos (SC-R70 to SC-R75, SC-A14, SC-A15). Made-up records only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../site/core.js';
import { proposedStacks, check, swapsFor, applyStack, markStack } from '../site/proposals.js';

const box = (rec, id, model, f = {}) => { const c = { id, name: f.name || id, kindOfBox: f.kob || 'Systainer', model, sitsOn: f.on || '', location: f.loc || '', status: f.status || 'active' }; rec.containers.push(c); return c; };
const fresh = () => ({ meta: {}, containers: [], compartments: [], items: [] });
const file = (changes, extra = {}) => ({ path: 'proposals/x.json', sha: 's', json: { format: 1, set: '2026-11-05-1928-stack', status: 'Partly accepted', changes, ...extra } });

test('SC-A14 a proposed stack, all in the record, is built bottom to top with one Undo', () => {
  const r = fresh();
  box(r, 'WW-003', 'sys-2-tl', { loc: 'Shop' }); box(r, 'WW-011', 'sys-1-tl', { loc: 'Loft' }); box(r, 'WW-020', 'sys-1-tl');
  box(r, 'WW-030', 'sys-1-tl'); box(r, 'WW-020x', 'sys-1-tl', { on: 'WW-011' }); // something on WW-011 now
  const [p] = proposedStacks(r, [file([{ type: 'stack', boxes: [{ box: 'WW-003', sure: 'Sure' }, { box: 'WW-011', sure: 'Likely' }, { box: 'WW-020', sure: 'Guess' }] }])]);
  assert.equal(p.ready, true); assert.deepEqual(p.boxes.map((b) => b.sure), ['Sure', 'Likely', 'Guess']);
  const before = JSON.stringify(r.containers);
  const res = applyStack(r, p.boxes.map((b) => b.id), 'Shop');
  assert.ok(res.ok, res.why);
  const g = (id) => s.getC(r, id);
  assert.deepEqual([g('WW-003').sitsOn, g('WW-011').sitsOn, g('WW-020').sitsOn], ['', 'WW-003', 'WW-011']);
  const L = s.layout(r);
  assert.deepEqual(L.stacks.find((x) => x.boxes[0] === 'WW-003').boxes, ['WW-003', 'WW-011', 'WW-020']);
  assert.equal(g('WW-020x').sitsOn, ''); // what sat on WW-011 came off, as a drag would leave it
  res.undo();
  assert.equal(JSON.stringify(r.containers), before);
});

test('SC-A15, SC-R74 a Classic on a T-Loc is marked and refused', () => {
  const r = fresh();
  box(r, 'WW-001', 'sys-2-tl'); box(r, 'WW-002', 'classic-2');
  const c = check(r, ['WW-001', 'WW-002']);
  assert.equal(c.bad.length, 1); assert.equal(c.bad[0].upper, 'WW-002'); assert.match(c.bad[0].why, /Classic/);
  const res = applyStack(r, ['WW-001', 'WW-002']);
  assert.equal(res.ok, false); assert.equal(s.getC(r, 'WW-002').sitsOn, '');
});

test('SC-R70 a stack naming a new box waits until Tool Ctrl has added it, then reads its ID from added', () => {
  const r = fresh();
  box(r, 'WW-001', 'sys-2-tl');
  const changes = [{ type: 'newBox', ref: 'n1', name: { value: 'XL DOMINOS', sure: 'Sure' }, where: [{ photo: 1, outline: [[0, 0], [1, 0], [1, 1]] }] },
    { type: 'stack', boxes: [{ ref: 'n1', sure: 'Likely' }, { box: 'WW-001', sure: 'Sure' }] }];
  let [p] = proposedStacks(r, [file(changes, { status: 'Waiting' })]);
  assert.equal(p.ready, false); assert.deepEqual(p.waitingFor, ['n1']);
  box(r, 'WW-017', 'sys-1-tl');
  [p] = proposedStacks(r, [file(changes, { added: { n1: 'WW-017' } })]);
  assert.equal(p.ready, true); assert.deepEqual(p.boxes.map((b) => b.id), ['WW-017', 'WW-001']);
  assert.equal(p.boxes[0].where[0].photo, 1); // SC-R75: the outline comes from the change that named the box
  assert.equal(proposedStacks(r, [file(changes, { status: 'Declined', added: { n1: 'WW-017' } })]).length, 0);
});

test('SC-R72 a box can be swapped only for another of the same model', () => {
  const r = fresh();
  box(r, 'WW-001', 'sys-2-tl'); box(r, 'WW-002', 'sys-2-tl'); box(r, 'WW-003', 'sys-1-tl'); box(r, 'WW-004', 'sys-2-tl', { status: 'retired' });
  assert.deepEqual(swapsFor(r, ['WW-001', 'WW-003'], 0), ['WW-002']);
});

test('PH-R92 the stack change gets its own status; the rest of the file is kept', () => {
  const p = file([{ type: 'newBox', ref: 'n1' }, { type: 'stack', boxes: [] }]).json;
  const out = markStack(p, 1, 'Accepted', '2026-11-05', ['WW-017', 'WW-001']);
  assert.equal(out.changes[1].status, 'Accepted'); assert.deepEqual(out.changes[1].stacked, ['WW-017', 'WW-001']);
  assert.equal(out.status, 'Partly accepted'); assert.equal(p.changes[1].status, undefined);
  assert.equal(proposedStacks(fresh(), [{ json: out }]).length, 0);
});
