import assert from 'node:assert/strict';

import {
  renderLineDiffElement,
  showTextDiffConfirmDialog,
} from '../../src/scripts/ui/text-diff-view-utils.js';
import { buildLineDiff } from '../../src/scripts/utils/line-diff-utils.js';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.id = '';
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...items) {
    items.forEach(item => this.appendChild(item));
  }

  removeChild(child) {
    this.children = this.children.filter(item => item !== child);
    child.parentNode = null;
    return child;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  dispatchEvent(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  getElementById() {
    return null;
  }
}

const findAll = (root, predicate, output = []) => {
  if (predicate(root)) output.push(root);
  (root.children || []).forEach(child => findAll(child, predicate, output));
  return output;
};

{
  const documentRef = new FakeDocument();
  const diff = buildLineDiff('a\nb\nc', 'a\nB\nc', { collapseContext: false });
  const el = renderLineDiffElement(documentRef, diff);
  const rows = el.children;
  assert.equal(rows.length, 4);
  assert.equal(rows[0].className, 'text-diff-row is-context');
  assert.equal(rows[1].className, 'text-diff-row is-del');
  assert.equal(rows[1].children[0].textContent, '2', '删除行显示旧行号');
  assert.equal(rows[1].children[1].textContent, '-');
  assert.equal(rows[1].children[2].textContent, 'b');
  assert.equal(rows[2].className, 'text-diff-row is-add');
  assert.equal(rows[2].children[0].textContent, '2', '新增行显示新行号');
  assert.equal(rows[2].children[1].textContent, '+');
  assert.equal(rows[2].children[2].textContent, 'B');
  console.log('ok - diff 渲染输出行号、正负号与红绿行类名');
}

{
  const documentRef = new FakeDocument();
  const oldText = Array.from({ length: 20 }, (_, i) => `line${i}`).join('\n');
  const diff = buildLineDiff(oldText, oldText.replace('line10', 'LINE10'));
  const el = renderLineDiffElement(documentRef, diff);
  const skips = el.children.filter(row => row.className === 'text-diff-row is-skip');
  assert.equal(skips.length, 2);
  assert.match(skips[0].textContent, /行未变更/);
  console.log('ok - 折叠段渲染为未变更提示行');
}

{
  const result = await showTextDiffConfirmDialog({
    documentRef: new FakeDocument(),
    oldText: 'same',
    newText: 'same',
  });
  assert.deepEqual({ confirmed: result.confirmed, changed: result.changed }, { confirmed: false, changed: false });
  console.log('ok - 无变化时不弹窗直接返回');
}

{
  const documentRef = new FakeDocument();
  const promise = showTextDiffConfirmDialog({
    documentRef,
    title: '应用格式修复',
    summary: '移除 1 行连续重复',
    oldText: 'a\nb\nb',
    newText: 'a\nb',
  });
  const overlay = documentRef.body.children.at(-1);
  assert.equal(overlay.className, 'text-diff-overlay');
  const stats = findAll(overlay, el => el.className === 'text-diff-stat-del');
  assert.equal(stats[0].textContent, '-1');
  const confirmBtn = findAll(overlay, el => el.textContent === '应用变更')[0];
  assert.ok(confirmBtn, '应有确认按钮');
  confirmBtn.dispatchEvent('click', {});
  const result = await promise;
  assert.equal(result.confirmed, true);
  assert.equal(documentRef.body.children.includes(overlay), false, '确认后应移除弹窗');
  console.log('ok - 确认按钮 resolve true 并关闭弹窗');
}

{
  const documentRef = new FakeDocument();
  const promise = showTextDiffConfirmDialog({
    documentRef,
    oldText: 'a',
    newText: 'b',
  });
  const overlay = documentRef.body.children.at(-1);
  const cancelBtn = findAll(overlay, el => el.textContent === '取消')[0];
  cancelBtn.dispatchEvent('click', {});
  const result = await promise;
  assert.equal(result.confirmed, false);
  assert.equal(result.changed, true);
  console.log('ok - 取消按钮 resolve false');
}

{
  const result = await showTextDiffConfirmDialog({
    documentRef: null,
    oldText: 'a',
    newText: 'b',
  });
  assert.equal(result.confirmed, false, '无 DOM 环境时按取消处理，不静默应用');
  assert.equal(result.reason, 'dom_unavailable');
  console.log('ok - 无 DOM 环境安全降级为取消');
}

console.log('text-diff-view-utils-tests passed');
