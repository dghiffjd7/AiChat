const trim = (value, fallback = '') => String(value ?? '').trim() || fallback;

export const normalizeOllamaBaseUrl = (value = '') => trim(
  value,
  'http://127.0.0.1:11434/v1',
).replace(/\/+$/u, '').toLowerCase();

const modelKeyOf = ({ baseUrl = '', model = '' } = {}) => (
  `${normalizeOllamaBaseUrl(baseUrl)}\u0000${trim(model).toLowerCase()}`
);

export const buildOllamaCapabilityIdentity = ({
  baseUrl = '',
  version = '',
  model = '',
  digest = '',
} = {}) => [
  normalizeOllamaBaseUrl(baseUrl),
  trim(version).toLowerCase(),
  trim(model).toLowerCase(),
  trim(digest).toLowerCase(),
].join('\u0000');

const records = new Map();

const normalizeCapabilities = value => [...new Set(
  (Array.isArray(value) ? value : [])
    .map(item => trim(item).toLowerCase())
    .filter(Boolean),
)];

const cloneRecord = record => ({
  ...record,
  capabilities: [...record.capabilities],
});

export const recordOllamaModelCapabilities = ({
  baseUrl = '',
  version = '',
  model = '',
  digest = '',
  capabilities = [],
  modelPresent = true,
} = {}) => {
  const id = trim(model);
  const serviceVersion = trim(version);
  if (!id || !serviceVersion) return null;
  const normalizedCapabilities = normalizeCapabilities(capabilities);
  const record = Object.freeze({
    known: true,
    id,
    serviceVersion,
    digest: trim(digest),
    modelPresent: modelPresent === true,
    capabilities: Object.freeze(normalizedCapabilities),
    supportsTools: modelPresent === true && normalizedCapabilities.includes('tools'),
    capabilityIdentity: buildOllamaCapabilityIdentity({
      baseUrl,
      version: serviceVersion,
      model: id,
      digest,
    }),
  });
  records.set(modelKeyOf({ baseUrl, model: id }), record);
  return cloneRecord(record);
};

export const readOllamaModelCapabilities = ({ baseUrl = '', model = '' } = {}) => {
  const record = records.get(modelKeyOf({ baseUrl, model }));
  return record
    ? cloneRecord(record)
    : {
        known: false,
        id: trim(model),
        serviceVersion: '',
        digest: '',
        modelPresent: false,
        capabilities: [],
        supportsTools: false,
        capabilityIdentity: '',
      };
};

export const invalidateOllamaModelCapabilities = ({ baseUrl = '', model = '' } = {}) => {
  records.delete(modelKeyOf({ baseUrl, model }));
};

export const clearOllamaModelCapabilitiesForTests = () => records.clear();
