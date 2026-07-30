import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const TEST_STARTED_AT = 1785392073257;
const outputIndex = process.argv.indexOf('--output');
const outputPath = resolve(
  outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : 'scripts/dev/tmp/mt-observation/oregairu-natural-audit-20260730.json',
);

const report = await evaluateInApp(`(async () => {
  const startedAt = ${TEST_STARTED_AT};
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  await Promise.all([
    stores.personaStore?.ready,
    stores.userStore?.ready,
    stores.contactsStore?.ready,
    stores.chatStore?.ready,
  ].filter(Boolean));
  const expectedSessions = ['比企谷八幡', '雪之下雪乃', '由比滨结衣', '平塚静', '侍奉部'];
  const expectedWorldbooks = ['总武高与侍奉部世界观', '总武高重要人物资料'];
  const executeRead = async (name, args) => {
    const output = await stores.agentToolRegistry?.executeTool?.(name, args, {
      operationIntentPolicy: { mode: 'read_only' },
      requestPermission: async () => ({ decision: 'allow' }),
    });
    return output?.result || output || null;
  };
  const worldbooks = {};
  for (const name of expectedWorldbooks) {
    worldbooks[name] = await executeRead('worldbook.read', {
      name,
      includeContent: true,
      maxEntries: 200,
      maxContentLength: 12000,
    });
  }
  const bindings = {};
  for (const sessionId of expectedSessions) {
    const list = await executeRead('worldbook.list', {
      sessionId,
      includeGlobal: true,
      limit: 200,
    });
    bindings[sessionId] = (list?.worldbooks || [])
      .filter(item => item.boundToCurrentSession === true)
      .map(item => ({ id: item.id, name: item.name, entryCount: item.entryCount }));
  }
  const personaProjection = await executeRead('app.read_resource', {
    resource: 'persona',
    query: '总武高·桐谷澪企划',
    include: ['details', 'avatar', 'associations'],
  });
  const personas = stores.personaStore?.getAll?.() || [];
  const users = stores.userStore?.getAll?.() || [];
  const contacts = stores.contactsStore?.listContacts?.() || [];
  const expectedContacts = expectedSessions.map(sessionId => {
    const contact = stores.contactsStore?.getContact?.(sessionId) || null;
    const settings = stores.chatStore?.getSessionSettings?.(sessionId) || {};
    const wallpaper = settings.wallpaper || null;
    return {
      id: sessionId,
      exists: Boolean(contact),
      name: contact?.name || '',
      isGroup: contact?.isGroup === true || String(contact?.id || '').startsWith('group:'),
      members: contact?.members || contact?.memberIds || [],
      avatarBytes: String(contact?.avatar || '').length,
      wallpaper: wallpaper ? {
        path: String(wallpaper.path || wallpaper.url || ''),
        width: Number(wallpaper.width || 0),
        height: Number(wallpaper.height || 0),
        opacity: Number(wallpaper.opacity ?? 0),
      } : null,
    };
  });
  const conversation = stores.maidConversationStore?.exportState?.() || {};
  const semantic = stores.maidSemanticMemoryStore?.exportState?.() || {};
  const retrievalSnapshots = (stores.capabilityRetrievalStore?.listSnapshots?.({ limit: 500 }) || [])
    .filter(item => Number(item.createdAt || 0) >= startedAt);
  const validSnapshots = retrievalSnapshots.filter(item => item.validSelection === true);
  const hitSnapshots = validSnapshots.filter(item => item.candidateHit === true);
  const runs = (stores.agentRunStore?.listRuns?.({ limit: 500 }) || [])
    .filter(item => Number(item.createdAt || 0) >= startedAt)
    .map(item => ({
      id: item.id,
      status: item.status,
      summary: String(item.summary || '').slice(0, 1200),
      errorMessage: String(item.errorMessage || ''),
      createdAt: item.createdAt,
      finishedAt: item.finishedAt,
      usage: item.usage || null,
      metadata: item.metadata || null,
    }));
  return {
    ok: true,
    capturedAt: Date.now(),
    currentSessionId: stores.chatStore?.getCurrent?.() || '',
    activePersona: stores.personaStore?.getActive?.()?.name || '',
    activeUser: stores.userStore?.getActive?.()?.name || '',
    targetPersonas: personas
      .filter(item => /总武高|桐谷澪/.test(String(item.name || '')))
      .map(item => ({
        id: item.id,
        name: item.name,
        active: item.id === stores.personaStore?.getActive?.()?.id,
        avatarBytes: String(item.avatar || '').length,
        description: item.description || '',
        created: item.created,
      })),
    targetUsers: users
      .filter(item => /桐谷澪/.test(String(item.name || '')))
      .map(item => ({
        id: item.id,
        name: item.name,
        active: item.id === stores.userStore?.getActive?.()?.id,
        avatarBytes: String(item.avatar || '').length,
        description: item.description || '',
        created: item.created,
      })),
    personaProjection,
    expectedContacts,
    newGroupContacts: contacts
      .filter(item => (
        Number(item.createdAt || item.created || 0) >= startedAt &&
        (item.isGroup === true || String(item.id || '').startsWith('group:'))
      ))
      .map(item => ({
        id: item.id,
        name: item.name,
        members: item.members || item.memberIds || [],
      })),
    worldbooks,
    bindings,
    memory: {
      newTurns: (conversation.turns || [])
        .filter(item => Number(item.at || item.createdAt || item.timestamp || 0) >= startedAt)
        .map(item => ({
          id: item.id,
          input: item.input,
          status: item.status,
          responseType: item.responseType,
          message: String(item.message || '').slice(0, 1200),
          compacted: item.compacted === true,
          createdAt: item.at || item.createdAt || item.timestamp || 0,
        })),
      newExtractionBatches: (conversation.extractionBatches || [])
        .filter(item => Number(item.createdAt || 0) >= startedAt)
        .map(item => ({
          id: item.id,
          status: item.status,
          attempts: item.attempts,
          extractedCount: item.extractedCount,
          modelSource: item.modelSource || '',
          model: item.model || '',
          fallbackUsed: item.fallbackUsed === true,
          modelUsage: item.modelUsage || [],
          lastError: item.lastError || '',
        })),
      newSemanticMemories: (semantic.memories || [])
        .filter(item => Number(item.createdAt || 0) >= startedAt)
        .map(item => ({
          id: item.id,
          kind: item.kind,
          key: item.key,
          content: item.content,
          confidence: item.confidence,
          status: item.status,
          sourceTurnIds: item.sourceTurnIds || [],
        })),
    },
    shadow: {
      snapshotCount: retrievalSnapshots.length,
      validSelectionCount: validSnapshots.length,
      hitCount: hitSnapshots.length,
      missCount: validSnapshots.length - hitSnapshots.length,
      misses: validSnapshots
        .filter(item => item.candidateHit !== true)
        .map(item => ({
          id: item.id,
          phase: item.phase,
          selectedCapabilityId: item.selectedCapabilityId,
          selectedToolName: item.selectedToolName,
          candidates: (item.candidates || []).map(candidate => ({
            id: candidate.id,
            rank: candidate.rank,
            reasonCodes: candidate.reasonCodes || [],
          })),
        })),
    },
    runs,
  };
})()`, { timeoutMs: 300000 });

if (!report?.ok) throw new Error(report?.reason || 'Oregairu result audit failed');
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: true,
  outputPath,
  currentSessionId: report.currentSessionId,
  activePersona: report.activePersona,
  activeUser: report.activeUser,
  targetPersonas: report.targetPersonas.map(item => ({
    name: item.name,
    avatar: item.avatarBytes > 0,
    descriptionLength: item.description.length,
    active: item.active,
  })),
  targetUsers: report.targetUsers.map(item => ({
    name: item.name,
    avatar: item.avatarBytes > 0,
    descriptionLength: item.description.length,
    active: item.active,
  })),
  contacts: report.expectedContacts.map(item => ({
    name: item.name || item.id,
    exists: item.exists,
    isGroup: item.isGroup,
    memberCount: item.members.length,
    avatar: item.avatarBytes > 0,
    wallpaper: Boolean(item.wallpaper?.path),
    wallpaperSize: item.wallpaper ? [item.wallpaper.width, item.wallpaper.height] : null,
  })),
  newGroupCount: report.newGroupContacts.length,
  worldbooks: Object.fromEntries(Object.entries(report.worldbooks).map(([name, item]) => [
    name,
    { ok: item?.ok, entryCount: item?.entryCount, returnedEntryCount: item?.returnedEntryCount },
  ])),
  bindings: Object.fromEntries(Object.entries(report.bindings).map(([name, items]) => [
    name,
    items.map(item => item.name || item.id),
  ])),
  memory: {
    newTurns: report.memory.newTurns.length,
    extractionBatches: report.memory.newExtractionBatches,
    semanticMemories: report.memory.newSemanticMemories.length,
  },
  shadow: report.shadow,
  runCount: report.runs.length,
}, null, 2));
