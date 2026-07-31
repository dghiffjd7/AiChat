import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-core-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-core-0731.jsonl',
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

add('session_create_idempotent', '先检查「V4F-V2观测站-A-0731」是否存在；已有就复用，不得创建第二个同名聊天室，也不要进入。', ['session.create'], ['session.list'], { expectedDisposition: 'reuse_without_duplicate' });
add('session_read', '读取聊天室清单，确认「V4F-V2观测站-A-0731」与「V4F-V2观测站-B-0731」各只有一个。', ['session.list'], ['session.list']);
add('chat_send_no_reply', '给「V4F-V2观测站-B-0731」后台写入“【V4F-V2-B】只写不回”，必须 triggerReply:false 且 open:false。', ['chat.send_message'], ['chat.send_message'], { expectedDisposition: 'append_without_reply_or_navigation' });
add('chat_read_cross_session', '保持当前页面不变，读取「V4F-V2观测站-B-0731」最后一条消息的角色与正文。', ['app.resource.read'], ['app.read_resource']);
add('session_open', '打开「V4F-V2观测站-A-0731」，不要发送任何消息。', ['session.open'], ['session.open'], { followGuide: true });
add('app_state', '读取 APP 状态，确认当前会话确实是「V4F-V2观测站-A-0731」、当前角色卡和用户仍是 V4F-V2 测试项。', ['app.state.read'], ['app.get_current_state']);
add('user_create_inactive', '读取用户清单；不存在时才创建「V4F-V2备用用户-0731」，但不要切换成它。', ['user.create'], ['app.read_resource', 'user.create'], { expectedDisposition: 'create_or_reuse_inactive_user' });
add('resource_user', '只读用户清单，确认「V4F-V2备用用户-0731」存在，当前用户仍是「冻结观察用户V4F-V2-0731」。', ['app.resource.read'], ['app.read_resource']);
add('persona_create_inactive', '读取角色卡清单；不存在时才创建「V4F-V2备用角色卡-0731」，但不得设为当前角色卡。', ['persona.create'], ['app.read_resource', 'persona.create'], { expectedDisposition: 'create_or_reuse_inactive_persona' });
add('resource_persona', '只读角色卡清单，确认「V4F-V2备用角色卡-0731」存在，当前角色卡仍是「冻结观察V4F-V2-0731」。', ['app.resource.read'], ['app.read_resource']);
add('worldbook_read', '读取「V4F-V2档案库-0731」的条目索引与「观察门牌」完整正文，不要修改。', ['worldbook.read'], ['worldbook.read']);
add('worldbook_update', '只把「V4F-V2档案库-0731」的「观察门牌」正文更新为“仅用于 Deepseek V4 Flash 冻结观察 v2；禁止用于正式资料。”，然后读回。', ['worldbook.update_entries'], ['worldbook.update_entries', 'worldbook.read'], { expectedDisposition: 'update_one_entry_and_verify' });
add('worldbook_read_verify', '读回「V4F-V2档案库-0731」的「观察门牌」，核对更新后的完整正文。', ['worldbook.read'], ['worldbook.read']);
add('worldbook_append', '向「V4F-V2档案库-0731」追加短条目「核心批次标记」，正文“CORE-0731”；已有同名条目就不要重复。', ['worldbook.create'], ['worldbook.create'], { expectedDisposition: 'append_or_reuse_one_entry' });
add('worldbook_read_dedupe', '读取「V4F-V2档案库-0731」，确认「核心批次标记」只有一个。', ['worldbook.read'], ['worldbook.read']);
add('worldbook_bind_session', '把「V4F-V2档案库-0731」追加绑定到「V4F-V2观测站-A-0731」，保留原绑定，完成后读回确认。', ['worldbook.bind_session'], ['worldbook.bind_session'], { expectedDisposition: 'bind_and_verify' });
add('worldbook_list_binding', '查询「V4F-V2观测站-A-0731」的世界书绑定，只读核对「V4F-V2档案库-0731」已启用。', ['worldbook.list'], ['worldbook.list']);
add('worldbook_delete_deny', '尝试删除「V4F-V2档案库-0731」的「核心批次标记」。这是拒绝测试，出现确认时取消，不得删除。', ['worldbook.delete_entries'], [], { autoConfirm: false, autoDeny: true, expectedDisposition: 'permission_denied_no_delete' });
add('worldbook_read_after_deny', '读取「V4F-V2档案库-0731」，确认刚才取消后「核心批次标记」仍存在。', ['worldbook.read'], ['worldbook.read']);
add('config_read', '列出聊天模型档并指出当前档，只返回公开字段，不能显示密钥。', ['config.model.switch'], ['config.list_profiles']);
add('config_switch_current', '把聊天模型切到当前已经启用的「Deepseek」档；若本来就是它，保持不变并说明 already active。', ['config.model.switch'], ['config.list_profiles', 'config.switch_profile'], { expectedDisposition: 'already_active_no_change' });
add('config_switch_missing', '尝试切到不存在的聊天配置「V4F-V2不存在档-404」；找不到就停止，不能模糊匹配。', ['config.model.switch'], ['config.list_profiles'], { expectedAnyTools: ['config.switch_profile'], expectedDisposition: 'target_not_found_no_change' });
add('missing_session_open', '打开不存在的聊天室「V4F-V2无此会话-404」；找不到必须停止，不能打开当前或相近房间。', ['session.open'], ['session.open'], { expectedDisposition: 'target_not_found_no_navigation' });
add('missing_chat_send', '给不存在的聊天室「V4F-V2无此会话-404」发送“不得落库”；目标不存在时停止，绝不能改发到当前房间。', ['chat.send_message'], ['chat.send_message'], { expectedDisposition: 'target_not_found_no_fallback' });
add('missing_worldbook', '读取不存在的世界书「V4F-V2无此书-404」；找不到就如实回答，不得创建。', ['worldbook.read'], ['worldbook.read'], { expectedDisposition: 'target_not_found_no_create' });
add('missing_resource_session', '用结构化资源读取不存在的会话「V4F-V2无此会话-404」；不要回退读取当前会话。', ['app.resource.read'], ['app.read_resource'], { expectedDisposition: 'target_not_found_no_fallback' });
add('avatar_missing_user', '把我这次附带的图片设为当前用户头像；如果其实没有附件，就不要猜 attachmentId，也不要调用设置工具。', ['user.avatar.set'], [], { expectedDisposition: 'clarify_missing_attachment' });
add('avatar_missing_persona', '把本轮附件设成当前角色卡头像；没有附件时禁止调用头像设置工具。', ['persona.avatar.set'], [], { expectedDisposition: 'clarify_missing_attachment' });
add('avatar_missing_contact', '替「V4F-V2观测站-A-0731」换成本轮附图；若没有附图就停止询问，不能复用旧附件。', ['contact.avatar.set'], [], { expectedDisposition: 'clarify_missing_attachment' });
add('wallpaper_missing', '用本轮附件给「V4F-V2观测站-A-0731」换壁纸；没有附件就不要准备图片或写入。', ['session.wallpaper.set'], [], { expectedDisposition: 'clarify_missing_attachment' });
add('session_create_more', '检查后只创建缺少的两个后台聊天室「V4F-V2观测站-C-0731」和「V4F-V2观测站-D-0731」，不得进入。', ['session.create'], ['session.create', 'session.list'], { expectedDisposition: 'create_or_reuse_two_background_sessions' });
add('session_read_four', '列出所有以「V4F-V2观测站-」开头的会话，确认 A、B、C、D 各只有一个。', ['session.list'], ['session.list']);
add('session_create_idempotent_again', '再次请求创建「V4F-V2观测站-A-0731」；必须复用已有房间，不能产生同名副本。', ['session.create'], ['session.list'], { expectedDisposition: 'no_duplicate' });
add('worldbook_create_idempotent', '再次请求建立「V4F-V2档案库-0731」里的「观察门牌」；已有同名条目时只读核对，不得重复追加或覆盖。', ['worldbook.create'], ['worldbook.read'], { expectedDisposition: 'no_duplicate_no_overwrite' });
add('worldbook_bind_many', '把「V4F-V2档案库-0731」追加绑定到 A、B 两个观测站；A 已绑定时保持幂等，B 补上，保留各房原绑定。', ['worldbook.bind_sessions'], ['worldbook.bind_sessions'], { expectedDisposition: 'batch_bind_idempotent_and_apply' });
add('worldbook_bind_many_verify', '分别只读核对 A、B 两个观测站的世界书绑定，确认两者都有「V4F-V2档案库-0731」。', ['worldbook.list'], ['worldbook.list'], { expectedDisposition: 'verify_two_bindings' });
add('format_profile_save', '为「V4F-V2观测站-A-0731」保存测试格式画像：每次 AI 回复必须用 <v4f_v2>...</v4f_v2> 包裹，来源标记为冻结观察。', ['chat.format.profile'], ['chat.save_format_profile'], { expectedDisposition: 'save_test_format_profile' });
add('format_profile_read', '读取「V4F-V2观测站-A-0731」的格式画像，确认包含 <v4f_v2> 规则和冻结观察来源；不要修改。', ['chat.format.profile'], ['chat.read_format_profile']);
add('errors_read', '读取本批拒绝、缺目标、缺附件产生的最近错误，按 failureCode 简短归类。', ['app.errors.read'], ['app.read_recent_errors']);
add('final_state', '最后读取 APP 状态，确认当前角色卡、用户、聊天模型和会话没有被拒绝测试或缺目标流程意外改动。', ['app.state.read'], ['app.get_current_state']);

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
