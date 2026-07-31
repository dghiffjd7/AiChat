(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const memoryStore = registry.stores?.memoryTableStore;
  const templateStore = registry.stores?.memoryTemplateStore;
  const chatStore = registry.stores?.chatStore;
  const sessionId = '罗罗诺亚·索隆';
  if (!memoryStore?.getMemories || !templateStore?.getTemplates) {
    return { ok: false, reason: 'memory_store_missing' };
  }
  const templates = await templateStore.getTemplates({}).catch(error => [{
    error: String(error?.message || error),
  }]);
  const rows = await memoryStore.getMemories({
    scope: 'contact',
    contact_id: sessionId,
  }).catch(error => [{
    error: String(error?.message || error),
  }]);
  return {
    ok: true,
    scopeId: memoryStore.scopeId || '',
    sessionId,
    sessionExists: (chatStore?.listSessions?.() || []).includes(sessionId),
    templates: (Array.isArray(templates) ? templates : []).map(template => ({
      id: String(template?.id || ''),
      name: String(template?.name || ''),
      isDefault: Boolean(template?.is_default),
      tables: Array.isArray(template?.schema?.tables)
        ? template.schema.tables.map(table => ({
          id: String(table?.id || ''),
          name: String(table?.name || ''),
        }))
        : [],
      error: template?.error || '',
    })),
    rowCount: Array.isArray(rows) ? rows.length : 0,
    rows: (Array.isArray(rows) ? rows : []).map(row => ({
      id: String(row?.id || ''),
      templateId: String(row?.template_id || ''),
      tableId: String(row?.table_id || ''),
      isActive: row?.is_active !== false,
      createdAt: row?.created_at || null,
      updatedAt: row?.updated_at || null,
      rowData: row?.row_data || null,
      error: row?.error || '',
    })),
  };
})()
