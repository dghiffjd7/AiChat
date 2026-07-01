import { normalizeMaidImageAttachments } from '../maid-attachment-parts.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const normalizeKey = value => trim(value).toLowerCase().replace(/\s+/g, '');

const listStoreItems = store => (
  typeof store?.getAll === 'function'
    ? store.getAll()
    : (typeof store?.listContacts === 'function' ? store.listContacts() : [])
).filter(Boolean);

const getStoreItem = (store, id = '') => {
  const target = trim(id);
  if (!target) return null;
  if (typeof store?.get === 'function') return store.get(target) || null;
  if (typeof store?.getContact === 'function') return store.getContact(target) || null;
  return null;
};

const getActiveStoreItem = store => {
  try {
    return typeof store?.getActive === 'function' ? store.getActive() : null;
  } catch {
    return null;
  }
};

const findStoreItem = (store, query = '') => {
  const raw = trim(query);
  if (!raw) return null;
  const direct = getStoreItem(store, raw);
  if (direct) return direct;
  const key = normalizeKey(raw);
  return listStoreItems(store).find(item => (
    trim(item?.id) === raw ||
    trim(item?.name) === raw ||
    normalizeKey(item?.id) === key ||
    normalizeKey(item?.name) === key
  )) || null;
};

const summarizeProfile = profile => ({
  id: trim(profile?.id),
  name: trim(profile?.name || profile?.id),
  avatarBytes: trim(profile?.avatar).length,
});

const inferDataUrlMime = (dataUrl = '', fallback = 'image/jpeg') => {
  const match = trim(dataUrl).match(/^data:([^;,]+)[;,]/i);
  return trim(match?.[1], fallback);
};

const estimateDataUrlBytes = (dataUrl = '') => {
  const raw = trim(dataUrl);
  const comma = raw.indexOf(',');
  const payload = comma >= 0 ? raw.slice(comma + 1) : raw;
  return Math.ceil((payload.length * 3) / 4);
};

const defaultPrepareImage = async ({ dataUrl = '', purpose = 'image' } = {}) => ({
  dataUrl: trim(dataUrl),
  width: 0,
  height: 0,
  mime: inferDataUrlMime(dataUrl, purpose === 'avatar' ? 'image/webp' : 'image/jpeg'),
  bytes: estimateDataUrlBytes(dataUrl),
  transformed: false,
});

export const createPreparedImageCache = ({
  maxEntries = 32,
  createId = () => `prepared_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
} = {}) => {
  const entries = new Map();
  const max = Math.max(4, Math.min(128, Math.trunc(Number(maxEntries || 0)) || 32));
  const set = (image = {}) => {
    const id = trim(image.preparedImageId) || createId();
    entries.set(id, {
      ...clone(image),
      preparedImageId: id,
      createdAt: Date.now(),
    });
    while (entries.size > max) {
      const first = entries.keys().next().value;
      entries.delete(first);
    }
    return entries.get(id);
  };
  return {
    set,
    get: id => entries.get(trim(id)) || null,
    clear: () => entries.clear(),
    size: () => entries.size,
  };
};

const publicImageMeta = image => ({
  preparedImageId: trim(image?.preparedImageId),
  attachmentId: trim(image?.attachmentId),
  purpose: trim(image?.purpose),
  name: trim(image?.name),
  mime: trim(image?.mime),
  width: Number(image?.width || 0) || 0,
  height: Number(image?.height || 0) || 0,
  bytes: Number(image?.bytes || 0) || 0,
  transformed: image?.transformed === true,
});

const resolveAttachment = (context = {}, args = {}) => {
  const images = normalizeMaidImageAttachments(context?.maidAttachments);
  if (!images.length) return null;
  const requested = trim(args.attachmentId || args.imageId || args.sourceImageId);
  if (!requested) return images[0];
  const key = normalizeKey(requested);
  return images.find(item => (
    normalizeKey(item.id) === key ||
    normalizeKey(item.name) === key ||
    String(images.indexOf(item) + 1) === requested
  )) || null;
};

const normalizePurpose = (value = '', fallback = 'image') => {
  const raw = trim(value, fallback).toLowerCase();
  if (raw === 'role_avatar' || raw === 'persona_avatar' || raw === 'contact_avatar' || raw === 'user_avatar') return 'avatar';
  if (raw === 'background' || raw === 'chat_wallpaper') return 'wallpaper';
  if (raw === 'avatar' || raw === 'wallpaper' || raw === 'image') return raw;
  return fallback;
};

const buildPrepareOptions = (purpose = 'image', args = {}) => {
  const usage = normalizePurpose(purpose, 'image');
  const avatar = usage === 'avatar';
  const wallpaper = usage === 'wallpaper';
  return {
    purpose: usage,
    fit: trim(args.fit, avatar ? 'cover' : 'contain'),
    maxDim: Math.max(32, Math.min(4096, Math.trunc(Number(args.maxDim || 0)) || (avatar ? 256 : wallpaper ? 2048 : 1280))),
    quality: Math.max(0.35, Math.min(0.95, Number(args.quality || 0) || (avatar ? 0.84 : 0.86))),
    maxBytes: Math.max(32_000, Math.min(4_000_000, Math.trunc(Number(args.maxBytes || 0)) || (avatar ? 180_000 : 1_400_000))),
    mime: trim(args.mime, avatar ? 'image/webp' : 'image/jpeg'),
  };
};

export const createMaidMediaAssetTools = ({
  personaStore = null,
  userStore = null,
  contactsStore = null,
  chatStore = null,
  prepareImage = defaultPrepareImage,
  saveWallpaper = null,
  applyChatSettings = null,
  refreshChatAndContacts = null,
  getCurrentSessionId = () => '',
  confirmDestructiveWrite = null,
  now = Date.now,
  preparedImageCache = createPreparedImageCache(),
} = {}) => {
  const prepareAndCacheImage = async ({
    args = {},
    context = {},
    purpose = 'image',
  } = {}) => {
    const cached = preparedImageCache.get(args.preparedImageId);
    if (cached) return cached;
    const attachment = resolveAttachment(context, args);
    if (!attachment?.url) {
      return {
        ok: false,
        reason: 'image_attachment_missing',
        message: '没有找到本次请求中的图片附件。',
      };
    }
    const options = buildPrepareOptions(purpose || args.purpose, args);
    const prepared = await prepareImage({
      dataUrl: attachment.url,
      attachment,
      args,
      ...options,
    });
    const dataUrl = trim(prepared?.dataUrl);
    if (!dataUrl) {
      return {
        ok: false,
        reason: 'image_prepare_failed',
        message: '图片处理失败。',
      };
    }
    return preparedImageCache.set({
      ...options,
      ...clone(prepared),
      dataUrl,
      purpose: options.purpose,
      attachmentId: trim(attachment.id),
      name: trim(args.fileName || attachment.name, `${options.purpose}.jpg`),
      mime: trim(prepared?.mime, options.mime),
      bytes: Number(prepared?.bytes || 0) || estimateDataUrlBytes(dataUrl),
      width: Number(prepared?.width || 0) || 0,
      height: Number(prepared?.height || 0) || 0,
    });
  };

  const resolvePersonaTarget = (args = {}) => {
    const target = trim(args.target || args.personaId || args.id || args.name);
    return target ? findStoreItem(personaStore, target) : getActiveStoreItem(personaStore);
  };

  const resolveUserTarget = (args = {}) => {
    const target = trim(args.target || args.userId || args.id || args.name);
    return target ? findStoreItem(userStore, target) : getActiveStoreItem(userStore);
  };

  const resolveContactTarget = (args = {}) => {
    const explicit = trim(args.target || args.contactId || args.sessionId || args.sessionName || args.chatName || args.name);
    const fallback = trim(getCurrentSessionId?.());
    return explicit ? findStoreItem(contactsStore, explicit) : findStoreItem(contactsStore, fallback);
  };

  const resolveSessionTarget = (args = {}) => {
    const explicit = trim(args.target || args.sessionId || args.sessionName || args.chatName || args.contactId || args.name);
    const fallback = trim(getCurrentSessionId?.());
    const contact = explicit ? findStoreItem(contactsStore, explicit) : findStoreItem(contactsStore, fallback);
    return contact || (explicit ? { id: explicit, name: explicit } : (fallback ? { id: fallback, name: fallback } : null));
  };

  const hasAllowedToolSafety = (context = {}, kind = '') => (
    context?.toolSafety?.decision === 'allow' &&
    (!kind || context?.toolSafety?.request?.kind === kind)
  );

  const buildAvatarSafetyPreflight = ({ kind = 'profile', resolveTarget = null, title = '覆盖头像' } = {}) => async (args = {}) => {
    const target = resolveTarget?.(args);
    if (!target?.id || !trim(target.avatar)) {
      return { destructive: false, operationType: 'set_avatar' };
    }
    return {
      destructive: true,
      kind: `${kind}.avatar.replace`,
      operationType: 'replace_existing',
      title,
      message: `「${trim(target.name || target.id)}」已有头像。这个动作会替换现有头像。`,
      confirmText: '覆盖',
      cancelText: '取消',
      danger: true,
      details: {
        targetId: trim(target.id),
      },
      onDeny: {
        action: 'skip',
        reason: 'destructive_write_cancelled',
      },
    };
  };

  const makeAvatarSetter = ({ kind = 'persona', store = null, resolveTarget = null, update = null } = {}) => async (args = {}, context = {}) => {
    const target = resolveTarget?.(args);
    if (!target?.id) {
      return { ok: false, reason: `${kind}_not_found`, message: `没有找到要设置头像的${kind}。` };
    }
    if (typeof update !== 'function') {
      return { ok: false, reason: `${kind}_update_unavailable`, message: '头像写入能力不可用。' };
    }
    if (trim(target.avatar) && !hasAllowedToolSafety(context, `${kind}.avatar.replace`)) {
      const confirmed = typeof confirmDestructiveWrite === 'function'
        ? await confirmDestructiveWrite({
          kind: `${kind}.avatar.replace`,
          title: '覆盖头像',
          message: `「${trim(target.name || target.id)}」已有头像。这个动作会替换现有头像。`,
          confirmText: '覆盖',
          cancelText: '取消',
          danger: true,
          targetId: trim(target.id),
        })
        : false;
      if (confirmed !== true) {
        return {
          ok: false,
          skipped: true,
          reason: 'destructive_write_cancelled',
          kind,
          target: summarizeProfile(target),
        };
      }
    }
    const image = await prepareAndCacheImage({ args, context, purpose: 'avatar' });
    if (image?.ok === false) return image;
    const updated = await update(target, image.dataUrl);
    if (!updated) {
      return { ok: false, reason: `${kind}_update_failed`, target: summarizeProfile(target) };
    }
    return {
      ok: true,
      kind,
      target: summarizeProfile(updated || target),
      image: publicImageMeta(image),
    };
  };

  const setStoreAvatar = async (store, target, avatar) => {
    if (!target?.id || typeof store?.update !== 'function') return null;
    return store.update(target.id, { avatar });
  };

  return [
    {
      name: 'media.prepare_image',
      title: 'Prepare uploaded image',
      description: 'Prepare the current maid image attachment for avatar or wallpaper usage. Use attachmentId when multiple images are attached.',
      source: 'maid-media-assets',
      permissions: [],
      riskLevel: 'low',
      capabilities: {
        read: true,
        write: false,
        network: false,
        cost: 'none',
        undo: 'none',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attachmentId: { type: 'string', maxLength: 160 },
          imageId: { type: 'string', maxLength: 160 },
          purpose: { type: 'string', maxLength: 40 },
          fit: { type: 'string', maxLength: 40 },
          maxDim: { type: 'integer', minimum: 32, maximum: 4096 },
          quality: { type: 'number', minimum: 0.35, maximum: 0.95 },
          maxBytes: { type: 'integer', minimum: 32000, maximum: 4000000 },
          mime: { type: 'string', maxLength: 80 },
          fileName: { type: 'string', maxLength: 180 },
        },
      },
      execute: async (args = {}, context = {}) => {
        const image = await prepareAndCacheImage({
          args,
          context,
          purpose: normalizePurpose(args.purpose, 'image'),
        });
        if (image?.ok === false) return image;
        return {
          ok: true,
          image: publicImageMeta(image),
        };
      },
      summarizeResult: result => result?.ok === false
        ? `image prepare failed: ${trim(result?.reason, 'failed')}`
        : `prepared image ${trim(result?.image?.preparedImageId, '-')}`,
    },
    {
      name: 'persona.set_avatar',
      title: 'Set character card avatar',
      description: 'Set an uploaded image as a character card/persona avatar. Defaults to the active character card if target is omitted.',
      source: 'maid-media-assets',
      permissions: [],
      riskLevel: 'medium',
      capabilities: {
        read: true,
        write: true,
        network: false,
        cost: 'none',
        undo: 'manual_restore_avatar',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'string', maxLength: 160 },
          personaId: { type: 'string', maxLength: 160 },
          id: { type: 'string', maxLength: 160 },
          name: { type: 'string', maxLength: 160 },
          attachmentId: { type: 'string', maxLength: 160 },
          preparedImageId: { type: 'string', maxLength: 160 },
        },
      },
      safety: {
        operationType: 'set_avatar',
        destructive: 'conditional',
        preflight: buildAvatarSafetyPreflight({
          kind: 'persona',
          resolveTarget: resolvePersonaTarget,
          title: '覆盖头像',
        }),
      },
      execute: makeAvatarSetter({
        kind: 'persona',
        store: personaStore,
        resolveTarget: resolvePersonaTarget,
        update: (target, avatar) => setStoreAvatar(personaStore, target, avatar),
      }),
      summarizeResult: result => result?.ok
        ? `set character avatar ${trim(result?.target?.name, result?.target?.id || '-')}`
        : `set character avatar failed: ${trim(result?.reason, 'failed')}`,
    },
    {
      name: 'user.set_avatar',
      title: 'Set user avatar',
      description: 'Set an uploaded image as a user profile avatar. Defaults to the active user if target is omitted.',
      source: 'maid-media-assets',
      permissions: [],
      riskLevel: 'medium',
      capabilities: {
        read: true,
        write: true,
        network: false,
        cost: 'none',
        undo: 'manual_restore_avatar',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'string', maxLength: 160 },
          userId: { type: 'string', maxLength: 160 },
          id: { type: 'string', maxLength: 160 },
          name: { type: 'string', maxLength: 160 },
          attachmentId: { type: 'string', maxLength: 160 },
          preparedImageId: { type: 'string', maxLength: 160 },
        },
      },
      safety: {
        operationType: 'set_avatar',
        destructive: 'conditional',
        preflight: buildAvatarSafetyPreflight({
          kind: 'user',
          resolveTarget: resolveUserTarget,
          title: '覆盖头像',
        }),
      },
      execute: makeAvatarSetter({
        kind: 'user',
        store: userStore,
        resolveTarget: resolveUserTarget,
        update: (target, avatar) => setStoreAvatar(userStore, target, avatar),
      }),
      summarizeResult: result => result?.ok
        ? `set user avatar ${trim(result?.target?.name, result?.target?.id || '-')}`
        : `set user avatar failed: ${trim(result?.reason, 'failed')}`,
    },
    {
      name: 'contact.set_avatar',
      title: 'Set contact avatar',
      description: 'Set an uploaded image as a chat contact/session avatar. Defaults to the current session contact if target is omitted.',
      source: 'maid-media-assets',
      permissions: [],
      riskLevel: 'medium',
      capabilities: {
        read: true,
        write: true,
        network: false,
        cost: 'none',
        undo: 'manual_restore_avatar',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'string', maxLength: 160 },
          contactId: { type: 'string', maxLength: 160 },
          sessionId: { type: 'string', maxLength: 160 },
          sessionName: { type: 'string', maxLength: 160 },
          chatName: { type: 'string', maxLength: 160 },
          name: { type: 'string', maxLength: 160 },
          attachmentId: { type: 'string', maxLength: 160 },
          preparedImageId: { type: 'string', maxLength: 160 },
        },
      },
      safety: {
        operationType: 'set_avatar',
        destructive: 'conditional',
        preflight: buildAvatarSafetyPreflight({
          kind: 'contact',
          resolveTarget: resolveContactTarget,
          title: '覆盖联系人头像',
        }),
      },
      execute: async (args = {}, context = {}) => {
        const target = resolveContactTarget(args);
        if (!target?.id) {
          return { ok: false, reason: 'contact_not_found', message: '没有找到要设置头像的联系人或聊天室。' };
        }
        if (typeof contactsStore?.upsertContact !== 'function') {
          return { ok: false, reason: 'contacts_store_unavailable', message: '联系人写入能力不可用。' };
        }
        if (trim(target.avatar) && !hasAllowedToolSafety(context, 'contact.avatar.replace')) {
          const confirmed = typeof confirmDestructiveWrite === 'function'
            ? await confirmDestructiveWrite({
              kind: 'contact.avatar.replace',
              title: '覆盖联系人头像',
              message: `「${trim(target.name || target.id)}」已有头像。这个动作会替换现有头像。`,
              confirmText: '覆盖',
              cancelText: '取消',
              danger: true,
              targetId: trim(target.id),
            })
            : false;
          if (confirmed !== true) {
            return {
              ok: false,
              skipped: true,
              reason: 'destructive_write_cancelled',
              kind: 'contact',
              target: summarizeProfile(target),
            };
          }
        }
        const image = await prepareAndCacheImage({ args, context, purpose: 'avatar' });
        if (image?.ok === false) return image;
        contactsStore.upsertContact({ ...target, avatar: image.dataUrl });
        await refreshChatAndContacts?.({ reason: 'maid_contact_avatar', sessionId: target.id });
        const next = findStoreItem(contactsStore, target.id) || { ...target, avatar: image.dataUrl };
        return {
          ok: true,
          kind: 'contact',
          target: summarizeProfile(next),
          image: publicImageMeta(image),
        };
      },
      summarizeResult: result => result?.ok
        ? `set contact avatar ${trim(result?.target?.name, result?.target?.id || '-')}`
        : `set contact avatar failed: ${trim(result?.reason, 'failed')}`,
    },
    {
      name: 'session.set_wallpaper',
      title: 'Set chat wallpaper',
      description: 'Set an uploaded image as a chat session wallpaper. Defaults to the current session if target is omitted.',
      source: 'maid-media-assets',
      permissions: [],
      riskLevel: 'medium',
      capabilities: {
        read: true,
        write: true,
        network: false,
        cost: 'none',
        undo: 'manual_restore_wallpaper',
        modelContext: 'allowlist',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'string', maxLength: 160 },
          sessionId: { type: 'string', maxLength: 160 },
          sessionName: { type: 'string', maxLength: 160 },
          chatName: { type: 'string', maxLength: 160 },
          contactId: { type: 'string', maxLength: 160 },
          name: { type: 'string', maxLength: 160 },
          attachmentId: { type: 'string', maxLength: 160 },
          preparedImageId: { type: 'string', maxLength: 160 },
          opacity: { type: 'number', minimum: 0.1, maximum: 1 },
          fit: { type: 'string', maxLength: 40 },
        },
      },
      safety: {
        operationType: 'set_wallpaper',
        destructive: 'conditional',
        preflight: async (args = {}) => {
          const target = resolveSessionTarget(args);
          const sessionId = trim(target?.id);
          const existing = isPlainObject(chatStore?.getSessionSettings?.(sessionId))
            ? chatStore.getSessionSettings(sessionId)
            : {};
          if (!sessionId || !(existing?.wallpaper?.path || existing?.wallpaper?.url || existing?.chatBg)) {
            return { destructive: false, operationType: 'set_wallpaper' };
          }
          return {
            destructive: true,
            kind: 'session.wallpaper.replace',
            operationType: 'replace_existing',
            title: '覆盖聊天室壁纸',
            message: `聊天室「${trim(target.name || sessionId)}」已有壁纸。这个动作会替换现有壁纸。`,
            confirmText: '覆盖',
            cancelText: '取消',
            danger: true,
            details: {
              sessionId,
            },
            onDeny: {
              action: 'skip',
              reason: 'destructive_write_cancelled',
            },
          };
        },
      },
      execute: async (args = {}, context = {}) => {
        const target = resolveSessionTarget(args);
        const sessionId = trim(target?.id);
        if (!sessionId) {
          return { ok: false, reason: 'session_not_found', message: '没有找到要设置壁纸的聊天室。' };
        }
        if (!chatStore || typeof chatStore.setSessionSettings !== 'function') {
          return { ok: false, reason: 'chat_settings_unavailable', message: '聊天室设置写入能力不可用。' };
        }
        const existing = isPlainObject(chatStore.getSessionSettings?.(sessionId))
          ? chatStore.getSessionSettings(sessionId)
          : {};
        if ((existing?.wallpaper?.path || existing?.wallpaper?.url || existing?.chatBg) && !hasAllowedToolSafety(context, 'session.wallpaper.replace')) {
          const confirmed = typeof confirmDestructiveWrite === 'function'
            ? await confirmDestructiveWrite({
              kind: 'session.wallpaper.replace',
              title: '覆盖聊天室壁纸',
              message: `聊天室「${trim(target.name || sessionId)}」已有壁纸。这个动作会替换现有壁纸。`,
              confirmText: '覆盖',
              cancelText: '取消',
              danger: true,
              sessionId,
            })
            : false;
          if (confirmed !== true) {
            return {
              ok: false,
              skipped: true,
              reason: 'destructive_write_cancelled',
              sessionId,
              sessionName: trim(target?.name || sessionId),
            };
          }
        }
        const image = await prepareAndCacheImage({ args, context, purpose: 'wallpaper' });
        if (image?.ok === false) return image;
        let saved = null;
        if (typeof saveWallpaper === 'function') {
          try {
            saved = await saveWallpaper({
              sessionId,
              dataUrl: image.dataUrl,
              fileName: image.name || 'wallpaper',
              mimeType: image.mime,
              previousPath: trim(existing?.wallpaper?.path),
            });
          } catch {}
        }
        const opacity = Math.max(0.1, Math.min(1, Number(args.opacity || 1) || 1));
        const wallpaper = saved?.path
          ? {
              path: trim(saved.path),
              name: image.name || 'wallpaper',
              zoom: 1,
              rotate: 0,
              offsetX: 0,
              offsetY: 0,
              width: image.width,
              height: image.height,
              opacity,
              updatedAt: Number(now?.() || Date.now()) || Date.now(),
              source: 'maid',
            }
          : {
              url: image.dataUrl,
              name: image.name || 'wallpaper',
              zoom: 1,
              rotate: 0,
              offsetX: 0,
              offsetY: 0,
              width: image.width,
              height: image.height,
              opacity,
              updatedAt: Number(now?.() || Date.now()) || Date.now(),
              transient: true,
              source: 'maid',
            };
        const nextSettings = {
          ...existing,
          wallpaper,
        };
        delete nextSettings.chatBg;
        chatStore.setSessionSettings(sessionId, nextSettings);
        await applyChatSettings?.(sessionId, nextSettings);
        await refreshChatAndContacts?.({ reason: 'maid_session_wallpaper', sessionId });
        return {
          ok: true,
          sessionId,
          sessionName: trim(target?.name || sessionId),
          persisted: Boolean(saved?.path),
          wallpaper: {
            path: trim(wallpaper.path),
            transient: wallpaper.transient === true,
            width: wallpaper.width,
            height: wallpaper.height,
            opacity: wallpaper.opacity,
          },
          image: publicImageMeta(image),
        };
      },
      summarizeResult: result => result?.ok
        ? `set wallpaper ${trim(result?.sessionName || result?.sessionId, '-')}`
        : `set wallpaper failed: ${trim(result?.reason, 'failed')}`,
    },
  ];
};

export const registerMaidMediaAssetTools = (registry, deps = {}) => {
  const tools = createMaidMediaAssetTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
