import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-rebuild-core-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-rebuild-core-0730.jsonl',
);

const sharedBoundary = [
  '共同背景仅限：故事位于千叶市立总武高等学校；侍奉部在平塚静指导下接受学生委托并协助解决问题。',
  '桐谷澪是本企划原创人物，不是原作设定：与主角团同年级，成绩优秀但体育、临场表达与主动求助并不突出；幼年失去原家庭照料后由平塚静依法收养。',
  '不预设桐谷澪的恋爱对象，不代替用户决定行动、台词、思想或感受；角色只可知道在当前对话与合理经历中获知的资讯，不得读取其他私聊。',
].join('');

tasks.push({
  id: 'oregairu-rebuild-core-0730-001',
  batch,
  category: 'natural_user_create_private_worldbooks_a',
  prompt: [
    '先帮我把八幡和雪乃的私聊资料整理成两本独立世界书。请严格照我给的正文建立，不要上网扩写，不要绑定角色卡，也先不要绑定聊天室；若同名已存在就停下，不要做副本。',
    `世界书“比企谷八幡·私聊资料”建立 3 条：\n1. 标题“作用域与原创设定”，关键词“比企谷八幡,八幡,桐谷澪,总武高,侍奉部”，正文：“本书仅供比企谷八幡私聊使用。${sharedBoundary}”\n2. 标题“比企谷八幡”，关键词“比企谷八幡,八幡”，正文：“比企谷八幡是总武高二年F班学生。性格孤僻、观察尖锐，习惯以自嘲和独自承担代价的方式处理问题；在平塚静要求下加入侍奉部，与雪之下雪乃共同处理委托。小町是他的妹妹。保持他不擅长直率表达、却会认真观察矛盾与人际代价的特点。”\n3. 标题“私聊资讯边界”，关键词“私聊,边界”，正文：“八幡只能使用本聊天室里出现的内容和合理共同经历；不得自动知道雪乃、结衣、平塚静其他聊天室的内容，也不得把创意写作或群聊中的未发生事件当成私聊既成事实。”`,
    `世界书“雪之下雪乃·私聊资料”建立 3 条：\n1. 标题“作用域与原创设定”，关键词“雪之下雪乃,雪乃,桐谷澪,总武高,侍奉部”，正文：“本书仅供雪之下雪乃私聊使用。${sharedBoundary}”\n2. 标题“雪之下雪乃”，关键词“雪之下雪乃,雪乃”，正文：“雪之下雪乃是总武高二年J班学生，也是侍奉部部长。外貌出众、成绩优异、能力全面，言辞冷静直接，对自己和他人要求严格；不擅长以圆滑方式处理亲密关系，但会认真承担接受的委托。保持她逻辑清晰、克制而非无缘由刻薄的特点。”\n3. 标题“私聊资讯边界”，关键词“私聊,边界”，正文：“雪乃只能使用本聊天室里出现的内容和合理共同经历；不得自动知道八幡、结衣、平塚静其他聊天室的内容，也不得把创意写作或群聊中的未发生事件当成私聊既成事实。”`,
    '完成后分别读取两本书，确认各自恰好 3 条且没有绑定角色卡。',
  ].join('\n\n'),
  expectedFeatures: ['worldbook.create'],
  expectedTools: ['worldbook.create'],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 900_000,
});

tasks.push({
  id: 'oregairu-rebuild-core-0730-002',
  batch,
  category: 'natural_user_create_private_worldbooks_b',
  prompt: [
    '接着照下面正文建立结衣和平塚老师的两本独立私聊世界书。不要上网扩写，不要绑定角色卡，也先不要绑定聊天室；若同名已存在就停下，不要做副本。',
    `世界书“由比滨结衣·私聊资料”建立 3 条：\n1. 标题“作用域与原创设定”，关键词“由比滨结衣,结衣,桐谷澪,总武高,侍奉部”，正文：“本书仅供由比滨结衣私聊使用。${sharedBoundary}”\n2. 标题“由比滨结衣”，关键词“由比滨结衣,结衣”，正文：“由比滨结衣是总武高二年F班学生，与八幡同班，后来经由委托与侍奉部产生联系。她待人开朗、重视群体气氛和朋友关系，善于拉近距离，但有时会为了维持气氛压下自己的真实想法；料理并不拿手。保持她体贴、主动而仍会犹豫的一面。”\n3. 标题“私聊资讯边界”，关键词“私聊,边界”，正文：“结衣只能使用本聊天室里出现的内容和合理共同经历；不得自动知道八幡、雪乃、平塚静其他聊天室的内容，也不得把创意写作或群聊中的未发生事件当成私聊既成事实。”`,
    `世界书“平塚静·私聊资料”建立 3 条：\n1. 标题“作用域与原创设定”，关键词“平塚静,静老师,桐谷澪,总武高,侍奉部”，正文：“本书仅供平塚静私聊使用。${sharedBoundary}”\n2. 标题“平塚静”，关键词“平塚静,静老师”，正文：“平塚静是总武高国语教师，也是侍奉部顾问。她会直接介入问题、推动学生面对自身矛盾，并负责把八幡带到侍奉部。面对桐谷澪时同时具有监护人与教师身份：关心可以明确，但不能把用户写成失去独立判断的孩子，也不能凭空替用户决定生活细节。”\n3. 标题“私聊资讯边界”，关键词“私聊,边界”，正文：“平塚静只能使用本聊天室里出现的内容、监护关系内合理知道的家庭事实与共同经历；不得自动知道八幡、雪乃、结衣其他聊天室的内容，也不得把创意写作或群聊中的未发生事件当成私聊既成事实。”`,
    '完成后分别读取两本书，确认各自恰好 3 条且没有绑定角色卡。',
  ].join('\n\n'),
  expectedFeatures: ['worldbook.create'],
  expectedTools: ['worldbook.create'],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 900_000,
});

tasks.push({
  id: 'oregairu-rebuild-core-0730-003',
  batch,
  category: 'natural_user_create_creative_worldbook',
  prompt: [
    '再建立一本“总武高·侍奉部创意写作资料”，用于以后创意写作汇总。它现在只能建立、不能绑定角色卡或任何私聊；若同名已存在就停下，不要做副本。正文严格使用下面 7 条，不要上网扩写。',
    `1. 标题“世界与侍奉部”，关键词“总武高,侍奉部,千叶”，正文：“${sharedBoundary}”`,
    '2. 标题“比企谷八幡”，关键词“比企谷八幡,八幡”，正文：“总武高二年F班学生；孤僻、观察尖锐，习惯自嘲和独自承担代价；被平塚静要求加入侍奉部，与雪之下雪乃共同处理委托。小町是他的妹妹。”',
    '3. 标题“雪之下雪乃”，关键词“雪之下雪乃,雪乃”，正文：“总武高二年J班学生、侍奉部部长；外貌出众、成绩优异、能力全面，言辞冷静直接，对自己和他人要求严格，不擅长圆滑处理亲密关系。”',
    '4. 标题“由比滨结衣”，关键词“由比滨结衣,结衣”，正文：“总武高二年F班学生，与八幡同班；开朗、重视群体气氛和朋友关系，善于拉近距离，有时会为了维持气氛压下真实想法，料理并不拿手。”',
    '5. 标题“平塚静”，关键词“平塚静,静老师”，正文：“总武高国语教师、侍奉部顾问；会直接介入问题并推动学生面对自身矛盾。本企划中她依法收养桐谷澪，此关系属于原创设定。”',
    '6. 标题“桐谷澪”，关键词“桐谷澪,用户”，正文：“本企划原创人物，与主角团同年级；深棕色中长发、灰绿色眼睛，成绩优秀，但体育、临场表达与主动求助并不突出；幼年失去原家庭照料后由平塚静依法收养。不预设恋爱对象。”',
    '7. 标题“叙事与资讯边界”，关键词“叙事边界,资讯边界”，正文：“不得代替用户决定行动、台词、思想或感受。不同私聊的隐私默认互不相通；只有明确发生在群聊、共同场景或由当事人转述的资讯才可共享。原创设定不得伪称原作事实。”',
    '完成后读取它，确认恰好 7 条，并确认没有绑定当前角色卡。',
  ].join('\n\n'),
  expectedFeatures: ['worldbook.create'],
  expectedTools: ['worldbook.create'],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 900_000,
});

tasks.push({
  id: 'oregairu-rebuild-core-0730-004',
  batch,
  category: 'natural_user_create_private_chats',
  prompt: [
    '现在在当前“总武高·侍奉部企划”角色卡里，后台建立四个独立私聊：比企谷八幡、雪之下雪乃、由比滨结衣、平塚静。',
    '不要建立名叫“侍奉部”的普通聊天室，不要创建群聊，不要打开任何聊天室，也不要生成图片。完成后列出当前聊天室，确认四个名字各只有一个。',
  ].join('\n\n'),
  expectedFeatures: ['session.create'],
  expectedTools: ['session.create'],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 900_000,
});

tasks.push({
  id: 'oregairu-rebuild-core-0730-005',
  batch,
  category: 'natural_user_bind_private_worldbooks',
  prompt: [
    '请把四个私聊的世界书绑定做成严格一对一，使用 replace 模式：',
    '比企谷八幡聊天室只绑定“比企谷八幡·私聊资料”；雪之下雪乃聊天室只绑定“雪之下雪乃·私聊资料”；由比滨结衣聊天室只绑定“由比滨结衣·私聊资料”；平塚静聊天室只绑定“平塚静·私聊资料”。',
    '“总武高·侍奉部创意写作资料”不能绑定任何私聊，也不能绑定角色卡。完成后逐一读取四个会话的绑定并核对，每个会话必须恰好一本、且就是同名人物的私聊资料；发现不一致就明确报告，不要用追加模式补救。',
  ].join('\n\n'),
  expectedFeatures: ['worldbook.bind_session'],
  expectedTools: ['worldbook.bind_session'],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 900_000,
});

if (!process.argv.includes('--batch')) process.argv.push('--batch', batch);
if (!process.argv.includes('--output')) process.argv.push('--output', defaultOutput);
if (!process.argv.includes('--expected-maid-model')) {
  process.argv.push('--expected-maid-model', 'gpt-5.6-luna');
}
if (!process.argv.includes('--expected-maid-profile')) {
  process.argv.push('--expected-maid-profile', 'pioneer');
}
if (!process.argv.includes('--expected-maid-provider')) {
  process.argv.push('--expected-maid-provider', 'custom');
}

await import('./run-batch.mjs');
