import assert from 'node:assert/strict';
import fs from 'node:fs';

const memoryEditorSource = fs.readFileSync(
  new URL('../../src/scripts/ui/memory-table-editor.js', import.meta.url),
  'utf8',
);
const memoryVisualSource = fs.readFileSync(
  new URL('../../src/assets/css/memory-table-redesign.css', import.meta.url),
  'utf8',
);
const indexSource = fs.readFileSync(
  new URL('../../src/index.html', import.meta.url),
  'utf8',
);

{
  assert.match(indexSource, /memory-table-redesign\.css/);
  assert.match(memoryEditorSource, /memory-table-block-header/);
  assert.match(memoryEditorSource, /memory-table-meta-pill/);
  assert.match(memoryEditorSource, /memory-table-toolbar/);
  assert.match(memoryEditorSource, /document\.createElement\('table'\)/);
  assert.match(memoryEditorSource, /memory-table-data-grid/);
  assert.match(memoryEditorSource, /memory-table-column-header/);
  assert.match(memoryEditorSource, /memory-table-cell-value/);
  assert.match(memoryEditorSource, /memory-table-row-controls/);
  assert.match(memoryEditorSource, /memory-editor-header/);
  assert.match(memoryEditorSource, /memory-editor-title/);
  assert.match(memoryEditorSource, /memory-editor-subtitle/);
  assert.match(memoryEditorSource, /memory-editor-field/);
  assert.match(memoryEditorSource, /memory-editor-field-hint/);
  assert.match(memoryEditorSource, /memory-editor-meta/);
  assert.match(memoryEditorSource, /memory-editor-footer-note/);
  assert.match(memoryVisualSource, /\.memory-table-block\s*\{[\s\S]*?border-radius:\s*18px[\s\S]*?box-shadow:/);
  assert.match(memoryVisualSource, /\.memory-table-data-grid\s*\{/);
  assert.match(memoryVisualSource, /\.memory-table-column-header\s*\{/);
  assert.match(memoryVisualSource, /\.memory-table-cell(?:,|\s*\{)/);
  assert.match(memoryVisualSource, /\.memory-editor-overlay\s*\{[\s\S]*?z-index:\s*26300[\s\S]*?backdrop-filter:/);
  assert.match(memoryVisualSource, /\.memory-editor-panel\s*\{[\s\S]*?z-index:\s*26310[\s\S]*?max-width:\s*560px[\s\S]*?border-radius:\s*18px/);
  assert.match(memoryVisualSource, /body:has\(\.memory-editor-panel\.is-open\)[\s\S]*?\.world-app-select-menu:not\(\.is-maid-guide-menu\)[\s\S]*?z-index:\s*26320/);
  assert.match(memoryVisualSource, /\.memory-editor-input:focus/);
  assert.match(
    memoryVisualSource,
    /body\[data-theme-mode=['"]dark['"]\]\s+\.memory-editor-panel[\s\S]*?\.memory-editor-button\.is-primary[\s\S]*?background:\s*linear-gradient\([\s\S]*?!important/,
  );
  assert.match(memoryVisualSource, /@keyframes\s+memory-editor-panel-in/);
  assert.match(memoryVisualSource, /@keyframes\s+memory-table-card-in/);
  assert.match(memoryVisualSource, /\.memory-table-prompt-wrap\[open\]\s+\.memory-table-prompt-body/);
  assert.match(memoryVisualSource, /@media\s*\(max-width:\s*640px\)/);
  assert.match(memoryVisualSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(memoryEditorSource, /MEMORY_SCOPE_BADGE_STYLE/);
  assert.match(memoryEditorSource, /modalPanel\.classList\.add\('is-open'\)/);
  assert.match(memoryEditorSource, /modalPanel\.classList\.remove\('is-open'\)/);
  assert.doesNotMatch(memoryEditorSource, /from ['"](?:react|lucide-react|tailwindcss)/);
  console.log('ok - memory table redesign ports actual column layout and motion without importing reference runtime logic');
}

const originalWindow = globalThis.window;
const originalCustomEvent = globalThis.CustomEvent;
const originalLocalStorage = globalThis.localStorage;
const originalSetTimeout = globalThis.setTimeout;

class TestCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

try {
  const events = [];
  const syncCalls = [];
  const listeners = new Map();
  const localItems = new Map();
  globalThis.setTimeout = () => 0;
  globalThis.localStorage = {
    getItem: key => localItems.get(String(key)) ?? null,
    setItem: (key, value) => {
      localItems.set(String(key), String(value));
    },
    removeItem: key => {
      localItems.delete(String(key));
    },
  };
  globalThis.CustomEvent = TestCustomEvent;
  globalThis.window = {
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent: event => {
      events.push(event);
      for (const handler of listeners.get(event.type) || []) handler(event);
      return true;
    },
    appBridge: {
      syncCurrentMemoryStateAfterTimelineRepair: async (...args) => {
        syncCalls.push(args);
        return true;
      },
    },
    toastr: {
      warning: () => {},
    },
  };

  const {
    MemoryTableEditor,
    buildMemoryTableCellViews,
    buildMemoryTableSelectFieldView,
  } = await import('../../src/scripts/ui/memory-table-editor.js');
  assert.deepEqual(
    buildMemoryTableCellViews(
      {
        nickname: '阳翔',
        gender: '男',
        keywords: '冒险、测试花园',
        notes: '第一行\n第二行',
      },
      [
        { id: 'nickname', name: '称呼', type: 'text' },
        { id: 'gender', name: '性别', type: 'select' },
        { id: 'keywords', name: '召回关键词', type: 'text' },
        { id: 'notes', name: '其他信息', type: 'multiline' },
        { id: 'missing', name: '未填写', type: 'text' },
      ],
    ),
    [
      { id: 'nickname', label: '称呼', type: 'text', kind: 'text', value: '阳翔', tags: [] },
      { id: 'gender', label: '性别', type: 'select', kind: 'chip', value: '男', tags: [] },
      { id: 'keywords', label: '召回关键词', type: 'text', kind: 'tag', value: '冒险、测试花园', tags: ['冒险', '测试花园'] },
      { id: 'notes', label: '其他信息', type: 'multiline', kind: 'long', value: '第一行\n第二行', tags: [] },
      { id: 'missing', label: '未填写', type: 'text', kind: 'text', value: '', tags: [] },
    ],
  );
  console.log('ok - memory table cell projection keeps template columns aligned with row_data values');

  const outlineSectionColumn = {
    id: 'section',
    name: '大纲分节',
    type: 'select',
    options: ['current', 'plot', 'relationships', 'open_threads', 'history'],
  };
  assert.deepEqual(
    buildMemoryTableCellViews(
      { section: 'relationships' },
      [outlineSectionColumn],
      { tableId: 'rp_outline' },
    ),
    [{
      id: 'section',
      label: '大纲类别',
      type: 'select',
      kind: 'chip',
      value: '关系变化',
      tags: [],
    }],
  );
  assert.deepEqual(
    buildMemoryTableSelectFieldView({
      column: outlineSectionColumn,
      tableId: 'rp_outline',
      value: 'plot',
    }),
    {
      value: 'plot',
      readOnly: false,
      options: [
        { value: 'current', label: '当前局面' },
        { value: 'plot', label: '主线进展' },
        { value: 'relationships', label: '关系变化' },
        { value: 'open_threads', label: '未决线索' },
      ],
    },
  );
  assert.deepEqual(
    buildMemoryTableSelectFieldView({
      column: outlineSectionColumn,
      tableId: 'rp_outline',
      value: 'history',
    }),
    {
      value: 'history',
      readOnly: true,
      options: [{ value: 'history', label: '迁移前历史' }],
    },
  );
  console.log('ok - outline sections use Chinese labels while migration history stays read-only and out of normal choices');

  const editor = new MemoryTableEditor({
    getContext: () => ({ type: 'contact', contactId: 'contact:1', uiMode: 'chat' }),
  });
  editor.template = { meta: { id: 'default-v1' } };
  editor.container = { style: {} };
  let renderCalls = 0;
  editor.renderPreservingScroll = async () => {
    renderCalls += 1;
  };

  const synced = await editor.syncManualMemoryMutation(
    { type: 'contact', contactId: 'contact:1', uiMode: 'chat' },
    { source: 'manual_memory_delete' },
  );

  assert.equal(synced, true);
  assert.deepEqual(syncCalls, [
    ['contact:1', { source: 'manual_memory_delete' }],
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'memory-rows-updated');
  assert.deepEqual(events[0].detail, {
    sessionId: 'contact:1',
    templateId: 'default-v1',
  });
  assert.equal(renderCalls, 0);
  window.dispatchEvent(new TestCustomEvent('memory-rows-updated', {
    detail: { sessionId: 'contact:1', templateId: 'default-v1' },
  }));
  assert.equal(renderCalls, 1);
  editor.destroy();
  console.log('ok - MemoryTableEditor syncs manual memory mutations into current turn snapshot without double-rendering itself');
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
  else globalThis.CustomEvent = originalCustomEvent;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  globalThis.setTimeout = originalSetTimeout;
}
