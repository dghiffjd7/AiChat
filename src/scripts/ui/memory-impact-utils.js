const normalizeMemoryScope = (scope = '') => {
  const raw = String(scope || '').trim().toLowerCase();
  if (['global', 'contact', 'group', 'rp', 'moments'].includes(raw)) return raw;
  return '';
};

export const formatMemoryImpactScopeLabel = ({
  contextType = '',
  uiMode = '',
  sessionId = '',
  contactId = '',
  groupId = '',
  scope = '',
} = {}) => {
  const normalizedScope = normalizeMemoryScope(scope);
  const mode = String(uiMode || '').trim().toLowerCase();
  const type = String(contextType || '').trim().toLowerCase();
  const sid = String(sessionId || '').trim();
  const cid = String(contactId || '').trim();
  const gid = String(groupId || '').trim();

  if (normalizedScope === 'global' || type === 'global') return '全局记忆（所有会话可共享）';
  if (mode === 'moments' || normalizedScope === 'moments' || sid === 'moments') return '动态记忆';
  if (normalizedScope === 'group' || type === 'group') return gid ? `群聊「${gid}」记忆` : '群聊记忆';
  if (normalizedScope === 'rp' || type === 'rp') return cid || sid ? `创意写作/RP「${cid || sid}」记忆` : '创意写作/RP 记忆';
  if (normalizedScope === 'contact' || type === 'contact') return cid || sid ? `聊天室「${cid || sid}」记忆` : '聊天室记忆';
  return sid ? `当前会话「${sid}」记忆` : '当前会话记忆';
};

export const buildMemoryImpactText = ({
  contextType = '',
  uiMode = '',
  sessionId = '',
  contactId = '',
  groupId = '',
  scope = '',
  action = 'manage',
} = {}) => {
  const target = formatMemoryImpactScopeLabel({
    contextType,
    uiMode,
    sessionId,
    contactId,
    groupId,
    scope,
  });
  if (action === 'edit') {
    return `影响范围：${target}。保存会立即写入记忆表格，并影响后续提示词注入、弱触发画像/记忆和 Agent 读表；取消或关闭不会保存本次编辑。`;
  }
  if (action === 'delete') {
    return `影响范围：${target}。删除后后续提示词、世界书导出和 Agent 读表都不会再看到这些记忆；取消确认不会删除。`;
  }
  if (action === 'batch_update') {
    return `影响范围：${target}。批量启用/停用会立即改变后续提示词可见的记忆集合；不会修改记忆内容本身。`;
  }
  if (action === 'import') {
    return `影响范围：${target}。导入会批量写入记忆数据，覆盖冲突或跳过重复取决于后续选择；建议先导出备份，取消确认不会写入。`;
  }
  if (action === 'template_import') {
    return `影响范围：记忆模板结构。导入或覆盖模板会改变表格列、范围和注入配置；取消确认不会保存模板。`;
  }
  if (action === 'export_worldbook') {
    return `影响范围：${target}。导出世界书会把当前表格内容追加到目标世界书，后续消息可能被世界书条目触发；取消确认不会写入世界书。`;
  }
  if (action === 'repair') {
    return `影响范围：${target}。修正只会更新摘要/大纲的 time 与排序，用于让后续记忆注入顺序更稳定；取消确认不会修改。`;
  }
  return `影响范围：${target}。记忆表格会影响后续提示词注入、弱触发画像/记忆和 Agent 读表；关闭面板不会撤销已保存内容。`;
};
