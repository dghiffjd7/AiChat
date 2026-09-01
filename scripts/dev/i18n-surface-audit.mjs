import fs from 'node:fs/promises';
import { evaluateInApp } from './cdp-client.mjs';

const auditExpression = await fs.readFile(new URL('./i18n-dom-audit.js', import.meta.url), 'utf8');
const sourceCatalog = JSON.parse(await fs.readFile(new URL('../i18n/ui-source-catalog.json', import.meta.url), 'utf8'));
const englishBase = JSON.parse(await fs.readFile(new URL('../i18n/en.base.json', import.meta.url), 'utf8'));
const sourceKeys = new Set(sourceCatalog.map(entry => entry.source));
const requested = new Set(process.argv.slice(2).filter(arg => !arg.startsWith('--')));
const compact = process.argv.includes('--compact');
const failuresOnly = process.argv.includes('--failures-only');
const scrollSweep = !process.argv.includes('--no-scroll');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const openMaidSettings = `document.querySelector('.nav-btn[data-page="chat"]')?.click(); registry.stores?.maidCommandInputRuntime?.open?.({ autoFocus: false }); await new Promise(resolve => setTimeout(resolve, 80)); const button = document.querySelector('.maid-command-input-settings'); if (!button) throw new Error('maid settings action unavailable'); button.click(); await new Promise(resolve => setTimeout(resolve, 80))`;

const surfaces = [
  { id: 'main-chat', open: `document.querySelector('.nav-btn[data-page="chat"]')?.click()` },
  { id: 'main-contacts', open: `document.querySelector('.nav-btn[data-page="contacts"]')?.click()` },
  { id: 'main-moments', open: `document.querySelector('.nav-btn[data-page="moments"]')?.click()` },
  { id: 'persona-users', open: `document.querySelector('.desktop-rail-brand')?.click()` },
  {
    id: 'persona-characters',
    open: `document.querySelector('.desktop-rail-brand')?.click(); document.querySelector('#persona-switcher-menu [data-tab="character"]')?.click()`,
  },
  {
    id: 'settings-menu',
    open: `Array.from(document.querySelectorAll('.qq-message-topbar .user-settings-btn')).find(el => el.getBoundingClientRect().width > 0)?.click()`,
  },
  {
    id: 'quick-menu',
    open: `Array.from(document.querySelectorAll('.qq-message-topbar .topbar-plus-btn')).find(el => el.getBoundingClientRect().width > 0)?.click()`,
  },
  { id: 'reading-settings', open: `document.getElementById('rp-reading-settings-menu')?.classList.remove('hidden')` },
  { id: 'developer-profile', open: `document.querySelector('[data-open-developer-profile]')?.click()` },
  { id: 'chat-settings', action: 'openChatSettings' },
  { id: 'general-settings', panel: 'generalSettingsPanel' },
  {
    id: 'general-settings-folds',
    open: `const target = registry.panels.generalSettingsPanel; await Promise.resolve(target.show());
      [target.themeAdvancedToggle, target.autoImagePromptAdvancedToggle, target.uiAdvancedToggle,
        target.memoryAdvancedToggle, target.templateAdvancedToggle, target.scriptAdvancedToggle]
        .filter(Boolean).forEach(toggle => { toggle.dataset.expanded = '1'; });
      target.syncAdvancedFoldVisibility();`,
  },
  {
    id: 'general-memory-places',
    open: `const target = registry.panels.generalSettingsPanel; await Promise.resolve(target.show()); target.showMemoryPlacesDialog();`,
  },
  { id: 'api-config', open: `await registry.panels.configPanel.show({ tab: 'chat' })` },
  {
    id: 'api-key-manager',
    open: `const target = registry.panels.configPanel; await target.show({ tab: 'chat' }); await target.openKeyManager()`,
  },
  {
    id: 'api-generation-filter',
    open: `const target = registry.panels.configPanel; await target.show({ tab: 'chat' }); await target.openGenerationParamFilterDialog()`,
  },
  { id: 'api-image', open: `await registry.panels.configPanel.show({ tab: 'image' })` },
  {
    id: 'api-image-params',
    open: `const target = registry.panels.configPanel; await target.show({ tab: 'image' }); target.showImageParamsPage()`,
  },
  {
    id: 'api-voice-shared',
    open: `const target = registry.panels.configPanel; await target.show({ tab: 'voice' }); await target.setVoiceConnectionMode('shared', { persist: false })`,
  },
  {
    id: 'api-voice-tts',
    open: `const target = registry.panels.configPanel; await target.show({ tab: 'voice' }); await target.setVoiceConnectionMode('split', { persist: false }); await target.setVoiceCapability('tts')`,
  },
  {
    id: 'api-voice-stt',
    open: `const target = registry.panels.configPanel; await target.show({ tab: 'voice' }); await target.setVoiceConnectionMode('split', { persist: false }); await target.setVoiceCapability('stt')`,
  },
  {
    id: 'api-voice-realtime',
    open: `const target = registry.panels.configPanel; await target.show({ tab: 'voice' }); await target.setVoiceConfigView('realtime')`,
  },
  {
    id: 'api-voice-library',
    open: `const target = registry.panels.configPanel; await target.show({ tab: 'voice' }); await target.voiceRegistryPanel.show()`,
  },
  { id: 'agent-center', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'agents' }); await target.refresh()` },
  {
    id: 'agent-reply-check',
    open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'agents' }); await target.refresh(); target.openFloatingAgentCard('reply_check'); target.floatingAgentFlipped = true; target.render();`,
  },
  { id: 'agent-pending', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'pending' }); await target.refresh()` },
  { id: 'agent-prompts', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'prompts' }); await target.refresh()` },
  { id: 'agent-prompt-dialogue', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'prompts' }); await target.refresh(); target.openFloatingAgentCard('dialogue_agent'); target.floatingAgentFlipped = true; target.render()` },
  { id: 'agent-prompt-group', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'prompts' }); await target.refresh(); target.openFloatingAgentCard('group_agent'); target.floatingAgentFlipped = true; target.render()` },
  { id: 'agent-prompt-phone', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'prompts' }); await target.refresh(); target.openFloatingAgentCard('phone_format_agent'); target.floatingAgentFlipped = true; target.render()` },
  { id: 'agent-prompt-dialogue-preview', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'prompts' }); await target.refresh(); await target.handleAgentPromptPreview('dialogue_agent')` },
  { id: 'agent-global-prompts', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'global_prompts' }); await target.refresh()` },
  { id: 'agent-diagnostics', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'diagnostics' }); await target.refresh()` },
  { id: 'agent-resources', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'resources' }); await target.refresh()` },
  { id: 'agent-activity', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'activity' }); await target.refresh()` },
  { id: 'agent-safety', open: `const target = registry.panels.agentCenterPanel; target.show({ tab: 'safety' }); await target.refresh()` },
  {
    id: 'maid-settings',
    open: openMaidSettings,
  },
  { id: 'maid-settings-main-api', open: `${openMaidSettings}; document.querySelector('[data-api-nav="main"]')?.click()` },
  { id: 'maid-settings-subagents', open: `${openMaidSettings}; document.querySelector('[data-api-nav="subagent"]')?.click()` },
  { id: 'maid-settings-memory-model', open: `${openMaidSettings}; document.querySelector('[data-api-nav="memory"]')?.click()` },
  { id: 'maid-settings-prompt', open: `${openMaidSettings}; document.getElementById('maid-settings-tab-prompt')?.click()` },
  { id: 'maid-settings-prompt-app', open: `${openMaidSettings}; document.getElementById('maid-settings-tab-prompt')?.click(); document.getElementById('maid-settings-prompt-tab-appKnowledge')?.click()` },
  { id: 'maid-settings-prompt-history', open: `${openMaidSettings}; document.getElementById('maid-settings-tab-prompt')?.click(); document.getElementById('maid-settings-prompt-tab-historyContext')?.click()` },
  { id: 'maid-settings-prompt-memory', open: `${openMaidSettings}; document.getElementById('maid-settings-tab-prompt')?.click(); document.getElementById('maid-settings-prompt-tab-semanticMemory')?.click()` },
  { id: 'maid-settings-prompt-archive', open: `${openMaidSettings}; document.getElementById('maid-settings-tab-prompt')?.click(); document.getElementById('maid-settings-prompt-tab-memoryTable')?.click()` },
  { id: 'maid-settings-prompt-last', open: `${openMaidSettings}; document.getElementById('maid-settings-tab-prompt')?.click(); document.getElementById('maid-settings-prompt-tab-lastPrompt')?.click()` },
  { id: 'maid-settings-response-last', open: `${openMaidSettings}; document.getElementById('maid-settings-tab-prompt')?.click(); document.getElementById('maid-settings-prompt-tab-lastResponse')?.click()` },
  { id: 'maid-settings-tasks', open: `${openMaidSettings}; document.getElementById('maid-settings-tab-tasks')?.click()` },
  { id: 'maid-settings-activity', open: `${openMaidSettings}; document.getElementById('maid-settings-tab-activity')?.click()` },
  { id: 'maid-settings-safety', open: `${openMaidSettings}; document.getElementById('maid-settings-tab-safety')?.click()` },
  { id: 'presets', panel: 'presetPanel' },
  { id: 'preset-custom', open: `await registry.panels.presetPanel.show({ section: 'custom' })` },
  { id: 'preset-generation', open: `await registry.panels.presetPanel.show({ section: 'openai' })` },
  { id: 'preset-task-prompts', open: `await registry.panels.presetPanel.show({ section: 'taskprompts' })` },
  {
    id: 'preset-dialogue-prompt',
    open: `const target = registry.panels.presetPanel; await target.show({ section: 'taskprompts' }); target.blockTitleEl.dataset.i18nSkip = ''; target.openInjectBlockEditor('dialogue')`,
  },
  {
    id: 'preset-group-prompt',
    open: `const target = registry.panels.presetPanel; await target.show({ section: 'taskprompts' }); target.blockTitleEl.dataset.i18nSkip = ''; target.openInjectBlockEditor('group')`,
  },
  { id: 'preset-system-prompt', open: `await registry.panels.presetPanel.show({ section: 'sysprompt' })` },
  { id: 'preset-context', open: `await registry.panels.presetPanel.show({ section: 'context' })` },
  { id: 'preset-instruct', open: `await registry.panels.presetPanel.show({ section: 'instruct' })` },
  { id: 'preset-reasoning', open: `await registry.panels.presetPanel.show({ section: 'reasoning' })` },
  {
    id: 'preset-bindings',
    open: `const target = registry.panels.presetPanel; await target.show({ section: 'custom' }); target.openBindingsPage('openai')`,
  },
  {
    id: 'preset-preview',
    open: `const target = registry.panels.presetPanel; await target.show({ section: 'custom' }); target.openPreview()`,
  },
  { id: 'regex', open: `const target = registry.panels.regexPanel; await target.show(); await target.setActiveTab('global')` },
  { id: 'regex-characters', open: `const target = registry.panels.regexPanel; await target.show(); await target.setActiveTab('character')` },
  { id: 'regex-presets', open: `const target = registry.panels.regexPanel; await target.show(); await target.setActiveTab('preset')` },
  { id: 'plugins', panel: 'pluginPanel' },
  { id: 'plugin-ui-manager', open: `const target = registry.panels.pluginPanel; await target.show(); target.showUiManager()` },
  { id: 'extensions', open: `const target = registry.panels.extensionsPanel; await target.show(); await target.setExpandedSection('regex', { forceOpen: true })` },
  { id: 'extensions-scripts', open: `const target = registry.panels.extensionsPanel; await target.show(); await target.setExpandedSection('scripts', { forceOpen: true })` },
  { id: 'extensions-plugins', open: `const target = registry.panels.extensionsPanel; await target.show(); await target.setExpandedSection('plugins', { forceOpen: true })` },
  { id: 'memory-templates', panel: 'memoryTemplatePanel' },
  {
    id: 'memory-template-editor',
    open: `const target = registry.panels.memoryTemplatePanel; target.show(); const records = await target.templateStore.getTemplates({}); if (!records?.[0]) throw new Error('memory template unavailable'); target.openTemplateEditor(records[0])`,
  },
  { id: 'worldbooks', panel: 'worldPanel' },
  { id: 'worldbooks-global', open: `await registry.panels.worldPanel.show({ scope: 'global' })` },
  {
    id: 'worldbook-library',
    open: `const target = registry.panels.worldPanel; await target.show({ scope: 'global' }); await target.openLibraryModal({ type: 'global' })`,
  },
  {
    id: 'worldbook-editor',
    open: `const target = registry.panels.worldPanel; const names = await window.appBridge.listWorlds(); if (!names?.[0]) throw new Error('worldbook unavailable'); const data = await window.appBridge.getWorldInfo(names[0]); await target.editor.show(names[0], data)`,
  },
  {
    id: 'worldbook-editor-manage',
    open: `const target = registry.panels.worldPanel; const names = await window.appBridge.listWorlds(); if (!names?.[0]) throw new Error('worldbook unavailable'); const data = await window.appBridge.getWorldInfo(names[0]); await target.editor.show(names[0], data); target.editor.showManageModal()`,
  },
  {
    id: 'worldbook-editor-ai',
    open: `const target = registry.panels.worldPanel; const names = await window.appBridge.listWorlds(); if (!names?.[0]) throw new Error('worldbook unavailable'); const data = await window.appBridge.getWorldInfo(names[0]); await target.editor.show(names[0], data); const entry = target.editor.data?.entries?.[0]; if (!entry) throw new Error('worldbook entry unavailable'); target.editor.showAiModal(entry)`,
  },
  { id: 'scripts', panel: 'scriptPanel' },
  { id: 'sessions', panel: 'sessionPanel' },
  { id: 'session-configuration', open: `window.dispatchEvent(new CustomEvent('open-session-config'))` },
  { id: 'session-regex', panel: 'regexSessionPanel' },
  { id: 'contact-settings', panel: 'contactSettingsPanel' },
  {
    id: 'contact-detail',
    open: `document.querySelector('.nav-btn[data-page="contacts"]')?.click(); await new Promise(resolve => setTimeout(resolve, 80)); const item = document.querySelector('#contacts-ungrouped-list .contact-item, #contacts-groups-list .contact-item'); if (!item) throw new Error('contact unavailable'); item.click()`,
  },
  {
    id: 'room-private',
    open: `const ids = registry.stores.chatStore?.listSessions?.() || []; const sid = ids.find(id => id && !String(id).startsWith('group:') && !String(id).startsWith('rp:')); if (!sid) throw new Error('private session unavailable'); const contact = registry.stores.contactsStore?.getContact?.(sid); await registry.actions.enterChatRoom(sid, contact?.name || sid, 'chat', { suppressInitialAutoScroll: true })`,
  },
  {
    id: 'room-rp',
    open: `const sid = (registry.stores.chatStore?.listSessions?.() || []).find(id => String(id).startsWith('rp:')); if (!sid) throw new Error('RP session unavailable'); const contact = registry.stores.contactsStore?.getContact?.(sid); await registry.actions.enterChatRoom(sid, contact?.name || sid, 'chat', { suppressInitialAutoScroll: true })`,
  },
  {
    id: 'contact-settings-private',
    open: `const sid = (registry.stores.chatStore?.listSessions?.() || []).find(id => id && !String(id).startsWith('group:') && !String(id).startsWith('rp:')); if (!sid) throw new Error('private session unavailable'); registry.stores.chatStore.switchSession?.(sid); window.appBridge.setActiveSession?.(sid); registry.panels.contactSettingsPanel.show()`,
  },
  {
    id: 'contact-settings-private-memory',
    open: `const sid = (registry.stores.chatStore?.listSessions?.() || []).find(id => id && !String(id).startsWith('group:') && !String(id).startsWith('rp:')); if (!sid) throw new Error('private session unavailable'); registry.stores.chatStore.switchSession?.(sid); window.appBridge.setActiveSession?.(sid); registry.panels.contactSettingsPanel.show(); await registry.panels.contactSettingsPanel.openMemoryShareManager()`,
  },
  {
    id: 'contact-settings-private-profile',
    open: `const sid = (registry.stores.chatStore?.listSessions?.() || []).find(id => id && !String(id).startsWith('group:') && !String(id).startsWith('rp:')); if (!sid) throw new Error('private session unavailable'); registry.stores.chatStore.switchSession?.(sid); window.appBridge.setActiveSession?.(sid); registry.panels.contactSettingsPanel.show(); await registry.panels.contactSettingsPanel.openContactProfileManager()`,
  },
  {
    id: 'contact-settings-private-archive',
    open: `const sid = (registry.stores.chatStore?.listSessions?.() || []).find(id => id && !String(id).startsWith('group:') && !String(id).startsWith('rp:')); if (!sid) throw new Error('private session unavailable'); registry.stores.chatStore.switchSession?.(sid); window.appBridge.setActiveSession?.(sid); registry.panels.contactSettingsPanel.show(); registry.panels.contactSettingsPanel.openArchiveManager()`,
  },
  {
    id: 'contact-settings-rp',
    open: `const sid = (registry.stores.chatStore?.listSessions?.() || []).find(id => String(id).startsWith('rp:')); if (!sid) throw new Error('RP session unavailable'); registry.stores.chatStore.switchSession?.(sid); window.appBridge.setActiveSession?.(sid); registry.panels.contactSettingsPanel.show()`,
  },
  { id: 'create-group', panel: 'groupCreatePanel' },
  { id: 'contact-groups', panel: 'groupPanel' },
  {
    id: 'contact-group-parent',
    open: `const target = registry.panels.groupPanel; target.show(); const id = registry.stores.groupStore?.listGroups?.()?.[0]?.id; if (!id) throw new Error('contact group unavailable'); target.openParentPicker(id)`,
  },
  { id: 'characters', panel: 'personaPanel' },
  {
    id: 'character-edit',
    open: `const target = registry.panels.personaPanel; await target.show(); const id = registry.stores.personaStore?.getActive?.()?.id || registry.stores.personaStore?.getAll?.()?.[0]?.id || null; target.openEdit(id)`,
  },
  { id: 'character-import', open: `const target = registry.panels.personaPanel; await target.show(); target.showImportModal()` },
  {
    id: 'character-bulk',
    open: `const target = registry.panels.personaPanel; await target.show(); const id = registry.stores.personaStore?.getActive?.()?.id || registry.stores.personaStore?.getAll?.()?.[0]?.id; if (!id) throw new Error('character unavailable'); target.openBulkModal(id)`,
  },
  { id: 'users', panel: 'userPanel' },
  {
    id: 'user-edit',
    open: `const target = registry.panels.userPanel; await target.show(); const id = registry.stores.userStore?.getActive?.()?.id || registry.stores.userStore?.getAll?.()?.[0]?.id || null; target.openEdit(id)`,
  },
  {
    id: 'user-bindings',
    open: `const target = registry.panels.userPanel; await target.show(); const id = registry.stores.userStore?.getActive?.()?.id || registry.stores.userStore?.getAll?.()?.[0]?.id; if (!id) throw new Error('user unavailable'); target.openBindingModal(id)`,
  },
  { id: 'variables', panel: 'variablePanel' },
  { id: 'variable-templates', open: `const target = registry.panels.variablePanel; target.show(); target.switchPage('templates', { force: true })` },
  { id: 'variable-rules', open: `const target = registry.panels.variablePanel; target.show(); target.switchPage('rules', { force: true })` },
  {
    id: 'variable-rule-editor',
    open: `const target = registry.panels.variablePanel; target.show(); target.showRuleEditor({ id: 'i18n_audit_rule', name: 'i18n audit rule', enabled: true, trigger: { type: 'manual' }, action: { type: 'notify', message: 'i18n-audit' } })`,
  },
  { id: 'variable-import', open: `const target = registry.panels.variablePanel; const sid = (registry.stores.chatStore?.listSessions?.() || []).find(id => id && !String(id).startsWith('group:') && !String(id).startsWith('rp:')); if (sid) { registry.stores.chatStore.switchSession?.(sid); window.appBridge.setActiveSession?.(sid); } target.show(); target.showImportModal()` },
  { id: 'variable-schema', open: `const target = registry.panels.variablePanel; target.show(); target.showSchemaModal({ mode: 'create' })` },
  {
    id: 'worldbooks-private',
    open: `const target = registry.panels.worldPanel; const sid = (registry.stores.chatStore?.listSessions?.() || []).find(id => id && !String(id).startsWith('group:') && !String(id).startsWith('rp:')); if (!sid) throw new Error('private session unavailable'); registry.stores.chatStore.switchSession?.(sid); window.appBridge.setActiveSession?.(sid); await target.show({ scope: 'session' })`,
  },
  {
    id: 'worldbook-library-private',
    open: `const target = registry.panels.worldPanel; const sid = (registry.stores.chatStore?.listSessions?.() || []).find(id => id && !String(id).startsWith('group:') && !String(id).startsWith('rp:')); if (!sid) throw new Error('private session unavailable'); registry.stores.chatStore.switchSession?.(sid); window.appBridge.setActiveSession?.(sid); await target.show({ scope: 'session' }); await target.openLibraryModal({ type: 'session_extra', sessionId: sid })`,
  },
  {
    id: 'worldbook-editor-condition',
    open: `const editor = registry.panels.worldPanel.editor; await editor.show('i18n audit', { name: 'i18n audit', entries: [{ id: 'audit_entry', comment: 'i18n audit entry', key: ['audit'], content: 'audit content', enabled: true, probability: 100, depth: 4, position: 4, order: 100 }] }); const entry = editor.data.entries[0]; const block = editor.ensureEntryPromptBlocks(entry)?.[0]; if (!block) throw new Error('worldbook block unavailable'); editor.openBlockConditionEditor(block.id)`,
  },
  {
    id: 'worldbook-editor-overview',
    open: `const editor = registry.panels.worldPanel.editor; await editor.show('i18n overview', { name: 'i18n overview', entries: [{ id: 'overview_entry', comment: 'i18n overview entry', key: ['audit'], content: 'audit content', promptBlocks: [{ id: 'overview_block', title: 'audit page', content: 'audit content', when: { logic: 'and', clauses: [{ left: 'audit.hp', op: '>', rightType: 'number', right: 10 }, { left: 'audit.mp', op: '>', rightType: 'number', right: 5 }] } }], enabled: true, probability: 100, depth: 4, position: 4, order: 100 }] }); const entry = editor.data.entries[0]; const block = editor.ensureEntryPromptBlocks(entry)?.[0]; if (!block) throw new Error('worldbook block unavailable'); editor.blockBackViewMap.set(block.id, 'summary'); editor.blockFlipMap.set(block.id, true); editor.blockExpandMap.set(block.id, true); editor.renderEditor()`,
  },
  {
    id: 'worldbook-editor-overview-incomplete',
    open: `const editor = registry.panels.worldPanel.editor; await editor.show('i18n incomplete overview', { name: 'i18n incomplete overview', entries: [{ id: 'overview_entry', comment: 'i18n overview entry', key: ['audit'], content: 'audit content', promptBlocks: [{ id: 'overview_block', title: 'audit page', content: 'audit content', when: { logic: 'and', clauses: [{ left: '', op: '>', rightType: 'number', right: 10 }] } }], enabled: true, probability: 100, depth: 4, position: 4, order: 100 }] }); const entry = editor.data.entries[0]; const block = editor.ensureEntryPromptBlocks(entry)?.[0]; if (!block) throw new Error('worldbook block unavailable'); editor.blockBackViewMap.set(block.id, 'summary'); editor.blockFlipMap.set(block.id, true); editor.blockExpandMap.set(block.id, true); editor.renderEditor()`,
  },
  {
    id: 'worldbook-editor-node',
    open: `const editor = registry.panels.worldPanel.editor; await editor.show('i18n audit', { name: 'i18n audit', entries: [{ id: 'audit_entry', comment: 'i18n audit entry', key: ['audit'], content: 'audit content', promptBlocks: [{ id: 'audit_block', title: 'audit page', content: 'audit content', when: { logic: 'and', clauses: [{ left: 'audit.hp', op: '>', rightType: 'number', right: 10 }, { left: 'audit.mp', op: '>', rightType: 'number', right: 5 }] } }], enabled: true, probability: 100, depth: 4, position: 4, order: 100 }] }); const entry = editor.data.entries[0]; const block = editor.ensureEntryPromptBlocks(entry)?.[0]; if (!block) throw new Error('worldbook block unavailable'); const graph = editor.ensureBlockNodeGraph(block); const logic = graph?.nodes?.find(node => node.type === 'logic'); editor.blockFlipMap.set(block.id, true); editor.blockExpandMap.set(block.id, true); editor.openBlockNodeEditor(block.id, logic ? [logic.id] : [])`,
  },
  {
    id: 'worldbook-editor-node-variable',
    open: `const editor = registry.panels.worldPanel.editor; await editor.show('i18n variable node', { name: 'i18n variable node', entries: [{ id: 'audit_entry', comment: 'i18n audit entry', key: ['audit'], content: 'audit content', promptBlocks: [{ id: 'audit_block', title: 'audit page', content: 'audit content', when: { logic: 'and', clauses: [{ left: 'audit.hp', op: '>', rightType: 'number', right: 10 }] } }], enabled: true, probability: 100, depth: 4, position: 4, order: 100 }] }); const entry = editor.data.entries[0]; const block = editor.ensureEntryPromptBlocks(entry)?.[0]; const graph = editor.ensureBlockNodeGraph(block); const variable = graph?.nodes?.find(node => node.type === 'variable'); editor.blockFlipMap.set(block.id, true); editor.blockExpandMap.set(block.id, true); editor.openBlockNodeEditor(block.id, variable ? [variable.id] : [])`,
  },
  {
    id: 'worldbook-editor-node-compare',
    open: `const editor = registry.panels.worldPanel.editor; await editor.show('i18n compare node', { name: 'i18n compare node', entries: [{ id: 'audit_entry', comment: 'i18n audit entry', key: ['audit'], content: 'audit content', promptBlocks: [{ id: 'audit_block', title: 'audit page', content: 'audit content', when: { logic: 'and', clauses: [{ left: 'audit.hp', op: '>', rightType: 'number', right: 10 }] } }], enabled: true, probability: 100, depth: 4, position: 4, order: 100 }] }); const entry = editor.data.entries[0]; const block = editor.ensureEntryPromptBlocks(entry)?.[0]; const graph = editor.ensureBlockNodeGraph(block); const compare = graph?.nodes?.find(node => node.type === 'compare'); editor.blockFlipMap.set(block.id, true); editor.blockExpandMap.set(block.id, true); editor.openBlockNodeEditor(block.id, compare ? [compare.id] : [])`,
  },
  {
    id: 'worldbook-editor-entry-gate',
    open: `const editor = registry.panels.worldPanel.editor; await editor.show('i18n entry gate', { name: 'i18n entry gate', entries: [{ id: 'audit_entry', comment: 'i18n audit entry', key: ['audit'], content: 'audit content', when: { logic: 'and', clauses: [{ left: 'audit.hp', op: '>', rightType: 'number', right: 10 }] }, promptBlocks: [{ id: 'audit_block', title: 'audit page', content: 'audit content' }], enabled: true, probability: 100, depth: 4, position: 4, order: 100 }] }); const entry = editor.data.entries[0]; const block = editor.ensureEntryPromptBlocks(entry)?.[0]; editor.ensureBlockNodeGraph(entry); editor.blockConditionTargetMap.set(block.id, 'entry'); editor.blockFlipMap.set(block.id, true); editor.blockExpandMap.set(block.id, true); editor.openBlockNodeEditor(block.id); document.querySelector('.world-node-item-compare')?.click()`,
  },
  { id: 'raw-reply-modal', open: `registry.actions.showRawReplyModal('i18n audit raw reply', 'i18n audit')` },
  { id: 'prompt-preview-modal', open: `registry.actions.showPromptPreviewModal('i18n audit prompt preview', 'i18n audit')` },
  {
    id: 'current-request-overview',
    open: `registry.actions.showPromptPreviewModal('', '', { initialTab: 'api', request: { at: Date.now(), provider: 'i18n-provider', model: 'i18n-model', messages: [], injectionAudit: {}, responseDiagnostics: {} } })`,
  },
  {
    id: 'current-request-full',
    open: `registry.actions.showPromptPreviewModal('', '', { initialTab: 'prompt', request: { at: Date.now(), provider: 'i18n-provider', model: 'i18n-model', messages: [], injectionAudit: {}, responseDiagnostics: {} } })`,
  },
  {
    id: 'world-debug-locator-modal',
    open: `registry.actions.showWorldDebugLocatorModal([{ title: 'i18n audit entry', sourceKindLabel: 'Session', worldId: 'audit-world', entryId: 'audit-entry', blockId: 'legacy', sectionLabel: 'Matched', positionLabel: 'Default Prompt', role: 'system' }], { meta: 'i18n audit' })`,
  },
  { id: 'stickers', panel: 'stickerPicker' },
  {
    id: 'sticker-ai',
    open: `const button = document.querySelector('.sticker-ai-generate'); if (!button) throw new Error('sticker AI action unavailable'); button.click(); await new Promise(resolve => setTimeout(resolve, 80)); document.querySelector('.sticker-ai-tab[data-mode="sticker"]')?.click()`,
  },
  {
    id: 'sticker-ai-sprite',
    open: `const button = document.querySelector('.sticker-ai-generate'); if (!button) throw new Error('sticker AI action unavailable'); button.click(); await new Promise(resolve => setTimeout(resolve, 80)); document.querySelector('.sticker-ai-tab[data-mode="sprite"]')?.click()`,
  },
  {
    id: 'chat-image-generation',
    open: `const ids = registry.stores.chatStore?.listSessions?.() || []; const sid = ids.find(id => id && !String(id).startsWith('group:') && !String(id).startsWith('rp:')); if (!sid) throw new Error('private session unavailable'); const contact = registry.stores.contactsStore?.getContact?.(sid); await registry.actions.enterChatRoom(sid, contact?.name || sid, 'chat', { suppressInitialAutoScroll: true }); document.querySelector('#action-panel [data-action="generate-image"]')?.click()`,
  },
  {
    id: 'image-album',
    open: `const ids = registry.stores.chatStore?.listSessions?.() || []; const sid = ids.find(id => id && !String(id).startsWith('group:') && !String(id).startsWith('rp:')); if (!sid) throw new Error('private session unavailable'); const contact = registry.stores.contactsStore?.getContact?.(sid); await registry.actions.enterChatRoom(sid, contact?.name || sid, 'chat', { suppressInitialAutoScroll: true }); document.querySelector('#action-panel [data-action="generate-image"]')?.click(); await new Promise(resolve => setTimeout(resolve, 100)); document.querySelector('.chat-image-gen-secondary')?.click()`,
  },
  {
    id: 'moment-compose',
    open: `document.querySelector('.nav-btn[data-page="moments"]')?.click(); document.getElementById('moments-compose-btn')?.click()`,
  },
  {
    id: 'moment-menu',
    open: `document.querySelector('.nav-btn[data-page="moments"]')?.click(); document.getElementById('moments-settings-btn')?.click()`,
  },
  {
    id: 'moment-card-menu',
    open: `document.querySelector('.nav-btn[data-page="moments"]')?.click(); await new Promise(resolve => setTimeout(resolve, 80)); const button = document.querySelector('.moment-card .moment-more'); if (!button) throw new Error('moment card menu unavailable'); button.click()`,
  },
  {
    id: 'moment-comment-compose',
    open: `document.querySelector('.nav-btn[data-page="moments"]')?.click(); await new Promise(resolve => setTimeout(resolve, 80)); const button = document.querySelector('.moment-card [data-action="comment"]'); if (!button) throw new Error('moment comment action unavailable'); button.click()`,
  },
  {
    id: 'moment-comment-reply',
    open: `document.querySelector('.nav-btn[data-page="moments"]')?.click(); await new Promise(resolve => setTimeout(resolve, 80)); const author = document.querySelector('.moment-card .moment-comment-author'); if (!author) throw new Error('moment comment author unavailable'); author.click()`,
  },
  {
    id: 'moment-album',
    open: `document.querySelector('.nav-btn[data-page="moments"]')?.click(); document.getElementById('moments-settings-btn')?.click(); await new Promise(resolve => setTimeout(resolve, 50)); document.querySelector('#moments-menu [data-action="moment-album"]')?.click()`,
  },
  {
    id: 'moment-album-detail',
    open: `document.querySelector('.nav-btn[data-page="moments"]')?.click(); document.getElementById('moments-settings-btn')?.click(); await new Promise(resolve => setTimeout(resolve, 50)); document.querySelector('#moments-menu [data-action="moment-album"]')?.click(); await new Promise(resolve => setTimeout(resolve, 80)); const card = document.querySelector('#generated-image-album-overlay .writing-media-asset-card'); if (!card) throw new Error('moment album image unavailable'); card.click()`,
  },
  { id: 'moment-summary', panel: 'momentSummaryPanel' },
  {
    id: 'context-lineage',
    open: `const button = document.querySelector('#settings-menu button[data-action="lineage-overview"]'); if (!button) throw new Error('lineage action unavailable'); button.click()`,
  },
];

const selected = requested.size ? surfaces.filter(surface => requested.has(surface.id)) : surfaces;
if (requested.size && selected.length !== requested.size) {
  const known = new Set(surfaces.map(surface => surface.id));
  const unknown = [...requested].filter(id => !known.has(id));
  throw new Error(`unknown i18n surface: ${unknown.join(', ')}`);
}

const readyDeadline = Date.now() + 20_000;
let runtimeReady = false;
while (Date.now() < readyDeadline) {
  try {
    runtimeReady = await evaluateInApp(`Boolean(window.__chatappBootDiag?.runtimeReady && window.appBridge?.debugUiRegistry?.panels)`);
  } catch {}
  if (runtimeReady) break;
  await wait(250);
}
if (!runtimeReady) throw new Error('app runtime did not become ready for i18n surface audit');

const closeLayers = async () => {
  await evaluateInApp(`(async () => {
    const registry = window.appBridge?.debugUiRegistry || {};
    try { registry.panels?.stickerPicker?.hide?.(); } catch {}
    try { registry.stores?.maidCommandInputRuntime?.close?.(); } catch {}
    try { document.querySelector('.maid-settings-close')?.click?.(); } catch {}
    try { document.querySelector('.sticker-ai-close')?.click?.(); } catch {}
    try { document.querySelector('.chat-image-gen-close')?.click?.(); } catch {}
    try { document.querySelector('.writing-media-assets-close')?.click?.(); } catch {}
    try { document.querySelector('.moment-compose-close')?.click?.(); } catch {}
    try { registry.panels?.generalSettingsPanel?.hideMemoryPlacesDialog?.(); } catch {}
    try { registry.panels?.configPanel?.closeKeyManager?.(); } catch {}
    try { document.querySelector('.api-param-filter-overlay [data-param-filter-action="cancel"]')?.click?.(); } catch {}
    try { registry.panels?.configPanel?.imageGenerationParamsPanel?.hide?.(); } catch {}
    try { registry.panels?.configPanel?.chatFcCompatibilityPanel?.hide?.(); } catch {}
    try { registry.panels?.configPanel?.voiceRegistryPanel?.hide?.(); } catch {}
    try { registry.panels?.presetPanel?.closePreview?.({ animate: false }); } catch {}
    try { registry.panels?.pluginPanel?.hideUiManager?.(); } catch {}
    try { registry.panels?.memoryTemplatePanel?.closeTemplateEditor?.(); } catch {}
    try { registry.panels?.groupPanel?.closeParentPicker?.(); } catch {}
    try { registry.panels?.userPanel?.hideBindingModal?.(); } catch {}
    try { registry.panels?.personaPanel?.hideBulkModal?.(); } catch {}
    try { registry.panels?.personaPanel?.hideImportModal?.(); } catch {}
    try { registry.panels?.contactSettingsPanel?.closeContactProfileManager?.(); } catch {}
    try { registry.panels?.contactSettingsPanel?.closeMemoryShareManager?.(); } catch {}
    try { registry.panels?.contactSettingsPanel?.hideArchiveManager?.(); } catch {}
    try { registry.panels?.groupSettingsPanel?.closeAddModal?.(); } catch {}
    try { registry.panels?.groupSettingsPanel?.closeMemoryShareManager?.(); } catch {}
    try { registry.panels?.groupSettingsPanel?.hideArchiveManager?.(); } catch {}
    try { registry.panels?.groupSettingsPanel?.hide?.(); } catch {}
    try { registry.panels?.variablePanel?.hideSchemaModal?.(); } catch {}
    try { registry.panels?.variablePanel?.hideRuleEditor?.(); } catch {}
    try { registry.panels?.variablePanel?.hideDataModal?.(); } catch {}
    try { registry.panels?.worldPanel?.editor?.hideAiModal?.(); } catch {}
    try { registry.panels?.worldPanel?.editor?.hideManageModal?.(); } catch {}
    try { registry.panels?.worldPanel?.editor?.hide?.(); } catch {}
    try { document.querySelector('#session-config-panel #sc-close')?.click?.(); } catch {}
    try { registry.panels?.worldPanel?.closeLibraryModal?.(); } catch {}
    try { registry.actions?.hideRawReplyModal?.(); } catch {}
    try { registry.actions?.hidePromptPreviewModal?.(); } catch {}
    try { registry.actions?.hideWorldDebugLocatorModal?.(); } catch {}
    document.getElementById('rp-reading-settings-menu')?.classList.add('hidden');
    document.getElementById('developer-profile-overlay')?.setAttribute('hidden', '');
    const close = window.appBridge?.debugUiRegistry?.actions?.closeTopAppLayer;
    if (typeof close !== 'function') return false;
    for (let index = 0; index < 12; index += 1) {
      let closed = false;
      try { closed = await Promise.resolve(close()); } catch {}
      if (!closed) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    return true;
  })()`);
};

const results = [];
const mergeAudit = (base, next) => {
  if (!base) return next;
  if (!next) return base;
  const mergeItems = (left = [], right = []) => {
    const map = new Map();
    [...left, ...right].forEach(item => map.set(`${item.target}\u0000${item.text}`, item));
    return [...map.values()];
  };
  const visibleHan = mergeItems(base.visibleHan, next.visibleHan);
  const overflow = mergeItems(base.overflow, next.overflow);
  return {
    ...base,
    visibleHan,
    visibleHanCount: visibleHan.length,
    overflow,
    overflowCount: overflow.length,
  };
};

for (const surface of selected) {
  let openError = '';
  try {
    await closeLayers();
    const openBody = surface.panel
      ? `const target = registry.panels?.[${JSON.stringify(surface.panel)}]; if (typeof target?.show !== 'function') throw new Error('panel unavailable'); await Promise.resolve(target.show())`
      : surface.action
        ? `const target = registry.actions?.[${JSON.stringify(surface.action)}]; if (typeof target !== 'function') throw new Error('action unavailable'); await Promise.resolve(target())`
        : surface.open;
    await evaluateInApp(`(async () => {
      const registry = window.appBridge?.debugUiRegistry || {};
      ${openBody};
      return true;
    })()`);
    await wait(450);
  } catch (error) {
    openError = String(error?.message || error || 'surface open failed');
  }
  let audit = null;
  try {
    audit = await evaluateInApp(auditExpression);
    if (scrollSweep && !openError) {
      const scrollTargets = await evaluateInApp(`(() => {
        document.querySelectorAll('[data-i18n-audit-scroll]').forEach(element => element.removeAttribute('data-i18n-audit-scroll'));
        const targets = Array.from(document.querySelectorAll('*')).filter(element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 100
            && style.display !== 'none' && style.visibility !== 'hidden'
            && /(auto|scroll)/.test(style.overflowY)
            && element.scrollHeight > element.clientHeight + 40;
        }).slice(0, 6);
        return targets.map((element, index) => {
          const id = String(index);
          element.setAttribute('data-i18n-audit-scroll', id);
          return { id, max: Math.max(0, element.scrollHeight - element.clientHeight) };
        });
      })()`);
      for (const target of scrollTargets || []) {
        for (const ratio of [0.5, 1]) {
          await evaluateInApp(`(() => {
            const element = document.querySelector('[data-i18n-audit-scroll=${JSON.stringify(target.id)}]');
            if (element) element.scrollTop = ${Number(target.max || 0)} * ${ratio};
          })()`);
          await wait(100);
          audit = mergeAudit(audit, await evaluateInApp(auditExpression));
        }
      }
      await evaluateInApp(`document.querySelectorAll('[data-i18n-audit-scroll]').forEach(element => { element.scrollTop = 0; element.removeAttribute('data-i18n-audit-scroll'); })`);
    }
  } catch (error) {
    openError ||= String(error?.message || error || 'surface audit failed');
  }
  results.push({
    id: surface.id,
    openError,
    visibleHanCount: Number(audit?.visibleHanCount || 0),
    visibleHan: audit?.visibleHan || [],
    overflowCount: Number(audit?.overflowCount || 0),
    overflow: audit?.overflow || [],
  });
}

await closeLayers();
const report = {
  locale: (await evaluateInApp(`document.documentElement.lang`)) || '',
  surfaces: results,
};
if (failuresOnly) {
  report.surfaces = report.surfaces.filter(result => (
    result.openError || result.visibleHanCount || result.overflowCount
  ));
}
if (compact) {
  report.surfaces = report.surfaces.map(result => ({
    id: result.id,
    openError: result.openError,
    visibleHanCount: result.visibleHanCount,
    visibleHan: [...new Set(result.visibleHan.map(item => item.text))].map(text => ({
      text,
      sourceKey: sourceKeys.has(text),
      english: englishBase[text] || '',
    })),
    overflowCount: result.overflowCount,
    overflow: result.overflow.map(item => item.text),
  }));
}
console.log(JSON.stringify(report, null, 2));

if (results.some(result => result.openError || result.visibleHanCount || result.overflowCount)) {
  process.exitCode = 1;
}
