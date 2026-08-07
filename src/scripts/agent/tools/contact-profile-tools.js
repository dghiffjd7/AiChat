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

export const createContactProfileAgentTools = ({
  contactProfileStore = null,
} = {}) => {
  const resolveStore = () => {
    if (!contactProfileStore || typeof contactProfileStore !== 'object') return null;
    return contactProfileStore;
  };
  const upsertPlans = new WeakMap();
  const captureUpsertPlan = (args = {}) => {
    const store = resolveStore();
    const profile = clone(isPlainObject(args.profile) ? args.profile : {});
    const contactId = trim(
      profile.contactId || profile.contact_id || profile.sessionId || profile.id ||
      profile.displayName || profile.name || profile.label,
    );
    const snapshot = typeof store?.getProfileSnapshot === 'function'
      ? store.getProfileSnapshot(contactId)
      : {
        contactId,
        scopeId: trim(store?.scopeId),
        scopeToken: Number(store?.scopeToken || 0),
        exists: Boolean(store?.getProfile?.(contactId)),
        revision: null,
        profile: clone(store?.getProfile?.(contactId)) || null,
      };
    return { store, profile, contactId, snapshot };
  };

  return [
    {
      name: 'contact_profile.read',
      title: 'Read contact profile',
      description: 'Read a stored contact profile by contact id.',
      source: 'contact-profile-store',
      permissions: ['storage'],
      riskLevel: 'low',
      capabilities: {
        read: true,
        write: false,
        network: false,
        cost: 'none',
        undo: 'none',
        modelContext: 'none',
        confirmation: 'allow_once',
      },
      schema: {
        type: 'object',
        required: ['contactId'],
        additionalProperties: false,
        properties: {
          contactId: { type: 'string', minLength: 1 },
        },
      },
      execute: async (args = {}) => {
        const store = resolveStore();
        if (!store || typeof store.getProfile !== 'function') {
          throw new Error('contact profile store not available');
        }
        const contactId = trim(args.contactId);
        const profile = store.getProfile(contactId);
        return {
          contactId,
          found: Boolean(profile),
          profile: clone(profile) || null,
        };
      },
      summarizeResult: result => (result?.found
        ? `contact profile loaded for ${trim(result.contactId)}`
        : `contact profile missing for ${trim(result?.contactId)}`),
    },
    {
      name: 'contact_profile.get',
      title: 'Get contact profile',
      description: 'Get a stored contact profile by contact id for provider tool calls.',
      source: 'contact-profile-store',
      permissions: ['storage'],
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
        required: ['contactId'],
        additionalProperties: false,
        properties: {
          contactId: { type: 'string', minLength: 1 },
        },
      },
      execute: async (args = {}) => {
        const store = resolveStore();
        if (!store || typeof store.getProfile !== 'function') {
          throw new Error('contact profile store not available');
        }
        const contactId = trim(args.contactId);
        const profile = store.getProfile(contactId);
        return {
          contactId,
          found: Boolean(profile),
          profile: clone(profile) || null,
        };
      },
      summarizeResult: result => (result?.found
        ? `contact profile loaded for ${trim(result.contactId)}`
        : `contact profile missing for ${trim(result?.contactId)}`),
    },
    {
      name: 'contact_profile.list',
      title: 'List contact profiles',
      description: 'List stored contact profiles in the current scope.',
      source: 'contact-profile-store',
      permissions: ['storage'],
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
      outputLimit: 1200,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: { type: 'integer', minimum: 0, maximum: 1000 },
        },
      },
      execute: async (args = {}) => {
        const store = resolveStore();
        if (!store || typeof store.listProfiles !== 'function') {
          throw new Error('contact profile store not available');
        }
        const limit = Number.isFinite(Number(args.limit)) ? Math.max(0, Math.trunc(Number(args.limit))) : 0;
        const profiles = store.listProfiles();
        const list = Array.isArray(profiles) ? profiles.map(clone) : [];
        return {
          count: list.length,
          profiles: limit > 0 ? list.slice(0, limit) : list,
        };
      },
      summarizeResult: result => `contact profiles listed: ${Number(result?.count || 0)}`,
    },
    {
      name: 'contact_profile.upsert',
      title: 'Upsert contact profile',
      description: 'Create or update a contact profile in the pinned scope when its baseline is still current.',
      source: 'contact-profile-store',
      permissions: ['storage'],
      riskLevel: 'medium',
      capabilities: {
        read: false,
        write: true,
        network: false,
        cost: 'none',
        undo: 'manual',
        modelContext: 'none',
        confirmation: 'required',
      },
      safety: {
        operationType: 'upsert_contact_profile',
        destructive: 'conditional',
        description: 'Replaces one complete contact profile only when its confirmed scope and revision are unchanged.',
        preflight: async (args = {}) => {
          const plan = captureUpsertPlan(args);
          upsertPlans.set(args, plan);
          if (!plan.contactId) return { destructive: false };
          return {
            requiresConfirmation: true,
            kind: 'contact_profile.upsert',
            operationType: 'upsert_contact_profile',
            title: plan.snapshot?.exists ? '确认更新联系人画像' : '确认创建联系人画像',
            message: plan.snapshot?.exists
              ? `将替换联系人「${plan.contactId}」的完整画像；确认期间若画像变化，本次写入会被拒绝。`
              : `将为联系人「${plan.contactId}」创建画像；确认期间若已有画像出现，本次写入会被拒绝。`,
            confirmText: '确认保存',
            cancelText: '取消',
            danger: plan.snapshot?.exists === true,
            allowAlways: false,
            argsPreview: {
              contactId: plan.contactId,
              scopeId: trim(plan.snapshot?.scopeId),
              exists: plan.snapshot?.exists === true,
              revision: plan.snapshot?.revision,
            },
            onDeny: {
              action: 'skip',
              reason: 'contact_profile_upsert_cancelled',
              result: {
                ok: false,
                saved: false,
                skipped: true,
                reason: 'contact_profile_upsert_cancelled',
                contactId: plan.contactId,
              },
            },
          };
        },
      },
      schema: {
        type: 'object',
        required: ['profile'],
        additionalProperties: false,
        properties: {
          profile: { type: 'object' },
        },
      },
      execute: async (args = {}) => {
        const plan = upsertPlans.get(args) || captureUpsertPlan(args);
        upsertPlans.delete(args);
        const store = plan.store || resolveStore();
        if (!store || typeof store.upsertProfile !== 'function') {
          throw new Error('contact profile store not available');
        }
        const profile = plan.profile;
        if (!plan.contactId) {
          return {
            ok: false,
            saved: false,
            conflict: false,
            reason: 'missing_contact_id',
            contactId: '',
            profile: null,
          };
        }
        const mutation = typeof store.upsertProfileIfUnchanged === 'function'
          ? store.upsertProfileIfUnchanged(profile, plan.snapshot)
          : { ok: true, saved: true, profile: store.upsertProfile(profile) };
        if (!mutation?.ok || !mutation?.saved) {
          return {
            ok: false,
            saved: false,
            conflict: mutation?.conflict === true,
            reason: trim(mutation?.reason, 'profile_save_failed'),
            contactId: plan.contactId,
            profile: null,
            latestProfile: clone(mutation?.latestSnapshot?.profile) || null,
          };
        }
        const saved = mutation.profile;
        return {
          ok: true,
          saved: Boolean(saved),
          conflict: false,
          reason: '',
          contactId: trim(saved?.contactId || plan.contactId),
          profile: clone(saved) || null,
        };
      },
      summarizeResult: result => (result?.saved
        ? `contact profile saved for ${trim(result.contactId)}`
        : `contact profile save skipped: ${trim(result?.reason, 'unknown')}`),
    },
  ];
};

export const registerContactProfileAgentTools = (registry, deps = {}) => {
  const tools = createContactProfileAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
