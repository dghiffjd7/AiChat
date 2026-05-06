import assert from 'node:assert/strict';

import {
  appendStatusPlaceholderIfNeeded,
  buildUpdateVariableApplyPlan,
  buildUpdateVariableCommitPlan,
  buildUpdateVariableFallbackStripPlan,
  buildUpdateVariableMessagePatch,
  resolveUpdateVariableMessageState,
  stripUpdateVariableMessageState,
} from '../../src/scripts/ui/chat/update-variable-persist-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('resolveUpdateVariableMessageState collects raw and source fallbacks', () => {
  assert.deepEqual(
    resolveUpdateVariableMessageState({
      rawOriginal: 'orig',
      rawSource: 'src',
      raw: 'stored',
      content: 'display',
    }),
    {
      raw: 'orig',
      baseStoredRaw: 'stored',
      baseSource: 'src',
      baseOriginal: 'orig',
      baseFallback: 'display',
      sourceText: 'src',
      hasSourceText: true,
    },
  );
});

test('stripUpdateVariableMessageState returns stripped current and fallback values', () => {
  assert.deepEqual(
    stripUpdateVariableMessageState({
      raw: 'fallback <UpdateVariable>x</UpdateVariable>',
      baseStoredRaw: 'stored<UpdateVariable>a</UpdateVariable>',
      sourceText: 'source<UpdateVariable>b</UpdateVariable>',
    }),
    {
      nextStored: 'stored',
      nextSource: 'source',
      fallbackStoredSource: 'stored',
      fallbackSourceText: 'source',
    },
  );
});

test('appendStatusPlaceholderIfNeeded appends only when tavern session lacks placeholders', () => {
  assert.deepEqual(
    appendStatusPlaceholderIfNeeded({
      raw: 'hello',
      sourceText: 'world',
      baseStoredRaw: 'stored',
      nextStored: 'stored-clean',
      nextSource: 'source-clean',
      isTavernMvuSession: true,
    }),
    {
      nextStored: 'stored-clean\n\n<StatusPlaceHolderImpl/>',
      nextSource: 'source-clean\n\n<StatusPlaceHolderImpl/>',
      placeholderInjected: true,
      rawHasPlaceholder: false,
      sourceHasPlaceholder: false,
      storedHasPlaceholder: false,
    },
  );
  assert.equal(
    appendStatusPlaceholderIfNeeded({
      raw: '<StatusPlaceHolderImpl/>',
      sourceText: '',
      baseStoredRaw: '',
      nextStored: 'x',
      nextSource: 'y',
      isTavernMvuSession: true,
    }).placeholderInjected,
    false,
  );
});

test('buildUpdateVariableMessagePatch builds payload and rp meta flags', () => {
  assert.deepEqual(
    buildUpdateVariableMessagePatch({
      message: {
        raw: 'old-raw',
        rawSource: 'old-source',
        content: 'old-display',
        meta: { flag: true },
      },
      nextStored: 'next-raw',
      nextSource: 'next-source',
      nextDisplay: 'next-display',
      hasSourceText: true,
      forceRenderRich: true,
    }),
    {
      updatePayload: {
        raw: 'next-raw',
        content: 'next-display',
        rawSource: 'next-source',
        meta: { flag: true, renderRich: true },
      },
      nextMeta: { flag: true, renderRich: true },
      storedUnchanged: false,
      sourceUnchanged: false,
      displayUnchanged: false,
    },
  );
});

test('buildUpdateVariableCommitPlan summarizes persist decision and fallback message', () => {
  assert.deepEqual(
    buildUpdateVariableCommitPlan({
      message: {
        id: 'm1',
        raw: 'old-raw',
        rawSource: 'old-source',
        content: 'old-display',
        meta: { flag: true },
      },
      nextStored: 'next-raw',
      nextSource: 'next-source',
      nextDisplay: 'next-display',
      hasSourceText: true,
      forceRenderRich: true,
      variableChanged: false,
      placeholderInjected: true,
    }),
    {
      updatePayload: {
        raw: 'next-raw',
        content: 'next-display',
        rawSource: 'next-source',
        meta: { flag: true, renderRich: true },
      },
      nextMeta: { flag: true, renderRich: true },
      storedUnchanged: false,
      sourceUnchanged: false,
      displayUnchanged: false,
      shouldPersist: true,
      resultChanged: true,
      fallbackUpdatedMessage: {
        id: 'm1',
        raw: 'next-raw',
        rawSource: 'next-source',
        content: 'next-display',
        meta: { flag: true, renderRich: true },
      },
    },
  );
});

test('buildUpdateVariableCommitPlan can omit meta from update payload for fallback writes', () => {
  assert.deepEqual(
    buildUpdateVariableCommitPlan({
      message: {
        id: 'm2',
        raw: 'same',
        rawSource: 'same-source',
        content: 'same-display',
        meta: { flag: true },
      },
      nextStored: 'next',
      nextSource: 'next-source',
      nextDisplay: 'next-display',
      hasSourceText: true,
      includeMeta: false,
    }),
    {
      updatePayload: {
        raw: 'next',
        content: 'next-display',
        rawSource: 'next-source',
      },
      nextMeta: null,
      storedUnchanged: false,
      sourceUnchanged: false,
      displayUnchanged: false,
      shouldPersist: true,
      resultChanged: false,
      fallbackUpdatedMessage: {
        id: 'm2',
        raw: 'next',
        rawSource: 'next-source',
        content: 'next-display',
        meta: { flag: true },
      },
    },
  );
});

test('buildUpdateVariableApplyPlan composes stored/display transforms and change flags', () => {
  assert.deepEqual(
    buildUpdateVariableApplyPlan({
      message: {
        id: 'm-apply',
        raw: '',
        rawSource: 'source<UpdateVariable>a=1</UpdateVariable>',
        content: 'old-display',
        meta: { renderRich: false },
      },
      raw: 'source<UpdateVariable>a=1</UpdateVariable>',
      isTavernMvuSession: false,
      transformStored: text => `stored:${text}`,
      transformDisplay: text => `display:${text}`,
      forceRenderRich: true,
      variableChanged: true,
    }),
    {
      raw: 'source<UpdateVariable>a=1</UpdateVariable>',
      hasRaw: true,
      hasSourceText: true,
      nextStored: 'stored:source',
      nextSource: 'source',
      nextDisplay: 'display:stored:source',
      placeholderInjected: false,
      updatePayload: {
        raw: 'stored:source',
        content: 'display:stored:source',
        rawSource: 'source',
        meta: { renderRich: true },
      },
      nextMeta: { renderRich: true },
      storedUnchanged: false,
      sourceUnchanged: false,
      displayUnchanged: false,
      shouldPersist: true,
      resultChanged: true,
      fallbackUpdatedMessage: {
        id: 'm-apply',
        raw: 'stored:source',
        rawSource: 'source',
        content: 'display:stored:source',
        meta: { renderRich: true },
      },
    },
  );
});

test('buildUpdateVariableApplyPlan returns no-op state when raw text is unavailable', () => {
  assert.deepEqual(
    buildUpdateVariableApplyPlan({
      message: { id: 'm-empty' },
    }),
    {
      raw: '',
      hasRaw: false,
      hasSourceText: false,
      nextStored: '',
      nextSource: '',
      nextDisplay: '',
      placeholderInjected: false,
      shouldPersist: false,
      resultChanged: false,
      updatePayload: null,
      fallbackUpdatedMessage: { id: 'm-empty' },
    },
  );
});

test('buildUpdateVariableFallbackStripPlan composes strip placeholder and commit state', () => {
  assert.deepEqual(
    buildUpdateVariableFallbackStripPlan({
      message: {
        id: 'm3',
        raw: 'stored<UpdateVariable>a=1</UpdateVariable>',
        rawSource: 'source<UpdateVariable>a=1</UpdateVariable>',
        content: 'display',
        meta: { flag: true },
      },
      isTavernMvuSession: true,
      transformDisplay: text => `display:${text}`,
    }),
    {
      raw: 'source<UpdateVariable>a=1</UpdateVariable>',
      hasRaw: true,
      hasSourceText: true,
      nextStored: 'stored\n\n<StatusPlaceHolderImpl/>',
      nextSource: 'source\n\n<StatusPlaceHolderImpl/>',
      nextDisplay: 'display:stored\n\n<StatusPlaceHolderImpl/>',
      placeholderInjected: true,
      updatePayload: {
        raw: 'stored\n\n<StatusPlaceHolderImpl/>',
        content: 'display:stored\n\n<StatusPlaceHolderImpl/>',
        rawSource: 'source\n\n<StatusPlaceHolderImpl/>',
      },
      nextMeta: null,
      storedUnchanged: false,
      sourceUnchanged: false,
      displayUnchanged: false,
      shouldPersist: true,
      resultChanged: false,
      fallbackUpdatedMessage: {
        id: 'm3',
        raw: 'stored\n\n<StatusPlaceHolderImpl/>',
        rawSource: 'source\n\n<StatusPlaceHolderImpl/>',
        content: 'display:stored\n\n<StatusPlaceHolderImpl/>',
        meta: { flag: true },
      },
    },
  );
});

test('buildUpdateVariableFallbackStripPlan returns no-op state when raw text is unavailable', () => {
  assert.deepEqual(
    buildUpdateVariableFallbackStripPlan({
      message: { id: 'm4', meta: { flag: true } },
    }),
    {
      raw: '',
      hasRaw: false,
      hasSourceText: false,
      nextStored: '',
      nextSource: '',
      nextDisplay: '',
      placeholderInjected: false,
      shouldPersist: false,
      resultChanged: false,
      updatePayload: null,
      fallbackUpdatedMessage: { id: 'm4', meta: { flag: true } },
    },
  );
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
