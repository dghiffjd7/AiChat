const DAY_MS = 24 * 60 * 60 * 1000;
const PERSONA_FIELD_DEFINITIONS = Object.freeze([
  { id: 'personality', label: '性格' },
  { id: 'likes', label: '喜好' },
  { id: 'taboos', label: '雷区' },
  { id: 'notes', label: '其他信息' },
]);

const asText = value => String(value ?? '').trim();

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeTags = (contact) => {
  const tags = [
    ...(Array.isArray(contact?.libraryTags) ? contact.libraryTags : []),
    ...(Array.isArray(contact?.labels) ? contact.labels : []),
  ];
  return [...new Set(tags.map(asText).filter(Boolean))].slice(0, 8);
};

const asMemoryCellText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value).trim();
  }
};

const memoryRowTimestamp = (row) => {
  const value = Number(row?.updated_at || row?.created_at || 0);
  return Number.isFinite(value) ? value : 0;
};

export const buildContactPersonaFields = (rows = []) => {
  const profileRows = (Array.isArray(rows) ? rows : [])
    .filter(row => (
      asText(row?.table_id || row?.tableId) === 'character_profile'
      && row?.is_active !== false
    ))
    .sort((a, b) => memoryRowTimestamp(b) - memoryRowTimestamp(a));
  const rowData = profileRows[0]?.row_data && typeof profileRows[0].row_data === 'object'
    ? profileRows[0].row_data
    : {};
  return PERSONA_FIELD_DEFINITIONS.map(field => ({
    ...field,
    value: asMemoryCellText(rowData[field.id]),
  }));
};

const resolveDaysKnown = (addedAt, now) => {
  const timestamp = Number(addedAt) || Date.parse(asText(addedAt));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 1;
  const elapsed = Math.max(0, Number(now || Date.now()) - timestamp);
  return Math.max(1, Math.floor(elapsed / DAY_MS) + 1);
};

export const buildContactDetailViewModel = ({
  contact = null,
  messageCount = 0,
  now = Date.now(),
} = {}) => {
  const id = asText(contact?.id);
  if (!id) return null;
  const isGroup = Boolean(contact?.isGroup) || id.startsWith('group:');
  return {
    id,
    name: asText(contact?.name) || id,
    isGroup,
    description: asText(contact?.description),
    tags: normalizeTags(contact),
    daysKnown: resolveDaysKnown(contact?.addedAt, now),
    messageCount: Math.max(0, Number(messageCount) || 0),
    memberCount: isGroup && Array.isArray(contact?.members) ? contact.members.length : 0,
  };
};

export const buildContactDetailEmptyMarkup = () => `
  <div class="contact-detail-empty">
    <div class="contact-detail-empty-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path><path d="M19 5v4M17 7h4"></path></svg>
    </div>
    <strong>选择一位联系人</strong>
    <span>查看角色资料，再决定是否开始聊天</span>
  </div>
`;

const buildContactStatIcon = (kind) => {
  if (kind === 'days') {
    return '<svg class="contact-detail-stat-icon is-days" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18"></path><rect x="3" y="4" width="18" height="18" rx="3"></rect></svg>';
  }
  if (kind === 'messages') {
    return '<svg class="contact-detail-stat-icon is-messages" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"></path><path d="M8 9h8M8 13h5"></path></svg>';
  }
  if (kind === 'members') {
    return '<svg class="contact-detail-stat-icon is-meta" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="4"></circle><path d="M2 21a7 7 0 0 1 14 0M16 4.5a4 4 0 0 1 0 7.5M18 15a6 6 0 0 1 4 6"></path></svg>';
  }
  return '<svg class="contact-detail-stat-icon is-meta" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 13.6 11 4H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8Z"></path><circle cx="7.5" cy="7.5" r="1"></circle></svg>';
};

export const buildContactDetailMarkup = ({ model, avatar = '', personaFields = [] } = {}) => {
  if (!model?.id) return buildContactDetailEmptyMarkup();
  const description = model.description || (model.isGroup
    ? '这是一个群聊，暂未填写群组简介。'
    : '这个人还没有留下个性签名。');
  const tags = Array.isArray(model.tags) ? model.tags : [];
  const tagMarkup = tags.length
    ? tags.map(tag => `<span class="contact-detail-tag">${escapeHtml(tag)}</span>`).join('')
    : '<span class="contact-detail-tag is-muted">暂无标签</span>';
  const thirdValue = model.isGroup ? model.memberCount : tags.length;
  const thirdLabel = model.isGroup ? '群成员' : '角色标签';
  const stats = [
    { kind: 'days', value: model.daysKnown, label: model.isGroup ? '创建天数' : '相识天数' },
    { kind: 'messages', value: model.messageCount, label: '累计对话' },
    { kind: model.isGroup ? 'members' : 'tags', value: thirdValue, label: thirdLabel },
  ];
  const resolvedPersonaFields = PERSONA_FIELD_DEFINITIONS.map((definition) => {
    const source = (Array.isArray(personaFields) ? personaFields : [])
      .find(field => asText(field?.id) === definition.id);
    return { ...definition, value: asMemoryCellText(source?.value) };
  });
  const personaMarkup = model.isGroup ? '' : `
      <section class="contact-detail-persona">
        <div class="contact-detail-section-heading">
          <span>人格设定</span>
          <small>聊天室记忆</small>
        </div>
        <div class="contact-detail-persona-list">
          ${resolvedPersonaFields.map(field => `
            <div class="contact-detail-persona-row">
              <span class="contact-detail-persona-label">${escapeHtml(field.label)}</span>
              <p class="contact-detail-persona-value">${escapeHtml(field.value)}</p>
            </div>
          `).join('')}
        </div>
      </section>
  `;
  return `
    <div class="contact-detail-scroll">
      <button type="button" class="contact-detail-close" data-action="contact-detail-close" aria-label="返回联系人列表">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
      </button>
      <section class="contact-detail-hero" aria-labelledby="contact-detail-name">
        <img class="contact-detail-avatar" src="${escapeHtml(avatar)}" alt="">
        <div class="contact-detail-kind">${model.isGroup ? '群聊' : '联系人'}</div>
        <h2 id="contact-detail-name">${escapeHtml(model.name)}</h2>
        <p class="contact-detail-signature">${escapeHtml(description)}</p>
        <div class="contact-detail-tags">${tagMarkup}</div>
        <div class="contact-detail-stats">
          ${stats.map(stat => `
            <div class="contact-detail-stat">
              <div class="contact-detail-stat-value">${buildContactStatIcon(stat.kind)}<strong>${escapeHtml(stat.value)}</strong></div>
              <span>${escapeHtml(stat.label)}</span>
            </div>
          `).join('')}
        </div>
        <button type="button" class="contact-detail-message" data-action="contact-detail-message" data-maid-guide-target="contact-detail-message">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"></path></svg>
          <span>${model.isGroup ? '进入群聊' : '发消息'}</span>
        </button>
      </section>
      ${personaMarkup}
    </div>
  `;
};

export const createContactDetailRuntime = ({
  containerEl = null,
  contactListRoots = [],
  getContact = () => null,
  resolveAvatar = () => '',
  getMessageCount = () => 0,
  getPersonaRows = async () => [],
  eventTarget = null,
  onMessage = null,
  now = () => Date.now(),
} = {}) => {
  let selectedId = '';
  let mounted = false;
  let personaSessionId = '';
  let personaFields = buildContactPersonaFields();
  let personaLoadToken = 0;

  const syncSelectedItems = () => {
    contactListRoots.forEach((root) => {
      root?.querySelectorAll?.('.contact-item')?.forEach?.((item) => {
        item.classList?.toggle?.('is-selected', asText(item.dataset?.session) === selectedId);
      });
    });
  };

  const render = () => {
    if (!containerEl) return false;
    const contact = selectedId ? getContact(selectedId) : null;
    const model = buildContactDetailViewModel({
      contact,
      messageCount: selectedId ? getMessageCount(selectedId) : 0,
      now: now(),
    });
    if (selectedId && !model) selectedId = '';
    const activeModel = model?.id ? model : null;
    containerEl.innerHTML = activeModel
      ? buildContactDetailMarkup({
        model: activeModel,
        avatar: resolveAvatar(activeModel.id, contact),
        personaFields: personaSessionId === activeModel.id
          ? personaFields
          : buildContactPersonaFields(),
      })
      : buildContactDetailEmptyMarkup();
    containerEl.classList?.toggle?.('is-active', Boolean(activeModel));
    containerEl.setAttribute?.('aria-hidden', activeModel ? 'false' : 'true');
    syncSelectedItems();
    return Boolean(activeModel);
  };

  const loadSelectedPersona = async () => {
    const targetId = selectedId;
    if (!targetId) return false;
    const token = ++personaLoadToken;
    const targetContact = getContact(targetId);
    const targetModel = buildContactDetailViewModel({ contact: targetContact });
    if (targetModel?.isGroup) {
      if (token !== personaLoadToken || selectedId !== targetId) return false;
      personaSessionId = targetId;
      personaFields = buildContactPersonaFields();
      render();
      return true;
    }
    let rows = [];
    try {
      rows = await getPersonaRows(targetId, targetContact);
    } catch {
      rows = [];
    }
    if (token !== personaLoadToken || selectedId !== targetId) return false;
    personaSessionId = targetId;
    personaFields = buildContactPersonaFields(rows);
    render();
    return true;
  };

  const clear = () => {
    personaLoadToken += 1;
    selectedId = '';
    personaSessionId = '';
    personaFields = buildContactPersonaFields();
    render();
    return true;
  };

  const mount = () => {
    if (!containerEl) return false;
    if (!mounted) {
      containerEl.addEventListener?.('click', (event) => {
        const action = event?.target?.closest?.('[data-action]')?.dataset?.action;
        if (action === 'contact-detail-close') {
          clear();
          return;
        }
        if (action !== 'contact-detail-message' || !selectedId) return;
        const contact = getContact(selectedId);
        const model = buildContactDetailViewModel({
          contact,
          messageCount: getMessageCount(selectedId),
          now: now(),
        });
        if (model && typeof onMessage === 'function') onMessage({ ...model, contact });
      });
      eventTarget?.addEventListener?.('memory-rows-updated', (event) => {
        const eventSessionId = asText(event?.detail?.sessionId);
        if (!selectedId || (eventSessionId && eventSessionId !== selectedId)) return;
        void loadSelectedPersona();
      });
      mounted = true;
    }
    render();
    return true;
  };

  return {
    mount,
    clear,
    refresh: render,
    select(id) {
      const nextId = asText(id);
      if (!nextId || !getContact(nextId)) return false;
      selectedId = nextId;
      personaSessionId = '';
      personaFields = buildContactPersonaFields();
      const rendered = render();
      void loadSelectedPersona();
      return rendered;
    },
    refreshPersona: loadSelectedPersona,
    getSelectedId: () => selectedId,
  };
};
