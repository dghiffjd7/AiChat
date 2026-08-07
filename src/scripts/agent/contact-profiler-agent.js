import {
  extractWeakTriggerTerms,
  normalizeContactProfile,
  normalizeContactProfileSettings,
} from '../memory/contact-profile-utils.js';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const uniqueStrings = (items = []) => {
  const seen = new Set();
  const out = [];
  (Array.isArray(items) ? items : [items]).forEach((item) => {
    const text = trim(item);
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
};

const normalizePositiveInteger = (value, fallback, min = 1, max = 1000) => {
  const raw = Math.trunc(Number(value));
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
};

const resolveTimestamp = (now = Date.now) => {
  try {
    const value = typeof now === 'function' ? now() : Date.now();
    return Number.isFinite(Number(value)) ? Number(value) : Date.now();
  } catch {
    return Date.now();
  }
};

const clampText = (value = '', maxLength = 4000) => {
  const text = trim(value);
  const limit = Math.max(0, Number(maxLength) || 0);
  if (!limit || text.length <= limit) return text;
  return text.slice(0, limit).trim();
};

const getMessageText = (message = {}) => {
  if (!message || typeof message !== 'object') return '';
  const fields = [
    message.content,
    message.text,
    message.rawText,
    message.displayText,
    message.message,
  ];
  for (const field of fields) {
    if (typeof field !== 'string') continue;
    const text = trim(field);
    if (text) return text;
  }
  return '';
};

const getMessageSpeaker = (message = {}) => (
  trim(message.speakerName || message.name || message.senderName || message.role)
);

const buildMessageSourceRef = (message = {}) => {
  const id = trim(message.id || message.messageId);
  return id ? `message:${id}` : '';
};

const normalizeMessages = (messages = [], { limit = 20, maxRawChars = 8000 } = {}) => {
  const count = normalizePositiveInteger(limit, 20, 1, 200);
  const maxChars = normalizePositiveInteger(maxRawChars, 8000, 500, 120000);
  const source = Array.isArray(messages) ? messages : [];
  let usedChars = 0;
  const out = [];
  source.slice(-count).reverse().forEach((message) => {
    const text = getMessageText(message);
    if (!text) return;
    const remaining = maxChars - usedChars;
    if (remaining <= 0) return;
    const clipped = clampText(text, remaining);
    usedChars += clipped.length;
    out.push({
      id: trim(message?.id || message?.messageId),
      role: trim(message?.role || message?.type),
      speaker: getMessageSpeaker(message),
      text: clipped,
      sourceRef: buildMessageSourceRef(message),
      createdAt: Number.isFinite(Number(message?.createdAt || message?.time))
        ? Number(message.createdAt || message.time)
        : 0,
    });
  });
  return out.reverse();
};

const collectTerms = (messages = []) => {
  const terms = [];
  messages.forEach((message) => {
    terms.push(...extractWeakTriggerTerms(message.text));
  });
  return uniqueStrings(terms)
    .filter(term => term.length >= 2 && term.length <= 32)
    .slice(0, 32);
};

const buildRawSnippet = (messages = [], maxLength = 12000) => {
  const lines = messages.map((message) => {
    const speaker = message.speaker ? `${message.speaker}: ` : '';
    return `${speaker}${message.text}`.trim();
  });
  return clampText(lines.join('\n'), maxLength);
};

export const buildDefaultContactProfileCandidate = ({
  contactId = '',
  contact = null,
  existingProfile = null,
  messages = [],
  scopeId = '',
  now = Date.now,
} = {}) => {
  const id = trim(contactId || existingProfile?.contactId || contact?.id);
  if (!id) return null;
  const timestamp = resolveTimestamp(now);
  const terms = collectTerms(messages);
  const displayName = trim(
    contact?.name ||
    contact?.displayName ||
    contact?.remark ||
    existingProfile?.displayName ||
    id,
    id,
  );
  const sourceRefs = uniqueStrings([
    ...(existingProfile?.sourceRefs || []),
    ...messages.map(message => message.sourceRef).filter(Boolean),
  ]).slice(-40);
  return normalizeContactProfile({
    ...(isPlainObject(existingProfile) ? existingProfile : {}),
    contactId: id,
    scopeId: scopeId || existingProfile?.scopeId || '',
    displayName,
    aliases: uniqueStrings([
      ...(existingProfile?.aliases || []),
      contact?.alias,
      contact?.nickname,
      contact?.remark,
    ]),
    interaction_focus: uniqueStrings([
      ...(existingProfile?.interaction_focus || []),
      ...terms.slice(0, 8),
    ]).slice(0, 30),
    trigger_keywords: uniqueStrings([
      ...(existingProfile?.trigger_keywords || []),
      ...terms.slice(0, 16),
    ]).slice(0, 60),
    updatedAt: timestamp,
    version: normalizePositiveInteger(existingProfile?.version, 0, 0, 1_000_000) + 1,
    sourceRefs,
  });
};

export const createContactProfilerAgent = ({
  agentTaskRuntime = null,
  contactProfileStore = null,
  getContact = () => null,
  getMessages = () => [],
  getCurrentSessionId = () => '',
  buildProfileCandidate = buildDefaultContactProfileCandidate,
  logger = console,
  now = Date.now,
} = {}) => {
  const resolveStore = () => (
    contactProfileStore && typeof contactProfileStore === 'object'
      ? contactProfileStore
      : null
  );

  const resolveSettings = () => {
    const store = resolveStore();
    try {
      return normalizeContactProfileSettings(store?.getSettings?.() || {});
    } catch {
      return normalizeContactProfileSettings();
    }
  };

  const captureScopeSnapshot = (store) => {
    if (typeof store?.getScopeSnapshot === 'function') return store.getScopeSnapshot();
    return {
      scopeId: trim(store?.scopeId),
      scopeToken: Number.isFinite(Number(store?.scopeToken)) ? Number(store.scopeToken) : null,
    };
  };

  const isScopeSnapshotCurrent = (store, snapshot = {}) => {
    const current = captureScopeSnapshot(store);
    if (trim(current.scopeId) !== trim(snapshot.scopeId)) return false;
    if (snapshot.scopeToken === null || snapshot.scopeToken === undefined) return true;
    return Number(current.scopeToken) === Number(snapshot.scopeToken);
  };

  const captureProfileSnapshot = (store, contactId = '') => {
    if (typeof store?.getProfileSnapshot === 'function') return store.getProfileSnapshot(contactId);
    const profile = store?.getProfile?.(contactId) || null;
    const scope = captureScopeSnapshot(store);
    return {
      contactId,
      ...scope,
      exists: Boolean(profile),
      revision: null,
      profile,
    };
  };

  const runProfileUpdate = (request = {}) => {
    const src = isPlainObject(request) ? request : {};
    const store = resolveStore();
    const settings = resolveSettings();
    const scopeSnapshot = captureScopeSnapshot(store);
    const sessionId = trim(src.sessionId || getCurrentSessionId?.());
    const contactId = trim(src.contactId || settings.backgroundUpdateProfileId || sessionId);
    const force = src.force === true;
    const reason = trim(src.reason || src.trigger, force ? 'manual' : 'background');
    if (!store) {
      return Promise.resolve({
        status: 'skipped',
        skipped: true,
        reason: 'store_unavailable',
        contactId,
      });
    }
    if (!contactId) {
      return Promise.resolve({
        status: 'skipped',
        skipped: true,
        reason: 'missing_contact',
      });
    }
    if (!force && settings.backgroundUpdateEnabled !== true) {
      return Promise.resolve({
        status: 'skipped',
        skipped: true,
        reason: 'disabled',
        contactId,
      });
    }
    if (!agentTaskRuntime || typeof agentTaskRuntime.enqueue !== 'function') {
      return Promise.reject(new Error('agent task runtime not configured'));
    }

    const targetSessionId = sessionId || contactId;
    const messageLimit = normalizePositiveInteger(src.messageLimit, 20, 1, 200);
    const maxRawChars = normalizePositiveInteger(settings.backgroundMaxTokens * 2, 2400, 500, 120000);
    const coalesceKey = `contact_profile:${trim(scopeSnapshot.scopeId)}:${contactId}`;
    return agentTaskRuntime.enqueue({
      kind: 'contact_profile_update',
      title: 'Contact profile update',
      sessionId: targetSessionId,
      source: 'contact-profiler-agent',
      trigger: reason,
      summary: `contact profile update: ${contactId}`,
      metadata: {
        contactId,
        scopeId: trim(scopeSnapshot.scopeId),
        force,
      },
      coalesceKey,
      retry: { maxAttempts: normalizePositiveInteger(src.maxAttempts, 2, 1, 3) },
    }, async ({ runId, startStep, finishStep, attempt }) => {
      if (store.ready && typeof store.ready.then === 'function') {
        try {
          await store.ready;
        } catch (err) {
          logger?.debug?.('contact profile store ready skipped', err);
        }
      }
      if (!isScopeSnapshotCurrent(store, scopeSnapshot)) {
        return {
          runId,
          status: 'conflict',
          saved: false,
          conflict: true,
          reason: 'target_scope_changed',
          contactId,
        };
      }
      const contextStep = startStep({
        type: 'contact_profile.collect_context',
        summary: 'collect contact profile context',
        input: { contactId, sessionId: targetSessionId, messageLimit },
        metadata: { attempt },
      });
      const contact = await getContact(contactId, { sessionId: targetSessionId });
      const rawMessages = await getMessages(targetSessionId, { contactId });
      const messages = normalizeMessages(rawMessages, { limit: messageLimit, maxRawChars });
      if (!isScopeSnapshotCurrent(store, scopeSnapshot)) {
        finishStep(contextStep.id, {
          status: 'skipped',
          output: { contactId, reason: 'target_scope_changed' },
        });
        return {
          runId,
          status: 'conflict',
          saved: false,
          conflict: true,
          reason: 'target_scope_changed',
          contactId,
        };
      }
      const profileSnapshot = captureProfileSnapshot(store, contactId);
      const existingProfile = profileSnapshot.profile || null;
      finishStep(contextStep.id, {
        status: 'succeeded',
        output: {
          contactId,
          contactName: trim(contact?.name || contact?.displayName || existingProfile?.displayName),
          hasExistingProfile: Boolean(existingProfile),
          messageCount: messages.length,
        },
      });

      const prepareStep = startStep({
        type: 'contact_profile.prepare_update',
        summary: 'prepare contact profile candidate',
        metadata: { attempt },
      });
      const candidate = normalizeContactProfile(await buildProfileCandidate({
        contactId,
        contact,
        existingProfile,
        messages,
        scopeId: scopeSnapshot.scopeId || '',
        settings,
        now,
      }));
      if (!candidate) throw new Error('contact profile candidate is empty');
      finishStep(prepareStep.id, {
        status: 'succeeded',
        output: {
          contactId: candidate.contactId,
          interactionFocusCount: candidate.interaction_focus.length,
          sourceRefCount: candidate.sourceRefs.length,
        },
      });

      const saveStep = startStep({
        type: 'contact_profile.persist_update',
        summary: 'persist contact profile update',
        metadata: { attempt },
      });
      const shouldAutoSave = settings.backgroundAutoSave === true && settings.backgroundRequireConfirm === false;
      if (shouldAutoSave) {
        const mutation = typeof store.upsertProfileIfUnchanged === 'function'
          ? await store.upsertProfileIfUnchanged(candidate, profileSnapshot)
          : (!isScopeSnapshotCurrent(store, scopeSnapshot)
            ? { ok: false, saved: false, conflict: true, reason: 'target_scope_changed' }
            : { ok: true, saved: true, profile: await store.upsertProfile?.(candidate) });
        const saved = mutation?.profile || null;
        finishStep(saveStep.id, {
          status: mutation?.ok && saved ? 'succeeded' : 'skipped',
          output: {
            contactId,
            mode: 'autosave',
            saved: Boolean(saved),
            reason: trim(mutation?.reason),
          },
        });
        if (!mutation?.ok || !saved) {
          return {
            runId,
            status: mutation?.conflict ? 'conflict' : 'skipped',
            saved: false,
            conflict: mutation?.conflict === true,
            reason: trim(mutation?.reason, 'profile_save_failed'),
            contactId,
          };
        }
        return {
          runId,
          status: 'saved',
          contactId,
          profile: clone(saved),
        };
      }
      const pendingPayload = {
        contactId,
        status: 'pending',
        reason,
        profile: candidate,
        scopeId: profileSnapshot.scopeId,
        baseRevision: profileSnapshot.revision,
        baseExists: profileSnapshot.exists,
        raw: buildRawSnippet(messages, maxRawChars),
        createdAt: resolveTimestamp(now),
        updatedAt: resolveTimestamp(now),
      };
      const pendingMutation = typeof store.addPendingUpdateIfCurrent === 'function'
        ? await store.addPendingUpdateIfCurrent(pendingPayload, profileSnapshot)
        : (!isScopeSnapshotCurrent(store, scopeSnapshot)
          ? { ok: false, conflict: true, reason: 'target_scope_changed', pending: null }
          : { ok: true, conflict: false, pending: await store.addPendingUpdate?.(pendingPayload) });
      const pending = pendingMutation?.pending || null;
      finishStep(saveStep.id, {
        status: pending ? 'succeeded' : (pendingMutation?.conflict ? 'skipped' : 'failed'),
        output: {
          contactId,
          mode: 'pending_confirmation',
          pendingUpdateId: pending?.id || '',
          reason: trim(pendingMutation?.reason),
        },
      });
      if (!pending) {
        if (pendingMutation?.conflict) {
          return {
            runId,
            status: 'conflict',
            saved: false,
            conflict: true,
            reason: trim(pendingMutation.reason, 'target_scope_changed'),
            contactId,
          };
        }
        throw new Error('contact profile pending update was not saved');
      }
      return {
        runId,
        status: 'pending_confirmation',
        contactId,
        pendingUpdateId: pending.id,
        profile: clone(candidate),
      };
    });
  };

  return {
    runProfileUpdate,
  };
};
