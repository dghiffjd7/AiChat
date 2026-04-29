import test from 'node:test';
import assert from 'node:assert/strict';

if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

if (!globalThis.setTimeout) {
  globalThis.setTimeout = () => 0;
} else {
  globalThis.setTimeout = () => 0;
}

const { RegexStore } = await import('../../src/scripts/storage/regex-store.js');

const createStore = () => Object.create(RegexStore.prototype);

test('applyMacros replaces variable-like placeholders', () => {
  const store = createStore();
  const output = store.applyMacros('hello {{user.name}}', { user: { name: 'Alice' } });
  assert.equal(output, 'hello Alice');
});

test('applyMacros preserves JSX object literals inside double braces', () => {
  const store = createStore();
  const input = "return (<div style={{fontSize:'10px', opacity:0.6}}>[ REGEX FAILED / NO DATA ]</div>);";
  const output = store.applyMacros(input, { fontSize: 'bad' });
  assert.equal(output, input);
});

test('applyMacros preserves JSX self-closing attributes with object literals', () => {
  const store = createStore();
  const input = '<input className="mp-slider" style={{flex: 1}} />';
  const output = store.applyMacros(input, { flex: 'bad' });
  assert.equal(output, input);
});

test('applyMacros supports bracket lookups with quoted keys', () => {
  const store = createStore();
  const output = store.applyMacros('{{player["current hp"]}}', {
    player: { 'current hp': 42 },
  });
  assert.equal(output, '42');
});

test('applyMacros still expands getvar macros', () => {
  const store = createStore();
  const output = store.applyMacros('{{getvar::player.hp}} / {{getvar:player.mp}}', {
    player: { hp: 87, mp: 12 },
  });
  assert.equal(output, '87 / 12');
});
