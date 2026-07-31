import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-complex-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-complex-0731.jsonl',
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

const importedPreviewPrompt = [
  '我现在就在「冻结观察V4F-V2-0731」这张测试导入角色卡里。',
  '请从它关联的「V4F-V2导入卡资料-0731」世界书挑出适合长期聊天的主要人物，准备给每个人各建一个私聊，并建立「V4F-V2霜港调查组-0731」群聊。',
  '先把候选人物、来源、将创建的内容和世界书处理方式列给我确认，这一步不要真正创建。',
  '所有新聊天室直接继承角色卡的共用世界书，不要新建人物书，也不要把共用书重复写入 session 直接绑定；头像和壁纸暂时不做。',
].join('\n');

add('imported_card_preview_then_cancel', importedPreviewPrompt, [], [], { autoConfirm: false, expectedDisposition: 'awaiting_confirmation_zero_write', maxMs: 600_000 });
add('imported_card_cancel', '先取消刚才那份建房计划，什么都不要创建；请明确告诉我冻结快照已经取消。', [], [], { autoConfirm: false, expectedDisposition: 'cancel_pending_workflow_zero_write' });
add('imported_card_cancel_verify', '读取会话列表，确认取消后没有出现艾琳·洛、顾风、米娅或「V4F-V2霜港调查组-0731」；不要补建。', ['session.list'], ['session.list']);
add('imported_card_preview_again', importedPreviewPrompt, [], [], { autoConfirm: false, expectedDisposition: 'awaiting_confirmation_zero_write', maxMs: 600_000 });
add('imported_card_confirm', '确认，就按刚才冻结的名单创建私聊和「V4F-V2霜港调查组-0731」群聊。完成后只读核对群成员、角色卡世界书继承和直接绑定；保持后台，不要打开房间。', [], [], { confirmButtonLabels: ['确认创建', '确认修改'], expectedAnyTools: ['session.create', 'group.create', 'app.read_resource'], expectedDisposition: 'consume_frozen_workflow_and_verify', maxMs: 600_000 });
add('imported_card_verify', '独立读取新建结果：艾琳·洛、顾风、米娅三个私聊应各只有一个；霜港调查组成员应恰好是三人；四个会话都继承「V4F-V2导入卡资料-0731」，directWorldIds 必须为空。', ['app.resource.read'], ['app.read_resource'], { expectedDisposition: 'verify_sessions_members_and_worldbooks', maxMs: 600_000 });
add('three_chat_messages', '分别给艾琳·洛、顾风、米娅三个私聊后台写入一条用户消息：“【霜港测试】请先待命。”；三条都必须 triggerReply:false、open:false，不能漏人、不能触发角色回复。', ['chat.send_message'], ['chat.send_message'], { expectedDisposition: 'three_sibling_messages_no_reply', maxMs: 600_000 });
add('three_chat_readback', '分别读取艾琳·洛、顾风、米娅三个私聊的最后一条消息，确认角色都是 user、正文完全一致；不要打开房间。', ['app.resource.read'], ['app.read_resource'], { expectedDisposition: 'three_sibling_readback', maxMs: 600_000 });
add('three_format_profiles', '为艾琳·洛、顾风、米娅三个私聊分别保存同一测试格式画像：回复必须用 <frostport>...</frostport> 包裹，来源写“V4F-V2 霜港测试”；不要打开聊天室。', ['chat.format.profile'], ['chat.save_format_profile'], { expectedDisposition: 'save_three_profiles', maxMs: 600_000 });
add('three_format_profiles_verify', '分别读取艾琳·洛、顾风、米娅的格式画像，确认三份都包含 <frostport> 规则和测试来源。', ['chat.format.profile'], ['chat.read_format_profile'], { expectedDisposition: 'verify_three_profiles', maxMs: 600_000 });
add('sub_agent_append_two', '使用长正文 Sub-agent，给「V4F-V2导入卡资料-0731」追加两个原创测试条目：「雾潮预警」和「遗迹勘察流程」，每条约 160 字；不要改已有 12 条，写完读回确认。', ['worldbook.create'], ['worldbook.generate_entries'], { allowSubAgent: true, expectedDisposition: 'append_two_delegated_entries', maxMs: 900_000 });
add('sub_agent_append_verify', '只读「V4F-V2导入卡资料-0731」，确认原 12 条仍在，新加两条各只有一个，并核对正文长度与主题。', ['worldbook.read'], ['worldbook.read']);
add('partial_bind_failure', '把「V4F-V2长文库-0731」追加绑定到两个目标：真实的「艾琳·洛」和不存在的「V4F-V2恢复目标-H-0731」。允许部分成功；必须报告逐项结果和精确 retry，不能把失败写到别的房间。', ['worldbook.bind_sessions'], ['worldbook.bind_sessions'], { expectedDisposition: 'partial_failure_with_retry', maxMs: 600_000 });
add('partial_bind_recovery', '根据上一轮的失败结果，只创建缺少的「V4F-V2恢复目标-H-0731」，然后只对这个失败目标重试绑定「V4F-V2长文库-0731」并读回；不要重做艾琳·洛。', ['session.create', 'worldbook.bind_sessions'], ['session.create', 'worldbook.bind_sessions'], { expectedDisposition: 'retry_only_failed_target', maxMs: 600_000 });
add('complex_final_audit', '做一次只读收尾：核对三位霜港人物私聊、霜港调查组精确成员、四个会话的角色卡共用书继承与空 direct bindings、三条待命消息、三份格式画像、世界书 14 条，以及恢复目标 H 只绑定长文库。不要补写任何缺项。', ['app.resource.read'], ['app.read_resource'], { expectedDisposition: 'multi_resource_read_only_audit', maxMs: 900_000 });
add('open_primary_result', '前面所有工作完成后，现在只打开主要结果「V4F-V2霜港调查组-0731」给我看；不要逐个打开私聊，也不要发送消息。', ['session.open'], ['session.open'], { expectedDisposition: 'open_only_primary_group', followGuide: true });

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
