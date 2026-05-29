const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const truncate = (value = '', maxLength = 160) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  const limit = Math.max(20, Math.trunc(Number(maxLength) || 160));
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
};

const firstText = (...values) => {
  for (const value of values) {
    const text = trim(value);
    if (text) return text;
  }
  return '';
};

const baseCommitPreview = ({
  operation = '',
  surface = '',
  target = '',
  actor = '',
  content = '',
  effect = '',
  undoSummary = '',
} = {}) => ({
  reviewOnly: true,
  currentExecutionWrites: false,
  commitWouldWrite: true,
  confirmationRequired: true,
  undo: 'delete_created_event_or_snapshot',
  operation: trim(operation),
  surface: trim(surface),
  target: trim(target),
  actor: trim(actor),
  contentPreview: truncate(content),
  effect: trim(effect),
  undoSummary: trim(undoSummary, '提交后撤销应删除新增事件或回滚提交快照'),
  confirmationSummary: '真正提交前必须二次确认；当前 tool call 只捕获候选，不写入聊天或动态。',
  diff: {
    add: 1,
    update: 0,
    delete: 0,
  },
});

export const buildChatEmitCommitPreview = ({
  toolName = '',
  args = {},
  eventDraft = {},
  sessionId = '',
} = {}) => {
  const name = trim(toolName);
  if (!name.startsWith('chat.emit_')) return null;

  const src = isPlainObject(args) ? args : {};
  const event = isPlainObject(eventDraft) ? eventDraft : {};

  if (name === 'chat.emit_private') {
    const target = firstText(event.targetName, src.targetName, event.targetId, src.targetId, sessionId, '当前私聊');
    const actor = firstText(event.speakerName, src.speakerName, event.speakerId, src.speakerId);
    return baseCommitPreview({
      operation: 'append_private_message',
      surface: 'chat',
      target,
      actor,
      content: firstText(event.content, src.content),
      effect: `新增 1 条私聊消息到「${target}」`,
      undoSummary: '提交后撤销应删除该新增私聊消息或回滚提交快照',
    });
  }

  if (name === 'chat.emit_group') {
    const target = firstText(event.targetName, src.groupName, event.targetId, src.groupId, sessionId, '当前群聊');
    const actor = firstText(event.speakerName, src.speakerName, event.speakerId, src.speakerId);
    const isSystem = src.system === true || event.type === 'group_system_event';
    return baseCommitPreview({
      operation: isSystem ? 'append_group_system_event' : 'append_group_message',
      surface: 'chat',
      target,
      actor,
      content: firstText(event.content, src.content),
      effect: isSystem
        ? `新增 1 条群系统事件到「${target}」`
        : `新增 1 条群聊消息到「${target}」`,
      undoSummary: '提交后撤销应删除该新增群聊事件或回滚提交快照',
    });
  }

  if (name === 'chat.emit_moment_comment') {
    const target = firstText(event.targetId, src.momentId, '目标动态');
    const actor = firstText(event.speakerName, src.author);
    return baseCommitPreview({
      operation: 'append_moment_comment',
      surface: 'moments',
      target,
      actor,
      content: firstText(event.content, src.content),
      effect: `新增 1 条动态评论到「${target}」`,
      undoSummary: '提交后撤销应删除该新增动态评论或回滚提交快照',
    });
  }

  if (name === 'chat.emit_moment_post') {
    const target = firstText(event.targetId, src.momentId, '新动态');
    const actor = firstText(event.speakerName, src.author);
    return baseCommitPreview({
      operation: 'create_moment_post',
      surface: 'moments',
      target,
      actor,
      content: firstText(event.content, src.content),
      effect: target === '新动态'
        ? '新增 1 条动态发布'
        : `新增 1 条动态发布「${target}」`,
      undoSummary: '提交后撤销应删除该新增动态或回滚提交快照',
    });
  }

  return null;
};
