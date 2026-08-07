// 在运行中的 dev APP 页面上下文执行；由 app-eval.mjs 载入。
// 只创建 __codex_media_conflict_* 临时角色/聊天室，使用内嵌 PNG，不调用付费模型，结束后自动清理。
(async () => {
  const bridge = window.appBridge;
  const debug = bridge?.debugUiRegistry;
  const registry = debug?.stores?.agentToolRegistry;
  const personaStore = debug?.stores?.personaStore;
  const chatStore = debug?.stores?.chatStore;
  const contactsStore = debug?.stores?.contactsStore;
  const sessionPanel = debug?.panels?.sessionPanel;
  if (
    !registry?.executeTool ||
    !personaStore?.create ||
    !chatStore?.getSessionSettings ||
    !contactsStore?.upsertContact ||
    !sessionPanel?.removeCore
  ) {
    throw new Error('media conflict probe dependencies unavailable');
  }
  const { safeInvoke } = await import('/scripts/utils/tauri.js');

  const prefix = `__codex_media_conflict_${Date.now()}`;
  const roomA = `${prefix}_room_a`;
  const roomB = `${prefix}_room_b`;
  const fixtureSessions = [roomA, roomB];
  const fixturePersonas = [];
  const fixtureWallpaperFiles = [];
  const originalPersonaId = String(personaStore.getActive?.()?.id || '').trim();
  const originalSessionId = String(chatStore.getCurrent?.() || '').trim();
  const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlT3f8AAAAASUVORK5CYII=';
  const attachment = {
    id: `${prefix}_image`,
    kind: 'image',
    name: 'probe.png',
    mime: 'image/png',
    url: imageDataUrl,
  };
  const allowContext = {
    operationIntentPolicy: { mode: 'write_allowed' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const report = { prefix, cases: {}, cleanup: null };
  const hasSession = sessionId => (
    Boolean(contactsStore.getContact?.(sessionId)) ||
    Boolean(chatStore.hasSession?.(sessionId)) ||
    (chatStore.listSessions?.() || []).some(id => String(id) === sessionId)
  );
  const createSession = async (sessionId) => {
    const output = await registry.executeTool('session.create', {
      name: sessionId,
      open: false,
    }, allowContext);
    if (output?.status !== 'succeeded' || output?.result?.ok === false) {
      throw new Error(`failed to create media probe session: ${sessionId}`);
    }
  };
  const setCurrentSession = (sessionId) => {
    if (sessionId) chatStore.switchSession?.(sessionId);
    else chatStore.setCurrent?.('');
    bridge?.setActiveSession?.(sessionId || '');
  };

  try {
    const avatarPrepared = await registry.executeTool('media.prepare_image', {
      attachmentId: attachment.id,
      purpose: 'avatar',
    }, { ...allowContext, maidAttachments: [attachment] });
    const wallpaperPrepared = await registry.executeTool('media.prepare_image', {
      attachmentId: attachment.id,
      purpose: 'wallpaper',
    }, { ...allowContext, maidAttachments: [attachment] });
    const avatarPreparedId = String(avatarPrepared?.result?.image?.preparedImageId || '').trim();
    const wallpaperPreparedId = String(wallpaperPrepared?.result?.image?.preparedImageId || '').trim();
    if (!avatarPreparedId || !wallpaperPreparedId) throw new Error('failed to prepare media probe image');

    const personaA = await personaStore.create({ name: `${prefix}_persona_a`, avatar: imageDataUrl });
    const personaB = await personaStore.create({ name: `${prefix}_persona_b`, avatar: `${imageDataUrl}#b` });
    fixturePersonas.push(personaA.id, personaB.id);
    await personaStore.setActive(personaA.id);
    const pinnedAvatar = await registry.executeTool('persona.set_avatar', {
      preparedImageId: avatarPreparedId,
    }, {
      ...allowContext,
      requestToolConfirmation: async () => {
        await personaStore.setActive(personaB.id);
        return { decision: 'allow' };
      },
    });
    const personaAAfterPin = personaStore.get(personaA.id);
    const personaBAfterPin = personaStore.get(personaB.id);
    report.cases.avatar_target_pin = {
      status: pinnedAvatar?.status,
      result: pinnedAvatar?.result,
      personaAChanged: personaAAfterPin?.avatar !== imageDataUrl,
      personaBPreserved: personaBAfterPin?.avatar === `${imageDataUrl}#b`,
      activePersonaId: personaStore.getActive?.()?.id || '',
      guarded: pinnedAvatar?.result?.ok === true
        && pinnedAvatar?.result?.target?.id === personaA.id
        && personaAAfterPin?.avatar !== imageDataUrl
        && personaBAfterPin?.avatar === `${imageDataUrl}#b`,
    };

    await personaStore.update(personaA.id, { avatar: `${imageDataUrl}#baseline` });
    const avatarConflict = await registry.executeTool('persona.set_avatar', {
      target: personaA.id,
      preparedImageId: avatarPreparedId,
    }, {
      ...allowContext,
      requestToolConfirmation: async () => {
        await personaStore.update(personaA.id, { avatar: `${imageDataUrl}#user` });
        return { decision: 'allow' };
      },
    });
    report.cases.avatar_user_replacement = {
      status: avatarConflict?.status,
      reason: avatarConflict?.result?.reason,
      userAvatarPreserved: personaStore.get(personaA.id)?.avatar === `${imageDataUrl}#user`,
      guarded: avatarConflict?.result?.ok === false
        && avatarConflict?.result?.reason === 'avatar_changed_during_operation'
        && personaStore.get(personaA.id)?.avatar === `${imageDataUrl}#user`,
    };

    await createSession(roomA);
    await createSession(roomB);
    contactsStore.upsertContact({ id: roomA, avatar: imageDataUrl, description: 'baseline-description' });
    const contactPatch = await registry.executeTool('contact.set_avatar', {
      target: roomA,
      preparedImageId: avatarPreparedId,
    }, {
      ...allowContext,
      requestToolConfirmation: () => {
        contactsStore.upsertContact({ id: roomA, description: 'user-description' });
        return { decision: 'allow' };
      },
    });
    const contactAfter = contactsStore.getContact(roomA);
    report.cases.contact_non_overlapping_patch = {
      status: contactPatch?.status,
      result: contactPatch?.result,
      description: contactAfter?.description || '',
      avatarChanged: contactAfter?.avatar !== imageDataUrl,
      guarded: contactPatch?.result?.ok === true
        && contactAfter?.description === 'user-description'
        && contactAfter?.avatar !== imageDataUrl,
    };

    chatStore.setSessionSettings(roomA, {
      ...(chatStore.getSessionSettings(roomA) || {}),
      wallpaper: { url: `${imageDataUrl}#old-a`, updatedAt: 1 },
    });
    chatStore.setSessionSettings(roomB, {
      ...(chatStore.getSessionSettings(roomB) || {}),
      wallpaper: { url: `${imageDataUrl}#old-b`, updatedAt: 1 },
    });
    setCurrentSession(roomA);
    const pinnedWallpaper = await registry.executeTool('session.set_wallpaper', {
      preparedImageId: wallpaperPreparedId,
    }, {
      ...allowContext,
      requestToolConfirmation: () => {
        setCurrentSession(roomB);
        return { decision: 'allow' };
      },
    });
    const wallpaperA = chatStore.getSessionSettings(roomA)?.wallpaper || null;
    const wallpaperB = chatStore.getSessionSettings(roomB)?.wallpaper || null;
    const persistedWallpaperPath = String(pinnedWallpaper?.result?.wallpaper?.path || '').trim();
    if (persistedWallpaperPath) {
      fixtureWallpaperFiles.push({ sessionId: roomA, path: persistedWallpaperPath });
    }
    report.cases.wallpaper_target_pin = {
      status: pinnedWallpaper?.status,
      result: pinnedWallpaper?.result,
      roomAPersisted: Boolean(wallpaperA?.path),
      roomBPreserved: wallpaperB?.url === `${imageDataUrl}#old-b`,
      currentSessionId: chatStore.getCurrent?.() || '',
      guarded: pinnedWallpaper?.result?.ok === true
        && pinnedWallpaper?.result?.sessionId === roomA
        && Boolean(wallpaperA?.path)
        && wallpaperB?.url === `${imageDataUrl}#old-b`,
    };

    chatStore.setSessionSettings(roomA, {
      ...(chatStore.getSessionSettings(roomA) || {}),
      wallpaper: { url: `${imageDataUrl}#baseline-wallpaper`, updatedAt: 2 },
    });
    const wallpaperConflict = await registry.executeTool('session.set_wallpaper', {
      target: roomA,
      preparedImageId: wallpaperPreparedId,
    }, {
      ...allowContext,
      requestToolConfirmation: () => {
        chatStore.setSessionSettings(roomA, {
          ...(chatStore.getSessionSettings(roomA) || {}),
          wallpaper: { url: `${imageDataUrl}#user-wallpaper`, updatedAt: 3 },
        });
        return { decision: 'allow' };
      },
    });
    report.cases.wallpaper_user_replacement = {
      status: wallpaperConflict?.status,
      reason: wallpaperConflict?.result?.reason,
      userWallpaperPreserved: chatStore.getSessionSettings(roomA)?.wallpaper?.url === `${imageDataUrl}#user-wallpaper`,
      guarded: wallpaperConflict?.result?.ok === false
        && wallpaperConflict?.result?.reason === 'wallpaper_changed_during_operation'
        && chatStore.getSessionSettings(roomA)?.wallpaper?.url === `${imageDataUrl}#user-wallpaper`,
    };
  } finally {
    try {
      if (originalPersonaId && personaStore.get(originalPersonaId)) {
        await personaStore.setActive(originalPersonaId);
      }
    } catch {}
    try { setCurrentSession(originalSessionId); } catch {}
    const wallpaperCleanupResults = [];
    for (const file of fixtureWallpaperFiles) {
      let error = '';
      try {
        await safeInvoke('delete_wallpaper', file);
      } catch (cause) {
        error = String(cause?.message || cause);
      }
      let exists = null;
      try {
        exists = await safeInvoke('wallpaper_path_exists', { path: file.path });
      } catch {}
      wallpaperCleanupResults.push({ ...file, deleted: exists === false, error });
    }
    const remainingSessions = [];
    for (const sessionId of fixtureSessions) {
      try {
        if (hasSession(sessionId)) await sessionPanel.removeCore(sessionId);
      } catch {}
      if (hasSession(sessionId)) remainingSessions.push(sessionId);
    }
    const remainingPersonas = [];
    for (const personaId of fixturePersonas) {
      try {
        if (personaStore.get(personaId)) await personaStore.delete(personaId);
      } catch {}
      if (personaStore.get(personaId)) remainingPersonas.push(personaId);
    }
    report.cleanup = {
      deleted: remainingSessions.length === 0
        && remainingPersonas.length === 0
        && wallpaperCleanupResults.every(item => item.deleted),
      remainingSessions,
      remainingPersonas,
      wallpaperFiles: wallpaperCleanupResults,
      restoredPersonaId: String(personaStore.getActive?.()?.id || '').trim(),
      restoredSessionId: String(chatStore.getCurrent?.() || '').trim(),
    };
  }

  report.summary = {
    avatarTargetPin: report.cases.avatar_target_pin?.guarded === true,
    avatarRevisionGuard: report.cases.avatar_user_replacement?.guarded === true,
    contactPatchGuard: report.cases.contact_non_overlapping_patch?.guarded === true,
    wallpaperTargetPin: report.cases.wallpaper_target_pin?.guarded === true,
    wallpaperRevisionGuard: report.cases.wallpaper_user_replacement?.guarded === true,
    cleanupPass: report.cleanup?.deleted === true,
  };
  report.summary.guardReady = Object.values(report.summary).every(value => value === true);
  return report;
})()
