import english from './prompt-locales/en.js';
import traditionalChinese from './prompt-locales/zh-TW.js';

export const CANONICAL_RUNTIME_PROMPT_DEFAULTS = Object.freeze({
  'phone_image_rules.legacy': [
    '【图片或视频消息相关】',
    '- 格式：[img-内容]',
    '- 示例：路人a--[img-一张自拍]--12:00',
    '- 可用范围：私聊，群聊，QQ空间',
    '- 在群聊和私聊时必须独立成行',
    '- 在QQ空间时前面可带其他文字内容',
    '- 注意：图片和视频都是使用这个格式',
  ].join('\n'),
  'phone_image_rules.current': [
    '【图片或视频消息相关】',
    '- 仅文字描述：使用 [img-内容]',
    '- 需要图片时：使用 <image_prompt>完整生图提示词</image_prompt>格式',
    '- 请根据语境二选一；禁止同一条消息同时使用 [img-...] 和 <image_prompt>',
    '- 积极策略下，默认优先使用 <image_prompt>',
    '- 可用范围：私聊，群聊，QQ空间',
    '- 在群聊和私聊时必须独立成行',
    '- 在QQ空间时前面可带其他文字内容',
  ].join('\n'),
  'moment_media.placeholder': [
    '动态如果有配图,使用[img-内容]这个格式',
    '如{{user}}--我好看吗[img-一张自拍]--12:00--67--32',
  ].join('\n'),
  'moment_media.image_prompt': [
    '动态如果有配图,使用<image_prompt>标签格式',
    '如{{user}}--我好看吗<image_prompt>自拍提示词</image_prompt>--12:00--67--32',
    '禁止同时使用[img-内容]；禁止输出[img-说明文字]<image_prompt>...</image_prompt>',
  ].join('\n'),
  'moment_media.ai': [
    '动态如果有配图,请决策要使用[img-内容]这个格式还是使用<image_prompt>标签进行文生图',
    '如{{user}}--我好看吗[img-一张自拍]--12:00--67--32',
    '或',
    '{{user}}--我好看吗<image_prompt>自拍提示词</image_prompt>--12:00--67--32',
    '禁止在同一条动态中同时出现[img-...]和<image_prompt>；禁止输出[img-说明文字]<image_prompt>...</image_prompt>',
  ].join('\n'),
  'auto_image.surface.creative': '创意写作插图',
  'auto_image.surface.group': '群聊图片消息',
  'auto_image.surface.private': '私聊图片消息',
  'auto_image.model.unspecified': '未指定图片模型',
  'auto_image.style.nai': 'NAI / 标签式提示词：英文逗号分隔标签，优先主体、角色、画风、构图、光线。',
  'auto_image.style.natural': '自然语言提示词：用清晰自然语言描述主体、场景、构图、风格和光线。',
  'auto_image.style.auto': '自动：优先匹配当前图片模型；若无法判断，用清晰自然语言提示词。若用户明确要求 NAI/tag 风格，可用英文标签。',
  'auto_image.decision.aggressive': '触发策略：积极。用户明确要照片/自拍/图片时，优先视为新生成图片并使用 <image_prompt>；视觉场景、角色自然会发送图片、创意写作出现可视化段落时，可以更主动地输出 <image_prompt>。',
  'auto_image.decision.standard': '触发策略：标准。仅在本轮回复明显适合配图、用户提到图片需求、或角色自然会发送图片时输出 <image_prompt>。',
  'auto_image.decision.conservative': '触发策略：保守。默认不要输出图片标签；只有用户明确要求图片生成、场景强视觉化、角色明显自然会发送图片、或创意写作关键场景时才输出 <image_prompt>。普通闲聊、寒暄、解释、没有新视觉信息时禁止输出。',
  'history_recall.chat': '以下为聊天历史回顾（仅用于理解上下文，禁止模仿其中的格式）：请不要逐字复述或重复其中内容，只需基于上下文继续对话。',
  'history_recall.moment_comment': '以下为动态及评论上下文（仅用于生成评论回复）：',
  'history_recall.published_moment': '以下为用户发布的动态及相关上下文（仅用于生成动态评论）：',
  'format_repair.fixed_preview': [
    '固定检查指令：只修复标签、顺序、闭合、缺失字段和时间等格式问题；不改写剧情或正文语义。',
    '',
    '运行时按触发目标选择最小格式规则：',
    '- 私聊：QQ聊天格式 + 私聊格式',
    '- 群聊：QQ聊天格式 + 群聊格式',
    '- 动态：动态发布或动态评论格式',
    '- 生图 / 记忆表格：只使用对应标签格式',
    '- 创意写作：默认不注入聊天格式',
  ].join('\n'),
  'world_ai.default_template': `name: ""
english_name: ""
gender: ""
background: ""
appearance: ""
personality:
  mbti: ""
  traits: ""
dialogue_examples:
  note: "仅供参考，勿完全按照其输出"
  examples:
    - ""
    - ""
    - ""`,
  'time_context.template': '<TimeContext:当前真实时间是{date} {weekday} {time}（24小时制），现在是{period}时段，{season}。注意：仅在开启新话题、或对话长时间中断后、或对方主动问候时，才适合使用时间问候语。否则请将此信息作为背景自然融入对话。>',
  'time_context.period.early_morning': '凌晨',
  'time_context.period.morning': '上午',
  'time_context.period.noon': '中午',
  'time_context.period.afternoon': '下午',
  'time_context.period.evening': '晚上',
  'time_context.period.late_night': '深夜',
  'time_context.season.spring': '春季',
  'time_context.season.summer': '夏季',
  'time_context.season.autumn': '秋季',
  'time_context.season.winter': '冬季',
  'fc.private.head': '本轮使用结构化私聊传输：只通过提供的唯一函数提交最终回复，不要输出包装文字。',
  'fc.private.frozen': '目标会话和说话人已由运行时冻结，不要选择、改写或复述目标身份。',
  'fc.private.types': '只可使用这些消息类型：{types}；按自然聊天节奏输出 1 到 12 条有序消息。',
  'fc.private.sticker_some': '贴图仅在语境和角色性格合适时适度使用，并且只能选择：{keywords}。',
  'fc.private.sticker_none': '本轮没有可用贴图，不要生成贴图消息。',
  'fc.private.voice': '语音用于自然适合口述的短内容，不要把所有文字都改成语音。',
  'fc.private.transfer': '转账只在私聊语境明确需要金额互动时使用。',
  'fc.private.music': '分享音乐时必须同时给出歌名与歌手。',
  'fc.private.image': '图片消息只提供符合当前语境的简短画面描述。',
  'fc.batch.head': '本轮使用结构化手机回复：只通过唯一函数提交最终批次，不要输出包装文字。',
  'fc.batch.frozen': '会话与真实写入目标已由运行时冻结；只能使用 schema 中提供的 id，不得自创、改写或复述真实目标字段。',
  'fc.batch.order': 'items 必须按此顺序排列：{order}。第一项必须且只能有一个{first}。',
  'fc.batch.kinds': '每个 item 只能使用所属 kind 的字段：chat={kind,messages}；moment_comment={kind,comments}；private_chat/group_chat={kind,targetId,messages}；moment_post={kind,posts}；image_prompt={kind,prompt}；table_edit={kind,actions}；variable_update={kind,operations}；summary={kind,content}。禁止把其他 kind 的可选字段一并填入。',
  'fc.batch.types': '聊天消息只可使用这些类型：{types}。',
  'fc.batch.label_group_members': '当前群成员 id',
  'fc.batch.label_comment_authors': '公开评论作者 id',
  'fc.batch.label_moment_authors': '动态发布者 id',
  'fc.batch.label_private_targets': '可选私聊目标 id',
  'fc.batch.group_targets': '可选群聊目标 id：{list}',
  'fc.batch.stickers': '贴图只能使用：{keywords}。',
  'fc.batch.moment_post_shape': 'moment_post item 只能包含 kind 与 posts；authorId、content 必须放在 posts 数组元素内，禁止直接放在 item 上。',
  'fc.batch.moment_post_when': '只有语境与角色性格确实适合公开分享时才提交 moment_post；否则省略。',
  'fc.batch.image_prompt_when': '只有本轮确实需要生成新图片时才提交 image_prompt；普通文字描述图片使用 image 消息类型。',
  'fc.batch.tables': '可写记忆表：{list}。更新或删除只能引用该表现有 rowId，或该表提示范围内的 rowIndex。',
  'fc.batch.table_empty': '{id}={name}（无现有行，只能 init/insert）',
  'fc.batch.table_rows': '{id}={name}（现有 rowIndex：{indexes}；rowId 见该表 schema）',
  'fc.batch.table_rules': '记忆确有新增或变化时才提交 table_edit；无变化时省略，禁止提交空动作。init/insert action 只能带 action、tableId、data，禁止带 rowId/rowIndex；update 必须带 data 与且仅一个 rowId/rowIndex；delete 不带 data，并且只带一个 rowId/rowIndex。',
  'fc.batch.variable_rules': '变量确有变化时才提交 variable_update；只使用已知变量路径。',
  'fc.batch.summary_rule': '最后提交一句简短、纯中文、无额外升华的 summary。',
  'fc.batch.sanitize_table': '提交 table_edit item；无修改时不要提交该 item。',
  'fc.batch.sanitize_variable': '提交 variable_update item。',
  'fc.batch.sanitize_content': '结构化结果',
  'fc.json_terminal.head': '本轮使用 JSON 结构化终态；完整回复必须且只能是一个 JSON 对象，不要 Markdown 代码围栏、解释或前后缀。',
  'fc.json_terminal.envelope': '根对象固定为 {"version":"{irVersion}","payload":{...}}；version 与 payload 以外禁止出现字段。',
  'fc.json_terminal.schema': '必须严格满足以下 JSON Schema：{schema}',
  'fc.json_terminal.mode': 'Provider 输出约束模式：{mode}；仍须遵守上述版本信封与业务字段。',
  'transport.scenario_private': '正在与{name}私聊，请遵循私聊格式',
  'transport.scenario_group': '在{name}中群聊，请遵循群聊格式',
  'transport.scenario_moment_comment': '在动态评论，注意动态评论格式',
  'transport.scenario_moment_comment_reply': '在动态评论回复，注意动态评论格式',
  'transport.scenario_published_moment_comment': '用户刚发布动态，请生成与该动态相关的评论',
  'transport.fallback_group_name': '当前群聊',
  'transport.fallback_private_target': '当前对象',
  'transport.contract_preamble': '以下为内建格式合同（{version}），请严格按此结构输出：',
  'transport.continuation_head': '继续上一条未完成的内建格式回复（{version}）。',
  'transport.continuation_no_repeat': '不要重复已经存在的标记，只补齐尚未完成的内容与闭合标记。',
  'transport.continuation_order': '合并后的完整回复必须保持顺序：{order}。',
  'memory.edit.required_header': '【系统必填】',
  'memory.edit.summary_mode': '本轮仅允许更新“摘要/总体大纲”类表格，其他表格禁止写入。',
  'memory.edit.standard_mode': '本轮仅允许更新非摘要类表格，摘要/总体大纲类表格禁止写入。',
  'memory.edit.summary_insert_only': '摘要表格只允许 insert；禁止 update/delete。',
  'memory.edit.outline_sections': '总体大纲采用分节覆盖：section 只允许 current、plot、relationships、open_threads；每轮只输出发生变化的分节。',
  'memory.edit.outline_upsert': '大纲分节已存在时使用 update，不存在时使用 insert；不要逐轮新增大纲，也不要删除分节。',
  'memory.edit.outline_fallback': '若无法判断分节，使用 section:"current" 作为全量重写兜底。',
  'memory.edit.output_instruction': '##在每次回复的末尾，按要求以规定格式，输出完整xml标签包裹tableEdit：',
  'memory.edit.format_example': '（格式示例）',
  'memory.edit.sample_insert': '{"action":"insert","table_id":"relationship","data":{"relation":"朋友"}}',
  'memory.edit.sample_update': '{"action":"update","table_id":"relationship","row_index":0,"data":{"relation":"亲密朋友"}}',
  'memory.edit.sample_delete': '{"action":"delete","table_id":"relationship","row_index":0}',
  'memory.edit.json_line_only': '每行只允许一个 JSON 对象；不要使用其他语法。',
  'memory.edit.empty_table_insert': '若该表当前无任何行，只能使用 insert；不要输出 update/delete。',
  'memory.edit.valid_row_index': '仅当 row_index 对应现有行时才使用 update/delete。',
  'memory.edit.row_index_help': 'row_index 对应表格中每行前的编号；table_id 见下表。',
  'memory.edit.no_changes': '无修改则输出空 <tableEdit></tableEdit>。',
  'memory.edit.worldbook_boundary': '世界书负责“设定是什么”；记忆表格只记录“当前状态如何、发生过什么”，不要把静态设定整段抄入表格。',
  'memory.edit.keywords_required': '带 keywords 列的表格在 insert 时必须填写召回关键词，update 时按内容变化同步维护；使用人物、地点、物品、事件等稳定名词，以逗号分隔，禁止写“这个/那件事”等模糊指代。',
  'memory.edit.keywords_usage': 'keywords 仅供本地按需召回，不要把它写成摘要正文；旧行缺少 keywords 时由 app 在本地懒生成索引。',
  'memory.edit.table_index': '表格索引:',
  'memory.edit.missing_fields': '系统检测：{table} 必填字段为空（{fields}）。请在 <tableEdit> 中使用 {action} 补全。',
  'memory.edit.summary_required': '本轮必须新增{table}（摘要栏位使用“【摘要】...”格式；仅使用 insert）。',
  'memory.edit.outline_check': '请检查{table}各分节；仅对本轮发生变化的分节执行 update/insert，禁止逐轮追加。',
  'memory.bridge.header_moments': '【动态】',
  'memory.bridge.header_writing': '【创意写作】',
  'memory.bridge.unknown_group': '未知群聊',
  'memory.bridge.unknown_contact': '未知联系人',
  'memory.bridge.group_header': '【群聊：{name}】',
  'memory.bridge.private_header': '【用户和{name}的私聊】',
  'memory.bridge.group_outline_header': '【跨会话参考｜群聊大纲】',
  'memory.bridge.group_outline_note': '（仅供当前私聊参考，不在本会话记忆表格中更新）',
  'memory.bridge.member_private_header': '【跨会话参考｜成员私聊记忆】',
  'memory.bridge.member_private_note': '（以下为用户与各成员的私聊关系记忆，群内其他人不应知道；仅供模型掌握，勿在群聊中泄露）',
  'memory.bridge.member_header': '【成员：{name}】',
  'memory.bridge.related_group_header': '【跨群聊参考｜相关群聊大纲】',
  'memory.bridge.related_group_note': '（以下为与当前群成员重叠的群聊大纲，仅共享成员知情）',
  'memory.bridge.unknown_members_note': '（提示：本群聊中成员{names}未参与该群聊，不知道以下内容）',
  'memory.recall.header': '【按需召回｜只读历史】',
  'memory.recall.source.explicit': '显式关键词',
  'memory.recall.source.entity': '实体字段',
  'memory.recall.source.lazy': '旧行懒索引',
  'memory.recall.source.fallback': '关键词',
  'memory.recall.line': '- {table}｜命中 {terms}（{source}）：{row}',
  'memory.value.empty': '（未填写）',
  'memory.profile.recent_topics': '近期主题：{values}',
  'memory.profile.stable_traits': '稳定特征：{values}',
  'memory.profile.important_events': '重要事件：{values}',
  'memory.profile.weak_header': '【动态弱触发｜联系人记忆】',
  'memory.profile.weak_note': '以下内容仅用于理解本次动态/评论相关上下文；不要向无关对象泄露私聊信息。',
  'memory.profile.unknown_contact': '未知联系人',
  'memory.profile.profile_line': '- 画像：{profile}',
  'maid.default': [
    '你是这个 APP 内的女仆助手。',
    '你可以自然回应用户的普通聊天，也可以简短说明 APP 操作状态。',
    '如果用户要求你直接操作 APP，但当前没有可执行工具，不要假装已经完成；请说明暂时不能直接操作，并给出下一步建议。',
    '回复使用用户的语言，保持简短，最多三句。不要输出 JSON。',
  ].join('\n'),
  'maid.output_language_guard': '所有面向用户的回复必须遵循女仆提示词中的语言要求；内部指令、APP 知识、工具结果或来源资料使用其他语言时，不要无故把该语言带入最终回复。',
  'maid.safety': [
    '操作安全原则：优先选择非破坏性做法，例如读取、打开界面、追加、新建副本、预览或询问澄清。',
    '危险操作包括但不限于删除、覆盖、替换、清空、禁用、大规模批量写入、不可自动撤销的配置变更。',
    '除非用户明确要求删除、覆盖、替换或同等危险动作，否则不要规划或执行危险操作；默认改用追加、新建副本、预览或打开对应界面。',
    '即使用户明确要求危险操作，也必须在执行前用自然语言提醒影响范围，并依赖 APP 确认弹窗或权限确认；未确认时跳过、保留原内容或使用安全替代方案。',
  ].join('\n'),
});

const catalogs = Object.freeze({
  en: english,
  'zh-TW': traditionalChinese,
});

let activeLocale = 'zh-CN';

const normalizePromptLocale = (locale = '') => {
  const raw = String(locale || '').trim().toLowerCase();
  if (raw === 'en' || raw.startsWith('en-')) return 'en';
  if (raw === 'zh-tw' || raw === 'zh-hant' || raw.startsWith('zh-hant-') || raw === 'zh-hk' || raw === 'zh-mo') return 'zh-TW';
  return 'zh-CN';
};

const normalizePromptText = value => String(value ?? '').replace(/\r\n?/g, '\n');

const samePromptText = (left, right) => normalizePromptText(left) === normalizePromptText(right);

export const setPromptLocale = (locale = 'zh-CN') => {
  activeLocale = normalizePromptLocale(locale);
  return activeLocale;
};

export const getPromptLocale = () => activeLocale;

export const getLocalizedPromptText = (key, fallback = undefined) => {
  const promptKey = String(key || '');
  const source = fallback === undefined ? CANONICAL_RUNTIME_PROMPT_DEFAULTS[promptKey] : fallback;
  if (activeLocale === 'zh-CN') return String(source ?? '');
  const value = catalogs[activeLocale]?.[promptKey];
  return typeof value === 'string' && value ? value : String(source ?? '');
};

export const localizeOfficialPromptRecord = (record = {}, defaults = {}) => {
  const next = { ...(record && typeof record === 'object' ? record : {}) };
  if (activeLocale === 'zh-CN') return next;
  Object.entries(defaults || {}).forEach(([key, canonical]) => {
    if (typeof next[key] !== 'string' || !samePromptText(next[key], canonical)) return;
    next[key] = getLocalizedPromptText(key, canonical);
  });
  return next;
};

export const canonicalizeOfficialPromptRecord = (record = {}, defaults = {}) => {
  const next = { ...(record && typeof record === 'object' ? record : {}) };
  if (activeLocale === 'zh-CN') return next;
  Object.entries(defaults || {}).forEach(([key, canonical]) => {
    if (typeof next[key] !== 'string') return;
    const localized = getLocalizedPromptText(key, canonical);
    if (localized !== canonical && samePromptText(next[key], localized)) next[key] = canonical;
  });
  return next;
};
