import assert from 'node:assert/strict';

import {
  bindDraftMirrorInput,
  buildDraftMirrorStorageKey,
  readDraftMirror,
  removeDraftMirror,
  writeDraftMirror,
} from '../../src/scripts/ui/draft-mirror-utils.js';

const createStorage = () => {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
};

{
  assert.equal(buildDraftMirrorStorageKey('session-a'), 'phone_draft_session-a');
  assert.equal(buildDraftMirrorStorageKey(''), 'phone_draft_');
  console.log('ok - buildDraftMirrorStorageKey preserves legacy draft mirror key shape');
}

{
  const storage = createStorage();
  assert.equal(writeDraftMirror('session-a', 'abcdef', { storage, maxLength: 3 }), true);
  assert.equal(readDraftMirror('session-a', { storage }), 'def');
  assert.equal(removeDraftMirror('session-a', { storage }), true);
  assert.equal(readDraftMirror('session-a', { storage }), '');
  console.log('ok - draft mirror read write and remove preserve trimming and fallback behavior');
}

{
  const storage = {
    getItem() { throw new Error('read failed'); },
    setItem() { throw new Error('write failed'); },
    removeItem() { throw new Error('remove failed'); },
  };
  assert.equal(readDraftMirror('session-a', { storage }), '');
  assert.equal(writeDraftMirror('session-a', 'x', { storage }), false);
  assert.equal(removeDraftMirror('session-a', { storage }), false);
  console.log('ok - draft mirror storage helpers tolerate storage failures');
}

{
  const storage = createStorage();
  const listeners = new Map();
  const inputEl = {
    value: '',
    attrs: new Map(),
    hasAttribute(name) {
      return this.attrs.has(name);
    },
    setAttribute(name, value) {
      this.attrs.set(name, value);
    },
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
  };
  const bound = bindDraftMirrorInput({
    inputEl,
    getSessionId: () => 'session-b',
    storage,
    maxLength: 4,
  });
  assert.equal(bound, true);
  assert.equal(inputEl.attrs.get('data-draft-mirror'), 'true');
  inputEl.value = 'hello';
  listeners.get('input')();
  assert.equal(readDraftMirror('session-b', { storage }), 'ello');
  assert.equal(bindDraftMirrorInput({ inputEl, storage }), false);
  console.log('ok - bindDraftMirrorInput writes mirrored drafts once per input element');
}
