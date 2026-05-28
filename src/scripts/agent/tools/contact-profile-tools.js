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
      description: 'Create or update a contact profile in the current scope.',
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
      schema: {
        type: 'object',
        required: ['profile'],
        additionalProperties: false,
        properties: {
          profile: { type: 'object' },
        },
      },
      execute: async (args = {}) => {
        const store = resolveStore();
        if (!store || typeof store.upsertProfile !== 'function') {
          throw new Error('contact profile store not available');
        }
        const profile = isPlainObject(args.profile) ? args.profile : {};
        const saved = store.upsertProfile(profile);
        return {
          saved: Boolean(saved),
          contactId: trim(saved?.contactId || profile.contactId || profile.id),
          profile: clone(saved) || null,
        };
      },
      summarizeResult: result => (result?.saved
        ? `contact profile saved for ${trim(result.contactId)}`
        : 'contact profile save skipped'),
    },
  ];
};

export const registerContactProfileAgentTools = (registry, deps = {}) => {
  const tools = createContactProfileAgentTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
