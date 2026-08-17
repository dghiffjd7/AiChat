(async () => {
  const panel = window.appBridge?.debugUiRegistry?.panels?.configPanel;
  if (!panel) throw new Error('config panel unavailable');
  await panel.show({ tab: 'chat' });
  const entry = panel.element?.querySelector('#open-fc-compatibility');
  if (!entry) throw new Error('FC compatibility entry unavailable');
  entry.click();
  await new Promise(resolve => setTimeout(resolve, 180));
  const advanced = panel.chatFcCompatibilityPanel;
  const modal = advanced?.element?.querySelector('.api-fc-compat-modal');
  const rect = modal?.getBoundingClientRect?.();
  const profileSelect = advanced?.element?.querySelector('[data-fc-field="profile"]');
  const [{ buildChatFcLocalRuleFromProfile }, { buildChatFcZeroWriteTestPlan }] = await Promise.all([
    import('./scripts/agent/chat-fc-local-capability-rules.js'),
    import('./scripts/agent/chat-fc-zero-write-compat-test.js'),
  ]);
  const fixtureRule = buildChatFcLocalRuleFromProfile({
    id: 'ui-smoke-profile',
    name: 'UI smoke',
    provider: 'custom',
    baseUrl: 'https://ui-smoke.invalid/v1',
    model: 'ui-smoke-model',
  });
  const plan = buildChatFcZeroWriteTestPlan({ rule: fixtureRule.rule });
  const result = {
    entryVisible: getComputedStyle(entry).display !== 'none',
    modalVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
    modalFitsViewport: Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
    profileCount: profileSelect?.options?.length || 0,
    hasIdentity: Boolean(advanced?.element?.querySelector('[data-fc-role="identity"]')),
    hasTestAction: Boolean(advanced?.element?.querySelector('[data-fc-action="test"]')),
    hasSaveAction: Boolean(advanced?.element?.querySelector('[data-fc-action="save"]')),
    hasImportAction: Boolean(advanced?.element?.querySelector('[data-fc-action="import"]')),
    hasExportAction: Boolean(advanced?.element?.querySelector('[data-fc-action="export"]')),
    plannedModelCalls: plan.modelCallCount,
    plannedWrites: plan.persistentWriteCount,
  };
  advanced.hide();
  panel.hide();
  return result;
})()
