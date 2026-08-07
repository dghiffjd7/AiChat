import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const previousDocument = globalThis.document;
const previousMatchMedia = globalThis.matchMedia;

const createClassList = () => {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
  };
};

const createElement = ({ height = 180, scrollHeight = 240 } = {}) => {
  const calls = [];
  const element = {
    style: { display: 'none' },
    classList: createClassList(),
    scrollHeight,
    getBoundingClientRect: () => ({ height }),
    animate(frames, options) {
      let resolveFinished;
      let rejectFinished;
      const finished = new Promise((resolve, reject) => {
        resolveFinished = resolve;
        rejectFinished = reject;
      });
      const animation = {
        finished,
        cancelled: false,
        cancel() {
          this.cancelled = true;
          rejectFinished(new Error('cancelled'));
        },
        finish() { resolveFinished(); },
      };
      calls.push({ frames, options, animation });
      return animation;
    },
  };
  return { element, calls };
};

try {
  globalThis.document = { body: { dataset: {} } };
  globalThis.matchMedia = () => ({ matches: false });

  const {
    isWorldMotionReduced,
    setWorldDisclosureState,
  } = await import('../../src/scripts/ui/world-management-motion-utils.js');

  {
    const { element, calls } = createElement();
    const animation = setWorldDisclosureState(element, true, { duration: 320 });
    assert.equal(element.style.display, 'block');
    assert.equal(element.classList.contains('is-world-disclosing'), true);
    assert.deepEqual(calls[0].frames, [
      { height: '0px', opacity: 0 },
      { height: '240px', opacity: 1 },
    ]);
    assert.equal(calls[0].options.duration, 320);
    assert.equal(calls[0].options.easing, 'cubic-bezier(0.32, 0.72, 0, 1)');
    animation.finish();
    await animation.finished;
    await Promise.resolve();
    assert.equal(element.style.height, '');
    assert.equal(element.style.opacity, '');
    assert.equal(element.classList.contains('is-world-disclosing'), false);
    assert.equal(animation.cancelled, true);
    console.log('ok - world disclosure opens with the reference height and opacity curve');
  }

  {
    const { element, calls } = createElement();
    element.style.display = 'block';
    let finished = false;
    const animation = setWorldDisclosureState(element, false, {
      duration: 340,
      onFinish: () => { finished = true; },
    });
    assert.deepEqual(calls[0].frames, [
      { height: '180px', opacity: 1 },
      { height: '0px', opacity: 0 },
    ]);
    animation.finish();
    await animation.finished;
    await Promise.resolve();
    assert.equal(element.style.display, 'none');
    assert.equal(finished, true);
    assert.equal(animation.cancelled, true);
    console.log('ok - world disclosure collapses before hiding its existing content');
  }

  {
    globalThis.document.body.dataset.reducedMotion = 'on';
    const { element, calls } = createElement();
    let finished = false;
    const result = setWorldDisclosureState(element, true, {
      onFinish: () => { finished = true; },
    });
    assert.equal(result, null);
    assert.equal(calls.length, 0);
    assert.equal(element.style.display, 'block');
    assert.equal(finished, true);
    assert.equal(isWorldMotionReduced(), true);
    delete globalThis.document.body.dataset.reducedMotion;
    console.log('ok - App reduced-motion mode resolves disclosure state without animation');
  }

  {
    const [css, panelSource, editorSource] = await Promise.all([
      readFile(new URL('../../src/assets/css/main.css', import.meta.url), 'utf8'),
      readFile(new URL('../../src/scripts/ui/world-panel.js', import.meta.url), 'utf8'),
      readFile(new URL('../../src/scripts/ui/world-editor.js', import.meta.url), 'utf8'),
    ]);
    assert.match(css, /@keyframes world-layer-backdrop-in/);
    assert.match(css, /\.world-panel-shell\.is-opening/);
    assert.match(css, /\.world-library-modal\.is-opening/);
    assert.match(css, /#world-editor-modal\.is-opening/);
    assert.match(css, /#world-editor-overlay\s*\{[^}]*z-index:\s*23000;/);
    assert.match(editorSource, /this\.overlay\.style\.zIndex\s*=\s*'23000'/);
    assert.doesNotMatch(editorSource, /this\.overlay\.style\.zIndex\s*=\s*'22000'/);
    assert.match(css, /\.world-entry-page\s*\{[^}]*min-width:\s*0;/);
    assert.match(css, /\.world-entry-form\.is-entering/);
    assert.match(css, /@keyframes world-content-layer-in/);
    assert.match(css, /\.world-content-card\.is-expanded\.is-closing/);
    assert.match(css, /\.world-entry-advanced\.is-expanded[\s\S]*rotate\(180deg\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.world-panel-shell/);
    assert.match(css, /body\[data-reduced-motion='on'\][\s\S]*\.world-panel-shell/);
    assert.match(panelSource, /setWorldDisclosureState\(this\.globalSettingsBody/);
    assert.match(panelSource, /setWorldDisclosureState\(entriesWrap/);
    assert.match(panelSource, /animateRows && motionIndex < 12/);
    assert.match(editorSource, /setWorldDisclosureState\(advancedClip/);
    assert.match(editorSource, /blockCollapseTimer = setTimeout/);
    // 浮起卡片必须留等高占位符：展开前量高度，展开期间渲染进文档流，防止下方卡片上跳/闪烁
    assert.match(editorSource, /#we-block-shell:not\(\.is-expanded\)/);
    assert.match(editorSource, /blockShellPlaceholderHeight = height/);
    assert.match(editorSource, /world-block-shell-placeholder/);
    assert.match(css, /\.world-block-shell-placeholder\s*\{/);
    console.log('ok - world manager, library, editor, and both accordions share the motion contract');
  }
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
  if (previousMatchMedia === undefined) delete globalThis.matchMedia;
  else globalThis.matchMedia = previousMatchMedia;
}
