import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.dataset = {};
    this.style = { cssText: '', setProperty() {}, removeProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    if (!this._innerHTML) this.children = [];
  }

  get innerHTML() { return this._innerHTML; }
  appendChild(child) { this.children.push(child); return child; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
}

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = {
  body: { dataset: {} },
  createElement: tagName => new FakeElement(tagName),
};
globalThis.window = { appBridge: null };

const { renderRichText } = await import('../../src/scripts/ui/chat/rich-text-renderer.js');

const highlighted = new FakeElement();
renderRichText(highlighted, '旁白“对白”收尾', { highlightDialogue: true });
assert.deepEqual(highlighted.children.map(child => [child.className, child.textContent]), [
  ['', '旁白'],
  ['rp-dialogue-text', '“对白”'],
  ['', '收尾'],
]);

const streaming = new FakeElement();
renderRichText(streaming, '旁白“尚未闭合', { highlightDialogue: true, streaming: true });
assert.equal(streaming.children.some(child => child.className === 'rp-dialogue-text'), false);
renderRichText(streaming, '旁白“已经闭合”', { highlightDialogue: true, streaming: true });
assert.equal(streaming.children.some(child => child.className === 'rp-dialogue-text'), true);

const disabled = new FakeElement();
renderRichText(disabled, '旁白“普通文字”', { highlightDialogue: false });
assert.equal(disabled.children.some(child => child.className === 'rp-dialogue-text'), false);

const source = fs.readFileSync(path.join(process.cwd(), 'src/scripts/ui/chat/rich-text-renderer.js'), 'utf8');
assert.ok(source.indexOf("if (p.type === 'code')") < source.indexOf('segmentDialogueText(statusSeg)'));
assert.ok(source.indexOf('renderScopedRichFragment') < source.indexOf('segmentDialogueText(statusSeg)'));

console.log('ok - creative dialogue highlighting is explicit, streaming-safe, and isolated from rich routes');

{
  const rendererSource = fs.readFileSync(path.join(process.cwd(), 'src/scripts/ui/chat/rich-text-renderer.js'), 'utf8');
  const fragmentIndex = rendererSource.indexOf('const rendered = renderScopedRichFragment(containerEl');
  const highlightIndex = rendererSource.indexOf('if (highlightDialogue) applyDialogueHighlightToDom(containerEl);', fragmentIndex);
  const returnIndex = rendererSource.indexOf('return;', highlightIndex);
  assert.ok(fragmentIndex >= 0, 'fragment 渲染路径必须存在');
  assert.ok(highlightIndex > fragmentIndex, 'fragment 渲染成功后必须做 DOM 对白后处理');
  assert.ok(returnIndex > highlightIndex, '后处理必须发生在该分支 return 之前');
  console.log('ok - 思维链折叠等 fragment 消息的正文也会走对白高亮');
}
