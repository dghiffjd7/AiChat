import assert from 'node:assert/strict';

import {
  bindCreativeReadingSettings,
  normalizeCreativeDialogueHighlight,
  normalizeCreativeNarrativeFont,
  normalizeCreativeReadingSize,
} from '../../src/scripts/ui/chat/creative-reading-settings-runtime-utils.js';

const createClassList = (...initial) => {
  const values = new Set(initial);
  return {
    add: (...tokens) => tokens.forEach(token => values.add(token)),
    remove: (...tokens) => tokens.forEach(token => values.delete(token)),
    toggle(token, force) {
      if (force === true) values.add(token);
      else if (force === false) values.delete(token);
      else if (values.has(token)) values.delete(token);
      else values.add(token);
      return values.has(token);
    },
    contains: token => values.has(token),
  };
};

const createEventTarget = () => {
  const listeners = new Map();
  return {
    listeners,
    classList: createClassList(),
    dataset: {},
    attributes: new Map(),
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    trigger(type, event = {}) {
      return listeners.get(type)?.({
        currentTarget: this,
        target: this,
        stopPropagation() {},
        ...event,
      });
    },
  };
};

assert.equal(normalizeCreativeReadingSize('compact'), 'compact');
assert.equal(normalizeCreativeReadingSize(' relaxed '), 'relaxed');
assert.equal(normalizeCreativeReadingSize('oversized'), 'standard');
assert.equal(normalizeCreativeNarrativeFont('sans'), 'sans');
assert.equal(normalizeCreativeNarrativeFont(' serif '), 'serif');
assert.equal(normalizeCreativeNarrativeFont('unknown'), 'serif');
assert.equal(normalizeCreativeDialogueHighlight(undefined), true);
assert.equal(normalizeCreativeDialogueHighlight(false), false);

{
  const bodyEl = { dataset: {} };
  const buttonEl = createEventTarget();
  const options = ['compact', 'standard', 'relaxed'].map((value) => {
    const button = createEventTarget();
    button.dataset.rpReadingSize = value;
    return button;
  });
  const fontOptions = ['serif', 'sans'].map((value) => {
    const button = createEventTarget();
    button.dataset.rpNarrativeFont = value;
    return button;
  });
  const menuEl = createEventTarget();
  const highlightToggle = createEventTarget();
  highlightToggle.checked = false;
  menuEl.classList.add('hidden');
  menuEl.querySelectorAll = selector => {
    if (selector === '[data-rp-reading-size]') return options;
    if (selector === '[data-rp-narrative-font]') return fontOptions;
    return [];
  };
  menuEl.querySelector = selector => (
    selector === '[data-rp-dialogue-highlight]' ? highlightToggle : null
  );
  const calls = [];
  const runtime = bindCreativeReadingSettings({
    bodyEl,
    buttonEl,
    menuEl,
    readSetting: () => 'relaxed',
    writeSetting: value => calls.push(['write', value]),
    readNarrativeFont: () => 'serif',
    writeNarrativeFont: value => calls.push(['font', value]),
    readDialogueHighlight: () => false,
    writeDialogueHighlight: value => calls.push(['highlight', value]),
    onDialogueHighlightChanged: value => calls.push(['rerender', value]),
    toggleSheetAt: (...args) => {
      calls.push(['toggle', ...args]);
      menuEl.classList.remove('hidden');
    },
  });

  assert.equal(bodyEl.dataset.rpReadingSize, 'relaxed');
  assert.equal(menuEl.dataset.rpReadingSize, 'relaxed');
  assert.equal(options[2].classList.contains('is-active'), true);
  assert.equal(options[2].attributes.get('aria-pressed'), 'true');
  assert.equal(bodyEl.dataset.rpNarrativeFont, 'serif');
  assert.equal(menuEl.dataset.rpNarrativeFont, 'serif');
  assert.equal(fontOptions[0].classList.contains('is-active'), true);
  assert.equal(bodyEl.dataset.rpDialogueHighlight, 'off');
  assert.equal(highlightToggle.checked, false);

  buttonEl.trigger('click');
  assert.deepEqual(calls[0], ['toggle', menuEl, buttonEl, { alignRight: true, kind: 'reading' }]);
  assert.equal(buttonEl.classList.contains('is-active'), true);

  menuEl.trigger('click', {
    target: {
      closest: selector => (selector === 'button[data-rp-reading-size]' ? options[0] : null),
    },
  });
  assert.equal(bodyEl.dataset.rpReadingSize, 'compact');
  assert.equal(menuEl.dataset.rpReadingSize, 'compact');
  assert.deepEqual(calls[1], ['write', 'compact']);
  assert.equal(options[0].classList.contains('is-active'), true);
  assert.equal(options[2].classList.contains('is-active'), false);

  menuEl.trigger('click', {
    target: {
      closest: selector => (
        selector === 'button[data-rp-narrative-font]' ? fontOptions[1] : null
      ),
    },
  });
  assert.equal(bodyEl.dataset.rpNarrativeFont, 'sans');
  assert.equal(menuEl.dataset.rpNarrativeFont, 'sans');
  assert.deepEqual(calls[2], ['font', 'sans']);
  assert.equal(fontOptions[0].classList.contains('is-active'), false);
  assert.equal(fontOptions[1].classList.contains('is-active'), true);

  highlightToggle.checked = true;
  highlightToggle.trigger('change');
  assert.equal(bodyEl.dataset.rpDialogueHighlight, 'on');
  assert.deepEqual(calls[3], ['highlight', true]);
  assert.deepEqual(calls[4], ['rerender', true]);

  runtime.destroy();
  assert.equal(buttonEl.listeners.size, 0);
  assert.equal(menuEl.listeners.size, 0);
  assert.equal(highlightToggle.listeners.size, 0);
  console.log('ok - creative reading settings persist independent size and narrative-font choices');
}
