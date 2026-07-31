import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const outputPath = resolve(
  'scripts/dev/tmp/mt-observation/v4f-v2-final-state-20260731.json',
);
const report = await evaluateInApp(`(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const tools = stores.agentToolRegistry;
  const readContext = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const read = async (name, args = {}) => {
    const output = await tools?.executeTool?.(name, args, readContext);
    return output?.result || output || null;
  };
  const allSessions = await read('session.list', {});
  const names = [
    'V4F-V2观测站-A-0731',
    'V4F-V2观测站-B-0731',
    'V4F-V2观测站-C-0731',
    'V4F-V2观测站-D-0731',
    'V4F-V2保留-G-0731',
    'V4F-V2联合观测组-0731',
    '艾琳·洛',
    '顾风',
    '米娅',
    'V4F-V2霜港调查组-0731',
    'V4F-V2恢复目标-H-0731',
  ];
  const contacts = allSessions?.contacts || [];
  const sessionResults = {};
  for (const name of names) {
    const contact = contacts.find(item => String(item?.name || '') === name) || null;
    const detail = await read('app.read_resource', {
      resource: 'session',
      target: name,
      include: ['members', 'worldbooks'],
      limit: 20,
    });
    const messages = contact
      ? (stores.chatStore?.getMessages?.(String(contact.id || name)) || [])
      : [];
    const formatProfile = contact && !contact.isGroup
      ? await read('chat.read_format_profile', { sessionId: String(contact.id || name) })
      : null;
    const storedContact = contact
      ? stores.contactsStore?.getContact?.(String(contact.id || name)) || null
      : null;
    const storedSession = contact
      ? stores.chatStore?.state?.sessions?.[String(contact.id || name)] || null
      : null;
    sessionResults[name] = {
      contact,
      detail,
      memberIds: Array.isArray(storedContact?.members) ? storedContact.members.slice() : [],
      avatar: {
        present: Boolean(String(storedContact?.avatar || '').trim()),
        length: String(storedContact?.avatar || '').length,
        prefix: String(storedContact?.avatar || '').slice(0, 40),
      },
      wallpaper: storedSession?.settings?.wallpaper || null,
      messages: messages.map(message => ({
        id: String(message?.id || ''),
        role: String(message?.role || ''),
        type: String(message?.type || ''),
        name: String(message?.name || ''),
        content: String(message?.content || '').slice(0, 700),
        rawOriginalRef: message?.rawOriginalRef || null,
        formatRepairTurn: message?.meta?.formatRepairTurn || null,
      })),
      formatProfile,
    };
  }
  const worldbookNames = [
    'V4F-V2档案库-0731',
    'V4F-V2长文库-0731',
    'V4F-V2导入卡资料-0731',
    'V4F-V2待删书-X-0731',
    'V4F-V2待删书-Y-0731',
  ];
  const worldbooks = {};
  for (const name of worldbookNames) {
    worldbooks[name] = await read('worldbook.read', {
      name,
      includeContent: true,
      maxEntries: 200,
      maxContentLength: 12000,
    });
  }
  const [users, personas, chatProfiles, imageProfiles] = await Promise.all([
    read('app.read_resource', { resource: 'user', include: ['details'], limit: 200 }),
    read('app.read_resource', { resource: 'persona', include: ['details'], limit: 200 }),
    read('config.list_profiles', { scope: 'chat' }),
    read('config.list_profiles', { scope: 'image' }),
  ]);
  const conversation = stores.maidConversationStore?.exportState?.() || {};
  const semantic = stores.maidSemanticMemoryStore?.exportState?.() || {};
  const retrievalStats = stores.capabilityRetrievalStore?.getStats?.() || {};
  const aggregates = Array.isArray(retrievalStats.aggregates) ? retrievalStats.aggregates : [];
  const sum = key => aggregates.reduce((total, item) => total + Number(item?.[key] || 0), 0);
  const storage = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    const value = key ? String(localStorage.getItem(key) || '') : '';
    storage.push({ key, chars: value.length, bytesApprox: value.length * 2 });
  }
  storage.sort((a, b) => b.bytesApprox - a.bytesApprox);
  let storageEstimate = null;
  try {
    storageEstimate = await navigator.storage?.estimate?.() || null;
  } catch {}
  return {
    schemaVersion: 1,
    capturedAt: Date.now(),
    scope: {
      persona: stores.personaStore?.getActive?.() || null,
      user: stores.userStore?.getActive?.() || null,
      chatScopeId: stores.chatStore?.scopeId || '',
      currentSessionId: stores.chatStore?.getCurrent?.() || '',
    },
    models: {
      chat: (chatProfiles?.profiles || []).find(profile => profile.active) || null,
      image: (imageProfiles?.profiles || []).find(profile => profile.active) || null,
      maid: {
        profileId: stores.maidSettingsStore?.getBoundProfileId?.() || '',
        modelOverride: stores.maidSettingsStore?.getBoundModelOverride?.() || '',
      },
    },
    allSessionCount: contacts.length,
    sessions: sessionResults,
    worldbooks,
    users: (users?.items || users?.users || [])
      .filter(item => /V4F-V2/.test(String(item?.name || ''))),
    personas: (personas?.items || personas?.personas || [])
      .filter(item => /V4F-V2/.test(String(item?.name || ''))),
    maidMemory: {
      turns: conversation.turns?.length || 0,
      activeTurns: (conversation.turns || []).filter(turn => !turn.compacted).length,
      compactedTurns: (conversation.turns || []).filter(turn => turn.compacted).length,
      memoryRows: conversation.memoryRows?.length || 0,
      extractionBatchCount: conversation.extractionBatches?.length || 0,
      targetMemories: (semantic.memories || [])
        .filter(memory => /霜港核对完成|名字含「?V4F-V2」?/.test(String(memory?.content || '')))
        .map(memory => ({
          id: memory.id,
          kind: memory.kind,
          key: memory.key,
          content: memory.content,
          confidence: memory.confidence,
          status: memory.status,
          sourceTurnIds: memory.sourceTurnIds || [],
        })),
    },
    shadow: {
      snapshotCount: Number(retrievalStats.snapshotCount || 0),
      aggregateCount: aggregates.length,
      validSelectionCount: sum('validSelectionCount'),
      hitCount: sum('hitCount'),
      missCount: sum('missCount'),
    },
    localStorage: {
      itemCount: storage.length,
      totalBytesApprox: storage.reduce((total, item) => total + item.bytesApprox, 0),
      largestItems: storage.slice(0, 20),
      estimate: storageEstimate,
    },
  };
})()`, { timeoutMs: 300_000 });

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  outputPath,
  capturedAt: report?.capturedAt,
  scope: report?.scope,
  models: report?.models,
  allSessionCount: report?.allSessionCount,
  sessionNames: Object.keys(report?.sessions || {}),
  worldbooks: Object.fromEntries(
    Object.entries(report?.worldbooks || {}).map(([name, item]) => [
      name,
      { ok: item?.ok, reason: item?.reason || '', entryCount: item?.entryCount },
    ]),
  ),
  maidMemory: report?.maidMemory,
  shadow: report?.shadow,
  localStorage: report?.localStorage,
}, null, 2));
if (!report?.scope?.persona?.name || !report?.scope?.user?.name) process.exitCode = 1;
