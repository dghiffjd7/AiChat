import { compileProviderSafeUnionFreeSchema } from './gemini-provider-safe-schema.js';

const TYPE_MAP = Object.freeze({
  OBJECT: 'object',
  STRING: 'string',
  INTEGER: 'integer',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
});

const lowerSchemaTypes = (value) => {
  if (Array.isArray(value)) return value.map(lowerSchemaTypes);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  Object.entries(value).forEach(([key, child]) => {
    out[key] = key === 'type' && typeof child === 'string'
      ? (TYPE_MAP[child] || child.toLowerCase())
      : lowerSchemaTypes(child);
  });
  return out;
};

export const compileOpenRouterProviderSafeSchema = (schema = {}, {
  geminiUpstream = false,
} = {}) => (
  lowerSchemaTypes(compileProviderSafeUnionFreeSchema(schema, {
    preserveAdditionalProperties: !geminiUpstream,
    preserveBounds: !geminiUpstream,
    preserveNonStringEnums: !geminiUpstream,
  }))
);
