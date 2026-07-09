import assert from 'node:assert/strict';

import {
  buildElementUiSummary,
  isReadableElementVisible,
  readVisibleText,
} from '../../src/scripts/ui/agent-ui-inspect-utils.js';

const createClassList = (...tokens) => {
  const set = new Set(tokens);
  return {
    add: token => set.add(token),
    contains: token => set.has(token),
  };
};

const makeElement = ({
  tag = 'div',
  text = '',
  classes = [],
  hidden = false,
  attrs = {},
  value = '',
  type = '',
  disabled = false,
  descendants = {},
} = {}) => ({
  tagName: tag.toUpperCase(),
  hidden,
  classList: createClassList(...classes),
  style: {},
  innerText: text,
  textContent: text,
  value,
  type,
  disabled,
  id: attrs.id || '',
  name: attrs.name || '',
  placeholder: attrs.placeholder || '',
  getAttribute: name => attrs[name] ?? null,
  getBoundingClientRect: () => ({ width: 10, height: 10 }),
  querySelectorAll: selector => descendants[selector] || [],
});

{
  const visible = makeElement({ text: 'x' });
  const hiddenEl = makeElement({ text: 'x', hidden: true });
  const hiddenClass = makeElement({ text: 'x', classes: ['hidden'] });
  assert.equal(isReadableElementVisible(visible), true);
  assert.equal(isReadableElementVisible(hiddenEl), false);
  assert.equal(isReadableElementVisible(hiddenClass), false);
  assert.equal(isReadableElementVisible(null), false);
  console.log('ok - 可见性判断覆盖 hidden 属性与 hidden 类');
}

{
  const keyField = makeElement({
    tag: 'input',
    type: 'text',
    value: 'sk-secret-value',
    attrs: { id: 'api-key-input' },
  });
  const nameField = makeElement({
    tag: 'input',
    type: 'text',
    value: '小美',
    attrs: { placeholder: '角色名称' },
  });
  const panel = makeElement({
    text: '会话配置',
    descendants: { 'input, textarea, select': [keyField, nameField] },
  });
  const text = readVisibleText(panel, 1800);
  assert.ok(text.includes('会话配置'));
  assert.ok(text.includes('角色名称: 小美'));
  assert.ok(!text.includes('sk-secret-value'), 'API key 值不能出现在文字摘要中');
  console.log('ok - 文字摘要包含普通字段值并过滤敏感字段');
}

{
  const saveBtn = makeElement({ tag: 'button', text: '保存' });
  const activeTab = makeElement({ tag: 'button', text: '世界书', classes: ['is-active'] });
  const disabledBtn = makeElement({ tag: 'button', text: '删除', disabled: true });
  const hiddenBtn = makeElement({ tag: 'button', text: '隐藏按钮', hidden: true });
  const passwordField = makeElement({ tag: 'input', type: 'password', value: 'secret', attrs: { id: 'pwd' } });
  const filledField = makeElement({ tag: 'input', type: 'text', value: '测试世界书', attrs: { placeholder: '世界书名称' } });
  const emptyField = makeElement({ tag: 'textarea', attrs: { 'aria-label': '条目内容' } });
  const panel = makeElement({
    text: '世界书编辑器',
    descendants: {
      'button, [role="button"]': [saveBtn, activeTab, disabledBtn, hiddenBtn],
      'input, textarea, select': [passwordField, filledField, emptyField],
    },
  });
  const summary = buildElementUiSummary(panel);
  assert.deepEqual(summary.buttons, [
    { label: '保存' },
    { label: '世界书', active: true },
    { label: '删除', disabled: true },
  ]);
  assert.deepEqual(summary.fields[0], { label: 'pwd', type: 'password', filled: true, sensitive: true });
  assert.deepEqual(summary.fields[1], { label: '世界书名称', type: 'text', filled: true, value: '测试世界书' });
  assert.deepEqual(summary.fields[2], { label: '条目内容', type: 'textarea', filled: false });
  console.log('ok - 结构化摘要输出按钮状态与字段填写情况且不泄漏敏感值');
}

{
  const buttons = Array.from({ length: 50 }, (_, index) => makeElement({ tag: 'button', text: `按钮${index}` }));
  const panel = makeElement({
    text: '很多按钮',
    descendants: { 'button, [role="button"]': buttons },
  });
  const summary = buildElementUiSummary(panel, { maxControls: 10 });
  assert.equal(summary.buttons.length, 10, '控件数量应按 maxControls 截断');
  console.log('ok - 控件数量按上限截断');
}

console.log('agent-ui-inspect-utils-tests passed');

{
  // ref 收集：按钮带 ref 且注册表可回查
  const refs = new Map();
  const fakeBtn = (label) => ({
    tagName: 'BUTTON',
    innerText: label,
    classList: { contains: () => false },
    getAttribute: () => null,
    disabled: false,
  });
  const btns = [fakeBtn('设置'), fakeBtn('删除条目')];
  const element = {
    querySelectorAll: sel => (sel.includes('button') ? btns : []),
  };
  const summary = buildElementUiSummary(element, {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    collectRef: (ref, node) => refs.set(ref, node),
    refPrefix: 'test:',
  });
  assert.equal(summary.buttons.length, 2);
  assert.equal(summary.buttons[0].ref, 'test:btn-1');
  assert.equal(refs.get('test:btn-2'), btns[1], '注册表应能回查到节点');
  console.log('ok - inspect ref 收集与注册表回查');
}
