import assert from 'node:assert/strict';

import {
  buildContactDetailMarkup,
  buildContactPersonaFields,
  buildContactDetailViewModel,
  createContactDetailRuntime,
} from '../../src/scripts/ui/contact-detail-runtime-utils.js';

const makeClassList = () => {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    toggle(name, force) {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
      return values.has(name);
    },
    contains: name => values.has(name),
  };
};

const flushAsync = () => new Promise(resolve => setTimeout(resolve, 0));

{
  const fields = buildContactPersonaFields([
    {
      id: 'old',
      table_id: 'character_profile',
      is_active: false,
      updated_at: 20,
      row_data: { personality: '不应显示' },
    },
    {
      id: 'profile',
      table_id: 'character_profile',
      updated_at: 30,
      row_data: {
        personality: '外冷内热',
        likes: '甜点、雨天',
        taboos: '被欺骗',
        notes: '<script>保密</script>',
      },
    },
    { id: 'other', table_id: 'relationship', row_data: { personality: '无关表格' } },
  ]);
  assert.deepEqual(fields, [
    { id: 'personality', label: '性格', value: '外冷内热' },
    { id: 'likes', label: '喜好', value: '甜点、雨天' },
    { id: 'taboos', label: '雷区', value: '被欺骗' },
    { id: 'notes', label: '其他信息', value: '<script>保密</script>' },
  ]);
  assert.deepEqual(buildContactPersonaFields([]).map(field => field.value), ['', '', '', '']);
  console.log('ok - buildContactPersonaFields reads the active character profile and leaves missing cells blank');
}

{
  const model = buildContactDetailViewModel({
    contact: {
      id: 'contact:1',
      name: '好友甲',
      description: '安静但可靠',
      labels: ['可靠', '夜猫子'],
      libraryTags: ['可靠', '搭档'],
      addedAt: '2026-07-18T00:00:00.000Z',
    },
    messageCount: 27,
    now: Date.parse('2026-07-21T00:00:00.000Z'),
  });
  assert.deepEqual(model, {
    id: 'contact:1',
    name: '好友甲',
    isGroup: false,
    description: '安静但可靠',
    tags: ['可靠', '搭档', '夜猫子'],
    daysKnown: 4,
    messageCount: 27,
    memberCount: 0,
  });
  console.log('ok - buildContactDetailViewModel derives compact contact profile stats');
}

{
  const html = buildContactDetailMarkup({
    model: {
      id: 'contact:unsafe',
      name: '<img src=x onerror=alert(1)>',
      isGroup: false,
      description: '<script>bad()</script>',
      tags: ['<b>tag</b>'],
      daysKnown: 2,
      messageCount: 3,
      memberCount: 0,
    },
    avatar: 'avatar.png?x="bad',
    personaFields: buildContactPersonaFields([{
      table_id: 'character_profile',
      row_data: { personality: '<script>quiet</script>', likes: '茶' },
    }]),
  });
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('&lt;b&gt;tag&lt;/b&gt;'), true);
  assert.equal(html.includes('&lt;script&gt;quiet&lt;/script&gt;'), true);
  assert.equal(html.includes('contact-detail-persona-label">性格'), true);
  assert.equal(html.includes('contact-detail-persona-label">喜好'), true);
  assert.equal((html.match(/contact-detail-stat-icon/g) || []).length, 3);
  assert.equal(html.includes('data-action="contact-detail-message"'), true);
  console.log('ok - buildContactDetailMarkup escapes memory fields, renders stat icons, and keeps message as the explicit action');
}

{
  let clickHandler = null;
  const container = {
    innerHTML: '',
    classList: makeClassList(),
    addEventListener(type, handler) {
      if (type === 'click') clickHandler = handler;
    },
  };
  const selectedItem = { dataset: { session: 'contact:1' }, classList: makeClassList() };
  const otherItem = { dataset: { session: 'contact:2' }, classList: makeClassList() };
  const calls = [];
  const eventListeners = {};
  let personaRows = [{
    table_id: 'character_profile',
    row_data: { personality: '安静', likes: '看书', taboos: '', notes: '' },
  }];
  const runtime = createContactDetailRuntime({
    containerEl: container,
    contactListRoots: [{ querySelectorAll: () => [selectedItem, otherItem] }],
    getContact: id => ({ id, name: id === 'contact:1' ? '好友甲' : '好友乙', labels: [] }),
    resolveAvatar: id => `${id}.png`,
    getMessageCount: () => 6,
    getPersonaRows: async () => personaRows,
    eventTarget: {
      addEventListener(type, handler) {
        eventListeners[type] = handler;
      },
    },
    onMessage: payload => calls.push(payload),
  });

  runtime.mount();
  assert.equal(container.innerHTML.includes('选择一位联系人'), true);
  assert.equal(runtime.select('contact:1'), true);
  assert.equal(container.classList.contains('is-active'), true);
  assert.equal(selectedItem.classList.contains('is-selected'), true);
  assert.equal(otherItem.classList.contains('is-selected'), false);
  await flushAsync();
  assert.equal(container.innerHTML.includes('安静'), true);
  assert.equal(container.innerHTML.includes('看书'), true);

  personaRows = [{
    table_id: 'character_profile',
    row_data: { personality: '更开朗', likes: '旅行', taboos: '失约', notes: '怕冷' },
  }];
  eventListeners['memory-rows-updated']({ detail: { sessionId: 'contact:1' } });
  await flushAsync();
  assert.equal(container.innerHTML.includes('更开朗'), true);
  assert.equal(container.innerHTML.includes('失约'), true);

  clickHandler({
    target: {
      closest: selector => selector === '[data-action]' ? { dataset: { action: 'contact-detail-message' } } : null,
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'contact:1');
  assert.equal(calls[0].name, '好友甲');

  clickHandler({
    target: {
      closest: selector => selector === '[data-action]' ? { dataset: { action: 'contact-detail-close' } } : null,
    },
  });
  assert.equal(container.classList.contains('is-active'), false);
  assert.equal(selectedItem.classList.contains('is-selected'), false);
  assert.equal(runtime.getSelectedId(), '');
  console.log('ok - contact detail runtime syncs memory rows and only its message button enters chat');
}

{
  let personaReadCount = 0;
  const container = {
    innerHTML: '',
    classList: makeClassList(),
    addEventListener() {},
  };
  const runtime = createContactDetailRuntime({
    containerEl: container,
    getContact: id => ({ id, name: '测试群聊', isGroup: true, members: ['a', 'b'] }),
    getPersonaRows: async () => {
      personaReadCount += 1;
      return [{
        table_id: 'character_profile',
        row_data: { personality: '群聊不应显示此内容' },
      }];
    },
  });

  runtime.mount();
  assert.equal(runtime.select('group:test'), true);
  await flushAsync();
  assert.equal(personaReadCount, 0);
  assert.equal(container.innerHTML.includes('群聊不应显示此内容'), false);
  assert.equal(container.innerHTML.includes('contact-detail-persona'), false);
  assert.equal(container.innerHTML.includes('创建天数'), true);
  assert.equal(container.innerHTML.includes('相识天数'), false);
  console.log('ok - group contact detail omits the persona section without reading private-chat profile memory');
}
