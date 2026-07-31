import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-capabilities-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-capabilities-0731.jsonl',
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

add('group_create', '在后台建立群聊「V4F-V2联合观测组-0731」，成员只包含「V4F-V2观测站-A-0731」和「V4F-V2观测站-B-0731」。当前用户隐式参与，不要把用户名放进成员，也不要打开群聊。', ['group.create'], ['group.create'], { expectedDisposition: 'create_group_with_exact_members' });
add('group_read_members', '只读「V4F-V2联合观测组-0731」的群成员，确认恰好是 A、B 两个观测站，不要打开或修改。', ['app.resource.read'], ['app.read_resource']);
add('group_update_members', '把「V4F-V2联合观测组-0731」中的 B 移出并加入 C，最终成员必须恰好为 A、C；后台执行，不打开群聊。', ['group.members.update'], ['group.update_members'], { expectedDisposition: 'replace_one_group_member' });
add('group_verify_members', '只读核对「V4F-V2联合观测组-0731」最终成员集合，必须是 A、C，不要修改。', ['app.resource.read'], ['app.read_resource']);
add('session_create_delete_targets', '在后台建立三个一次性聊天室「V4F-V2待删-E-0731」「V4F-V2待删-F-0731」「V4F-V2保留-G-0731」，已存在就复用，全部不要进入。', ['session.create'], ['session.create'], { expectedDisposition: 'create_three_background_sessions' });
add('session_delete_preview', '只预览批量删除「V4F-V2待删-E-0731」和「V4F-V2待删-F-0731」的清单及影响，本轮绝对不要真正删除。', ['session.delete_many'], ['session.delete_many'], { expectedDisposition: 'preview_only_no_delete' });
add('session_delete_preview_verify', '读取会话列表，确认刚才只是预览，E、F 与保留的 G 都还存在。', ['session.list'], ['session.list']);
add('session_delete_cancel', '请求批量删除 E、F；出现最终删除确认列表时取消，验证取消路径不应删除任何聊天室。', ['session.delete_many'], ['session.delete_many'], { autoConfirm: false, autoDeny: true, expectedDisposition: 'structured_delete_cancelled' });
add('session_delete_cancel_verify', '读取会话列表，确认取消后 E、F、G 仍全部存在。', ['session.list'], ['session.list']);
add('session_delete_apply', '现在正式批量删除「V4F-V2待删-E-0731」和「V4F-V2待删-F-0731」，只删这两个；确认后执行并报告逐项结果。', ['session.delete_many'], ['session.delete_many'], { confirmButtonLabels: ['确认删除'], expectedDisposition: 'structured_delete_applied' });
add('session_delete_apply_verify', '读取会话列表，确认 E、F 已不存在，「V4F-V2保留-G-0731」仍存在，其他观测站与群聊未受影响。', ['session.list'], ['session.list']);
add('worldbook_create_delete_targets', '明确创建两本一次性世界书「V4F-V2待删书-X-0731」和「V4F-V2待删书-Y-0731」，各自只写一个同名短条目“temporary”；不要绑定到任何会话。', ['worldbook.create'], ['worldbook.create'], { expectedDisposition: 'create_two_unbound_worldbooks' });
add('worldbook_delete_targets_verify', '只读世界书列表，确认 X、Y 两本待删书存在且不是内建世界书。', ['worldbook.list'], ['worldbook.list']);
add('worldbook_delete_preview', '只预览批量删除 X、Y 两本待删书的清单、绑定数与保护状态，不要真正删除。', ['worldbook.delete_many'], ['worldbook.delete_many'], { expectedDisposition: 'preview_only_no_delete' });
add('worldbook_delete_cancel', '请求批量删除 X、Y；最终确认列表出现时取消，本轮不得删除。', ['worldbook.delete_many'], ['worldbook.delete_many'], { autoConfirm: false, autoDeny: true, expectedDisposition: 'structured_delete_cancelled' });
add('worldbook_delete_apply', '正式批量删除 X、Y 两本一次性世界书，只删这两本；确认后执行并报告逐项结果。', ['worldbook.delete_many'], ['worldbook.delete_many'], { confirmButtonLabels: ['确认删除'], expectedDisposition: 'structured_delete_applied' });
add('worldbook_delete_verify', '读取世界书列表，确认 X、Y 已不存在，而「V4F-V2档案库-0731」和「V4F-V2长文库-0731」仍存在。', ['worldbook.list'], ['worldbook.list']);
add('image_config_read', '分别读取当前生图配置的活跃档、provider 和 model，只返回公开字段；不要切换、不要生图。', ['config.model.switch'], ['config.list_profiles']);
add('image_capability_read', '只查能力目录：用当前 NAI 给联系人生成头像时，提示词语言、方言、subjectAliases、比例和写回步骤应如何处理？不要真的生图。', ['app.capabilities.search'], [], { expectedAnyTools: ['app.search_feature', 'app.read_feature_doc'] });
add('maid_memory_list', '列出你目前保存的长期语义记忆，只返回 kind、key、简短内容和置信度；不要归档或删除。', ['maid.memory.list'], ['maid.memory.list']);
add('maid_memory_archive_missing', '尝试归档一个明确不存在的记忆 ID「memory-v4f-v2-missing-404」；找不到就安全停止，不能改其他记忆。', ['maid.memory.archive'], ['maid.memory.archive'], { expectedDisposition: 'missing_memory_no_change' });
add('persona_create_delete_targets', '明确新建两张一次性角色卡「V4F-V2待删角色-P-0731」和「V4F-V2待删角色-Q-0731」，都不要设为当前角色卡，不要创建关联资源。', ['persona.create'], ['persona.create'], { expectedDisposition: 'create_two_inactive_personas' });
add('persona_delete_apply', '批量删除「V4F-V2待删角色-P-0731」和「V4F-V2待删角色-Q-0731」，只删这两张；确认后执行，当前 V4F-V2 角色卡必须保留。', ['persona.delete_many'], ['persona.delete_many'], { confirmButtonLabels: ['确认删除'], expectedDisposition: 'delete_two_inactive_personas' });
add('capabilities_final_audit', '最后只读核对：当前角色卡仍是「冻结观察V4F-V2-0731」；P、Q 已不存在；E、F 与 X、Y 已删除；G、A、B、C、D、测试群聊和三本保留世界书仍在。不要补建或修复任何缺项。', ['app.resource.read'], ['app.read_resource'], { expectedDisposition: 'cross_resource_read_only_audit', maxMs: 600_000 });

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
