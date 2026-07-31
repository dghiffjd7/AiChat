import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const outputPath = resolve(
  'scripts/dev/tmp/mt-observation/v4f-v2-scope-baseline-20260731.json',
);

const result = await evaluateInApp(`(async () => {
  const getRegistry = () => window.appBridge?.debugUiRegistry || {};
  const initialRegistry = getRegistry();
  const initialStores = initialRegistry.stores || {};
  await Promise.all([
    initialStores.personaStore?.ready,
    initialStores.userStore?.ready,
    initialStores.chatStore?.ready,
  ].filter(Boolean));

  const before = {
    persona: initialStores.personaStore?.getActive?.() || null,
    user: initialStores.userStore?.getActive?.() || null,
    currentSessionId: String(initialStores.chatStore?.getCurrent?.() || ''),
  };
  const context = {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const runTool = async (name, args) => {
    const registry = getRegistry();
    const output = await registry.stores?.agentToolRegistry?.executeTool?.(name, args, context);
    return output?.result || output || null;
  };

  const personaResult = await runTool('persona.create', {
    name: '冻结观察V4F-V2-0731',
    description: 'Deepseek V4 Flash 冻结观察 v2 的一次性测试作用域；不属于正式资料。',
    setActive: true,
  });
  const userResult = await runTool('user.create', {
    name: '冻结观察用户V4F-V2-0731',
    description: 'Deepseek V4 Flash 冻结观察 v2 的一次性测试用户；不属于正式资料。',
    setActive: true,
  });

  const registry = getRegistry();
  const stores = registry.stores || {};
  await Promise.all([
    stores.personaStore?.ready,
    stores.userStore?.ready,
    stores.chatStore?.ready,
  ].filter(Boolean));
  const after = {
    persona: stores.personaStore?.getActive?.() || null,
    user: stores.userStore?.getActive?.() || null,
    currentSessionId: String(stores.chatStore?.getCurrent?.() || ''),
    sessionIds: stores.chatStore?.listSessions?.() || [],
  };
  const maid = stores.maidSettingsStore;
  const profiles = await registry.actions?.listAgentModelProfiles?.() || [];
  const maidProfileId = maid?.getBoundProfileId?.() || '';
  const maidProfile = profiles.find(profile => profile.id === maidProfileId) || null;
  const readContext = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const chatProfilesOutput = await stores.agentToolRegistry?.executeTool?.(
    'config.list_profiles',
    { scope: 'chat' },
    readContext,
  );
  const imageProfilesOutput = await stores.agentToolRegistry?.executeTool?.(
    'config.list_profiles',
    { scope: 'image' },
    readContext,
  );
  const chatProfiles = chatProfilesOutput?.result || chatProfilesOutput || {};
  const imageProfiles = imageProfilesOutput?.result || imageProfilesOutput || {};
  return {
    ok: personaResult?.ok === true
      && userResult?.ok === true
      && after.persona?.name === '冻结观察V4F-V2-0731'
      && after.user?.name === '冻结观察用户V4F-V2-0731',
    before: {
      persona: before.persona
        ? { id: before.persona.id, name: before.persona.name }
        : null,
      user: before.user
        ? { id: before.user.id, name: before.user.name }
        : null,
      currentSessionId: before.currentSessionId,
    },
    setup: {
      personaResult,
      userResult,
    },
    after: {
      persona: after.persona
        ? { id: after.persona.id, name: after.persona.name }
        : null,
      user: after.user
        ? { id: after.user.id, name: after.user.name }
        : null,
      currentSessionId: after.currentSessionId,
      sessionIds: after.sessionIds,
    },
    models: {
      maid: {
        profileId: maidProfileId,
        profileName: maidProfile?.name || '',
        provider: maidProfile?.provider || '',
        model: maid?.getBoundModelOverride?.() || maidProfile?.model || '',
      },
      chat: (chatProfiles.profiles || []).find(profile => profile.active) || null,
      image: (imageProfiles.profiles || []).find(profile => profile.active) || null,
    },
  };
})()`, { timeoutMs: 120_000 });

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, ...result }, null, 2));
if (!result?.ok) process.exitCode = 1;
