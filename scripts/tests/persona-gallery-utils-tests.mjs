import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildPersonaGalleryDetails,
  filterPersonaGalleryItems,
} from '../../src/scripts/ui/persona-gallery-utils.js';

const personas = [
  {
    id: 'musashi',
    name: '武藏',
    description: '沉稳的舰船角色',
    source: { originalFile: 'musashi.png', format: 'chara_card_v2' },
  },
  {
    id: 'mia',
    name: '米娅',
    description: '喜欢甜点',
    source: { originalFile: 'mia.json' },
  },
];

{
  assert.deepEqual(filterPersonaGalleryItems(personas, '').map(item => item.id), ['musashi', 'mia']);
  assert.deepEqual(filterPersonaGalleryItems(personas, '武藏').map(item => item.id), ['musashi']);
  assert.deepEqual(filterPersonaGalleryItems(personas, '甜点').map(item => item.id), ['mia']);
  assert.deepEqual(filterPersonaGalleryItems(personas, 'MUSASHI.PNG').map(item => item.id), ['musashi']);
  console.log('ok - 角色卡浏览支持名称、描述与来源文件搜索');
}

{
  const details = buildPersonaGalleryDetails(personas[0], {
    data: {
      description: '原始角色描述',
      personality: '外冷内热',
      scenario: '港区日常',
      tags: ['舰娘', '重樱'],
      creator: '作者 A',
    },
  });
  assert.equal(details.description, '沉稳的舰船角色');
  assert.equal(details.personality, '外冷内热');
  assert.equal(details.scenario, '港区日常');
  assert.deepEqual(details.tags, ['舰娘', '重樱']);
  assert.equal(details.creator, '作者 A');
  assert.match(details.sourceLabel, /chara_card_v2/);
  console.log('ok - 角色卡背面详情优先保留手动描述并补充原卡信息');
}

{
  const appSource = await readFile(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');
  const panelSource = await readFile(new URL('../../src/scripts/ui/persona-panel.js', import.meta.url), 'utf8');
  const cssSource = await readFile(new URL('../../src/assets/css/main.css', import.meta.url), 'utf8');
  assert.match(appSource, /data-action="browse-cards"/);
  assert.match(appSource, /personaPanel\.showGallery\(\)/);
  assert.match(panelSource, /class="persona-gallery-grid"/);
  assert.match(panelSource, /data-persona-gallery-flip/);
  assert.match(cssSource, /\.persona-gallery-card\.is-flipped/);
  assert.match(cssSource, /prefers-reduced-motion:\s*reduce[\s\S]*\.persona-gallery-card-inner/);
  console.log('ok - 角色卡切换器、卡片翻面与减弱动效契约完整');
}

{
  const panelSource = await readFile(new URL('../../src/scripts/ui/persona-panel.js', import.meta.url), 'utf8');
  const cssSource = await readFile(new URL('../../src/assets/css/main.css', import.meta.url), 'utf8');
  // 背面是「速览 + 动作」：简介 clamp、标签行、完整资料入口，不再内嵌滚动详情
  assert.match(panelSource, /persona-gallery-back-intro/);
  assert.match(panelSource, /persona-gallery-back-tags/);
  assert.match(panelSource, /openGalleryDetailOverlay/);
  assert.match(panelSource, /openGalleryMoreMenu/);
  assert.doesNotMatch(panelSource, /persona-gallery-detail-body/);
  assert.match(cssSource, /\.persona-gallery-back-intro\s*\{[^}]*-webkit-line-clamp/);
  assert.match(cssSource, /\.persona-gallery-detail-overlay/);
  // 动作区单行：使用 + 新聊天 + 更多菜单，编辑/存档收进 ⋯
  const actionsBlock = cssSource.match(/\.persona-gallery-card-actions\s*\{[^}]*\}/)?.[0] || '';
  assert.match(actionsBlock, /display:\s*flex/);
  // Esc 关闭与失败不缓存
  assert.match(panelSource, /galleryKeydownHandler/);
  assert.match(panelSource, /if \(!loadFailed\) this\.galleryDetailCache\.set/);
  console.log('ok - 背面速览化：简介/标签/完整资料浮层与单行动作契约完整');
}

console.log('persona-gallery-utils-tests passed');
