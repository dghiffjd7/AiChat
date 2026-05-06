import assert from 'node:assert/strict';

import {
  registerUpdateVariableApplyFn,
  resolveUpdateVariableApplyFn,
  UPDATE_VARIABLE_APPLY_FN_KEY,
} from '../../src/scripts/ui/chat/update-variable-invoke-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('registerUpdateVariableApplyFn stores function on provided window-like target', () => {
  const target = {};
  const fn = () => true;
  assert.equal(registerUpdateVariableApplyFn(fn, { globalWindow: target }), true);
  assert.equal(target[UPDATE_VARIABLE_APPLY_FN_KEY], fn);
});

test('resolveUpdateVariableApplyFn prefers local function and falls back to registered global one', () => {
  const localFn = () => 'local';
  const globalFn = () => 'global';
  const target = { [UPDATE_VARIABLE_APPLY_FN_KEY]: globalFn };

  assert.equal(resolveUpdateVariableApplyFn(localFn, { globalWindow: target }), localFn);
  assert.equal(resolveUpdateVariableApplyFn(null, { globalWindow: target }), globalFn);
  assert.equal(resolveUpdateVariableApplyFn(null, { globalWindow: {} }), null);
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
