import assert from 'node:assert/strict';

import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
} from '../../src/scripts/agent/agent-permissions.js';
import { createAgentToolRegistry } from '../../src/scripts/agent/agent-tool-registry.js';
import {
  createMaidMediaAssetTools,
  createPreparedImageCache,
} from '../../src/scripts/agent/tools/media-asset-tools.js';

const getTool = (tools, name) => tools.find(tool => tool.name === name);

const attachment = {
  id: 'img-1',
  kind: 'image',
  url: 'data:image/png;base64,AAAA',
  name: 'portrait.png',
  mime: 'image/png',
  size: 4,
};

{
  const cache = createPreparedImageCache({ createId: () => 'prepared-1' });
  const tools = createMaidMediaAssetTools({
    preparedImageCache: cache,
    prepareImage: async ({ dataUrl, purpose }) => ({
      dataUrl: `${dataUrl}-${purpose}`,
      width: purpose === 'avatar' ? 256 : 1200,
      height: purpose === 'avatar' ? 256 : 800,
      mime: purpose === 'avatar' ? 'image/webp' : 'image/jpeg',
      bytes: 1234,
      transformed: true,
    }),
  });
  const result = await getTool(tools, 'media.prepare_image').execute(
    { purpose: 'avatar', attachmentId: 'img-1' },
    { maidAttachments: [attachment] },
  );
  assert.equal(result.ok, true);
  assert.equal(result.image.preparedImageId, 'prepared-1');
  assert.equal(result.image.width, 256);
  assert.equal(cache.get('prepared-1').dataUrl, 'data:image/png;base64,AAAA-avatar');
  console.log('ok - media asset tool prepares maid image attachments into cache');
}

{
  const personas = new Map([
    ['p1', { id: 'p1', name: '角色A', avatar: '' }],
  ]);
  const cache = createPreparedImageCache({ createId: () => 'prepared-avatar' });
  const tools = createMaidMediaAssetTools({
    preparedImageCache: cache,
    personaStore: {
      getAll: () => Array.from(personas.values()),
      get: id => personas.get(id) || null,
      getActive: () => personas.get('p1'),
      update: async (id, patch) => {
        const next = { ...personas.get(id), ...patch };
        personas.set(id, next);
        return next;
      },
    },
    prepareImage: async ({ purpose }) => ({
      dataUrl: `data:image/webp;base64,${purpose}`,
      width: 256,
      height: 256,
      mime: 'image/webp',
      bytes: 100,
      transformed: true,
    }),
  });
  const result = await getTool(tools, 'persona.set_avatar').execute(
    { target: '角色A' },
    { maidAttachments: [attachment] },
  );
  assert.equal(result.ok, true);
  assert.equal(result.target.id, 'p1');
  assert.equal(personas.get('p1').avatar, 'data:image/webp;base64,avatar');
  console.log('ok - media asset tool sets character card avatar from uploaded image');
}

{
  const personas = new Map([
    ['p1', { id: 'p1', name: '角色A', avatar: 'old-avatar' }],
  ]);
  let prepared = 0;
  let confirmed = 0;
  const tools = createMaidMediaAssetTools({
    personaStore: {
      getAll: () => Array.from(personas.values()),
      get: id => personas.get(id) || null,
      getActive: () => personas.get('p1'),
      update: async (id, patch) => {
        const next = { ...personas.get(id), ...patch };
        personas.set(id, next);
        return next;
      },
    },
    confirmDestructiveWrite: async () => {
      confirmed += 1;
      return false;
    },
    prepareImage: async () => {
      prepared += 1;
      return {
        dataUrl: 'new-avatar',
        width: 256,
        height: 256,
        mime: 'image/webp',
        bytes: 100,
        transformed: true,
      };
    },
  });
  const result = await getTool(tools, 'persona.set_avatar').execute(
    { target: '角色A' },
    { maidAttachments: [attachment] },
  );
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'destructive_write_cancelled');
  assert.equal(confirmed, 1);
  assert.equal(prepared, 0);
  assert.equal(personas.get('p1').avatar, 'old-avatar');
  console.log('ok - media asset tool requires confirmation before replacing character avatar');
}

{
  const personas = new Map([
    ['p1', { id: 'p1', name: '角色A', avatar: 'old-avatar' }],
  ]);
  let prepared = 0;
  let confirmations = 0;
  const tools = createMaidMediaAssetTools({
    personaStore: {
      getAll: () => Array.from(personas.values()),
      get: id => personas.get(id) || null,
      getActive: () => personas.get('p1'),
      update: async (id, patch) => {
        const next = { ...personas.get(id), ...patch };
        personas.set(id, next);
        return next;
      },
    },
    confirmDestructiveWrite: async () => {
      throw new Error('tool-local confirmation should not run after registry safety skip');
    },
    prepareImage: async () => {
      prepared += 1;
      return {
        dataUrl: 'new-avatar',
        width: 256,
        height: 256,
        mime: 'image/webp',
        bytes: 100,
        transformed: true,
      };
    },
  });
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.allow,
    }),
    logger: { warn: () => {} },
  });
  registry.registerMany(tools);
  const result = await registry.executeTool('persona.set_avatar', { target: '角色A' }, {
    maidAttachments: [attachment],
    requestToolConfirmation: request => {
      confirmations += 1;
      assert.equal(request.kind, 'persona.avatar.replace');
      return false;
    },
  });
  assert.equal(result.status, 'skipped');
  assert.equal(result.result.skipped, true);
  assert.equal(result.result.reason, 'destructive_write_cancelled');
  assert.equal(confirmations, 1);
  assert.equal(prepared, 0);
  assert.equal(personas.get('p1').avatar, 'old-avatar');
  console.log('ok - media asset tool uses registry safety skip before replacing character avatar');
}

{
  const contacts = new Map([
    ['room-1', { id: 'room-1', name: '聊天室A', avatar: '' }],
  ]);
  const settings = new Map([
    ['room-1', { bubbleColor: '#fff' }],
  ]);
  const savedPayloads = [];
  const applied = [];
  const refreshed = [];
  const tools = createMaidMediaAssetTools({
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
    },
    chatStore: {
      getSessionSettings: id => settings.get(id) || {},
      setSessionSettings: (id, next) => settings.set(id, next),
    },
    getCurrentSessionId: () => 'room-1',
    saveWallpaper: async payload => {
      savedPayloads.push(payload);
      return { path: `wallpapers/${payload.sessionId}/wallpaper.jpg`, bytes: 1000 };
    },
    applyChatSettings: async (id, next) => applied.push([id, next]),
    refreshChatAndContacts: async meta => refreshed.push(meta),
    prepareImage: async () => ({
      dataUrl: 'data:image/jpeg;base64,WALLPAPER',
      width: 1600,
      height: 900,
      mime: 'image/jpeg',
      bytes: 900,
      transformed: true,
    }),
    now: () => 1000,
  });
  const result = await getTool(tools, 'session.set_wallpaper').execute(
    { target: '聊天室A', opacity: 0.8 },
    { maidAttachments: [attachment] },
  );
  assert.equal(result.ok, true);
  assert.equal(result.persisted, true);
  assert.equal(settings.get('room-1').wallpaper.path, 'wallpapers/room-1/wallpaper.jpg');
  assert.equal(settings.get('room-1').wallpaper.opacity, 0.8);
  assert.equal(savedPayloads[0].sessionId, 'room-1');
  assert.equal(applied[0][0], 'room-1');
  assert.equal(refreshed[0].reason, 'maid_session_wallpaper');
  console.log('ok - media asset tool sets chat wallpaper and refreshes session state');
}

{
  const contacts = new Map([
    ['room-1', { id: 'room-1', name: '聊天室A', avatar: '' }],
  ]);
  const settings = new Map([
    ['room-1', { wallpaper: { path: 'wallpapers/room-1/old.jpg' } }],
  ]);
  let saved = 0;
  let prepared = 0;
  let confirmed = 0;
  const tools = createMaidMediaAssetTools({
    contactsStore: {
      listContacts: () => Array.from(contacts.values()),
      getContact: id => contacts.get(id) || null,
    },
    chatStore: {
      getSessionSettings: id => settings.get(id) || {},
      setSessionSettings: (id, next) => settings.set(id, next),
    },
    getCurrentSessionId: () => 'room-1',
    confirmDestructiveWrite: async () => {
      confirmed += 1;
      return false;
    },
    saveWallpaper: async () => {
      saved += 1;
      return { path: 'wallpapers/room-1/new.jpg' };
    },
    prepareImage: async () => {
      prepared += 1;
      return {
        dataUrl: 'data:image/jpeg;base64,WALLPAPER',
        width: 1600,
        height: 900,
        mime: 'image/jpeg',
        bytes: 900,
        transformed: true,
      };
    },
  });
  const result = await getTool(tools, 'session.set_wallpaper').execute(
    { target: '聊天室A' },
    { maidAttachments: [attachment] },
  );
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'destructive_write_cancelled');
  assert.equal(confirmed, 1);
  assert.equal(prepared, 0);
  assert.equal(saved, 0);
  assert.equal(settings.get('room-1').wallpaper.path, 'wallpapers/room-1/old.jpg');
  console.log('ok - media asset tool requires confirmation before replacing chat wallpaper');
}
