import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-pilot-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-pilot-0731.jsonl',
);

const add = (category, prompt, expectedFeatures = [], expectedTools = [], options = {}) => {
  const index = tasks.filter(task => task.batch === batch).length + 1;
  tasks.push({
    id: `${batch}-${String(index).padStart(3, '0')}`,
    batch,
    category,
    prompt,
    expectedFeatures,
    expectedTools,
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    ...options,
  });
};

add(
  'session_read_empty_scope',
  '先别切换页面，读取当前角色卡下的聊天室清单，告诉我总数和名称；只读，不要创建或打开。',
  ['session.list'],
  ['session.list'],
);
add(
  'app_state',
  '请读取 APP 状态后告诉我当前模式、页面、角色卡、用户和会话 ID，不要根据画面猜。',
  ['app.state.read'],
  ['app.get_current_state'],
);
add(
  'config_read',
  '读取聊天模型配置，告诉我当前启用档、服务商和模型；不要切换，也不要显示任何密钥。',
  ['config.model.switch'],
  ['config.list_profiles'],
);
add(
  'capability_discovery',
  '只查能力目录：如果我要批量删除聊天室，女仆会使用什么能力、有哪些确认限制？现在不要删除。',
  ['app.capabilities.search'],
  [],
  { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] },
);
add(
  'no_tool',
  '不要调用任何工具，只回复“V4F-V2 冻结观察已开始”。',
  [],
  [],
  { autoConfirm: false, autoDeny: true },
);
add(
  'session_create_many',
  '请在后台创建两个测试私聊「V4F-V2观测站-A-0731」和「V4F-V2观测站-B-0731」；如果已存在就复用，不要进入任何房间。',
  ['session.create'],
  ['session.create'],
  { expectedDisposition: 'create_or_reuse_two_sessions' },
);
add(
  'session_read_verify',
  '读取聊天室清单，确认「V4F-V2观测站-A-0731」和「V4F-V2观测站-B-0731」各只有一个；不要打开。',
  ['session.list'],
  ['session.list'],
);
add(
  'chat_send_no_reply',
  '给「V4F-V2观测站-A-0731」后台写入一条用户消息“【V4F-V2】仅写入，不触发回复。”，必须 triggerReply:false，也不要打开聊天室。',
  ['chat.send_message'],
  ['chat.send_message'],
  { expectedDisposition: 'append_user_message_without_reply' },
);
add(
  'chat_read_cross_session',
  '不打开聊天室，读取「V4F-V2观测站-A-0731」最后一条消息，核对角色和完整正文。',
  ['app.resource.read'],
  ['app.read_resource'],
);
add(
  'worldbook_create_short',
  '新建世界书「V4F-V2档案库-0731」，只追加短条目「观察门牌」，正文为“仅用于 Deepseek V4 Flash 冻结观察 v2。”；同名同正文已存在时不得重复。',
  ['worldbook.create'],
  ['worldbook.create'],
  { expectedDisposition: 'create_or_reuse_short_worldbook_entry' },
);
add(
  'sub_agent_generate',
  '使用擅长长正文的 Sub-agent，在世界书「V4F-V2长文库-0731」生成约 140 字的条目「雾港通行规则」：潮雾、蓝色灯塔、三短一长鸣笛、守夜人核验通行证。只生成这一条并读回确认。',
  ['worldbook.create'],
  ['worldbook.generate_entries'],
  {
    allowSubAgent: true,
    expectedDisposition: 'delegate_generate_and_verify',
    maxMs: 600_000,
  },
);
add(
  'worldbook_verify_two',
  '分别读取「V4F-V2档案库-0731」与「V4F-V2长文库-0731」，确认各自的测试条目存在、没有同名重复，并简述正文；不要修改。',
  ['worldbook.read'],
  ['worldbook.read'],
  { expectedDisposition: 'verify_two_worldbooks' },
);

if (!process.argv.includes('--batch')) process.argv.push('--batch', batch);
if (!process.argv.includes('--output')) process.argv.push('--output', defaultOutput);
if (!process.argv.includes('--expected-maid-model')) {
  process.argv.push('--expected-maid-model', 'deepseek-v4-flash');
}
if (!process.argv.includes('--expected-maid-profile')) {
  process.argv.push('--expected-maid-profile', 'Deepseek');
}
if (!process.argv.includes('--expected-maid-provider')) {
  process.argv.push('--expected-maid-provider', 'deepseek');
}

await import('./run-batch.mjs');
