import assert from 'node:assert/strict';

import {
  applyDialogueHighlightToDom,
  buildDualVoiceSpeechChunks,
  segmentDialogueText,
} from '../../src/scripts/ui/chat/dialogue-segment-utils.js';

// 最小 DOM 桩：childNodes/parentNode/insertBefore/removeChild 足以驱动后处理遍历
class FakeNode {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.parentNode = null;
  }
}
class FakeText extends FakeNode {
  constructor(value = '') {
    super(3);
    this.nodeValue = String(value);
  }
}
class FakeEl extends FakeNode {
  constructor(tagName = 'div', className = '') {
    super(1);
    this.tagName = String(tagName).toUpperCase();
    this.className = className;
    this.childNodes = [];
    this._textContent = '';
  }

  set textContent(value) {
    this._textContent = String(value);
    this.childNodes = [new FakeText(this._textContent)];
    this.childNodes[0].parentNode = this;
  }

  get textContent() { return this._textContent; }

  append(...nodes) {
    nodes.forEach((node) => {
      node.parentNode = this;
      this.childNodes.push(node);
    });
    return this;
  }

  insertBefore(node, ref) {
    const index = this.childNodes.indexOf(ref);
    node.parentNode = this;
    if (index < 0) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }
}
const fakeDocument = {
  createElement: tag => new FakeEl(tag),
  createTextNode: value => new FakeText(value),
};
const flatten = (node, out = []) => {
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) out.push(['#text', child.nodeValue]);
    else {
      out.push([`${child.tagName.toLowerCase()}${child.className ? `.${child.className}` : ''}`, child.textContent || null]);
      if (!child._textContent) flatten(child, out);
    }
  });
  return out;
};

{
  const segments = segmentDialogueText('她轻轻抬头。\n“早安，主人。”随后把茶放下。\n「今天也请多指教。」');
  assert.deepEqual(segments, [
    { kind: 'narration', text: '她轻轻抬头。\n' },
    { kind: 'dialogue', text: '“早安，主人。”' },
    { kind: 'narration', text: '随后把茶放下。\n' },
    { kind: 'dialogue', text: '「今天也请多指教。」' },
  ]);
  assert.deepEqual(segmentDialogueText('“跨行\n对白”不会命中'), [
    { kind: 'narration', text: '“跨行\n对白”不会命中' },
  ]);
  assert.deepEqual(segmentDialogueText('没有闭合的“对白'), [
    { kind: 'narration', text: '没有闭合的“对白' },
  ]);
  console.log('ok - dialogue segmentation is deterministic and rejects cross-paragraph or unclosed quotes');
}

{
  const chunks = buildDualVoiceSpeechChunks('旁白。“对白很长。”结尾。', {
    narrationConfig: { provider: 'openai', ttsVoice: 'narrator' },
    dialogueConfig: { provider: 'qwen_local', ttsVoice: 'Serena' },
    resolveMaxChars: config => config.provider === 'qwen_local' ? 4 : 10,
  });
  assert.equal(chunks.map(item => item.text).join(''), '旁白。“对白很长。”结尾。');
  assert.equal(chunks.filter(item => item.kind === 'dialogue').length > 1, true);
  assert.equal(chunks.every(item => item.config.ttsVoice === (item.kind === 'dialogue' ? 'Serena' : 'narrator')), true);
  console.log('ok - dual-voice chunks preserve order while applying per-voice provider limits');
}

{
  // fragment 场景：折叠块（details）+ 周围正文都在 HTML DOM 里
  const root = new FakeEl('div');
  const details = new FakeEl('details');
  details.append(new FakeText('思考中“内部引号”…'));
  root.append(details, new FakeText('正文旁白“你好，主人。”收尾'));
  const wrapped = applyDialogueHighlightToDom(root, { documentRef: fakeDocument });
  assert.equal(wrapped, 2, '正文与折叠块内的文本节点都应处理');
  const tail = flatten(root).filter(([tag]) => tag !== 'details');
  assert.deepEqual(tail, [
    ['#text', '思考中'],
    ['span.rp-dialogue-text', '“内部引号”'],
    ['#text', '…'],
    ['#text', '正文旁白'],
    ['span.rp-dialogue-text', '“你好，主人。”'],
    ['#text', '收尾'],
  ]);
  console.log('ok - DOM 后处理在 fragment 渲染结果上正确包裹对白');
}

{
  // 跳过 code/pre/style/iframe 与已有高亮，纯旁白文本不动
  const root = new FakeEl('div');
  const code = new FakeEl('code');
  code.append(new FakeText('const s = "字符串";'));
  const styleEl = new FakeEl('style', 'chat-rich-scoped-style');
  styleEl.append(new FakeText('.x{content:"引号"}'));
  const done = new FakeEl('span', 'rp-dialogue-text');
  done.append(new FakeText('“已处理”'));
  const codeblock = new FakeEl('div', 'chat-codeblock');
  codeblock.append(new FakeText('“围栏内”'));
  root.append(code, styleEl, done, codeblock, new FakeText('纯旁白没有引号'));
  const wrapped = applyDialogueHighlightToDom(root, { documentRef: fakeDocument });
  assert.equal(wrapped, 0);
  assert.equal(code.childNodes[0].nodeValue, 'const s = "字符串";');
  assert.equal(done.childNodes.length, 1);
  console.log('ok - DOM 后处理跳过代码/样式/已高亮节点且纯旁白零改动');
}

{
  // 幂等：重复执行不产生嵌套
  const root = new FakeEl('div');
  root.append(new FakeText('旁白“对白”'));
  applyDialogueHighlightToDom(root, { documentRef: fakeDocument });
  const first = flatten(root);
  applyDialogueHighlightToDom(root, { documentRef: fakeDocument });
  assert.deepEqual(flatten(root), first);
  console.log('ok - DOM 后处理幂等');
}
