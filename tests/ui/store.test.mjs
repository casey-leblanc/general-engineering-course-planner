import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/ui/store.js';
import { emptyState, moveTile, addTile } from '../../src/core/state.js';

const make = () => {
  const s = emptyState({ catalogYear: '2026-2027', programs: ['EE-BSEE'] });
  s.placed.EE1820 = 'year1-fall';
  const calls = [];
  const store = createStore(s, { catalogYear: '2026-2027', onChange: () => calls.push('change'), onSaved: k => calls.push(k) });
  return { store, calls };
};

test('undo reverts the last change, and only the last', () => {
  const { store } = make();
  store.update(s => moveTile(s, 'EE1820', 'year2-fall'));
  store.update(s => addTile(s, 'MATH1550', 'year1-fall'));
  assert.equal(store.undo(), true);
  assert.equal(store.state.placed.MATH1550, undefined);
  assert.equal(store.state.placed.EE1820, 'year2-fall', 'the earlier change is untouched');
  assert.equal(store.undo(), false, 'one step only');
});

test('a toast Undo only works while its change is still the latest', () => {
  const { store } = make();
  store.update(s => moveTile(s, 'EE1820', 'year2-fall'));
  const token = store.token;
  store.update(s => addTile(s, 'MATH1550', 'year1-fall'));   // something newer happens
  assert.equal(store.undo(token), false, 'the old toast must not revert the newer change');
  assert.equal(store.state.placed.MATH1550, 'year1-fall');
  const t2 = store.token;
  assert.equal(store.undo(t2), true);
  assert.equal(store.state.placed.MATH1550, undefined);
});

test('a follow-up step of the same action keeps one undo; a non-undoable change forgets it', () => {
  const { store } = make();
  store.update(s => moveTile(s, 'EE1820', 'year2-fall'));
  const t = store.token;
  store.update(s => addTile(s, 'MATH1550', 'year1-fall'), { keepUndo: true });
  assert.equal(store.token, t);
  assert.equal(store.undo(t), true);
  assert.equal(store.state.placed.EE1820, 'year1-fall', 'both steps undone together');

  store.update(s => moveTile(s, 'EE1820', 'year2-fall'));
  store.update(s => addTile(s, 'MATH1550', 'year1-fall'), { undo: false });
  assert.equal(store.undo(), false);
});

test('saving starts only after a real edit, so opening a link never overwrites a saved plan', () => {
  const { store, calls } = make();
  assert.equal(store.armed, false);
  assert.ok(!calls.includes('saved') && !calls.includes('nostore'));
  store.update(s => moveTile(s, 'EE1820', 'year2-fall'));
  assert.equal(store.armed, true);
  assert.ok(calls.includes('saved') || calls.includes('nostore'));
});

test('replace validates what it is given', () => {
  const { store } = make();
  store.replace({ v: 3, catalogYear: '2026-2027', programs: ['BE-BSBE', '../x'], placed: { BE1251: 'year1-fall', '<x>': 'year1-fall' } });
  assert.deepEqual(store.state.programs, ['BE-BSBE']);
  assert.deepEqual(Object.keys(store.state.placed), ['BE1251']);
  assert.throws(() => store.replace({ v: 2 }));
});
