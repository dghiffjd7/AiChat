const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const GEMINI_SCHEMA_TYPES = Object.freeze({
  object: 'OBJECT',
  string: 'STRING',
  integer: 'INTEGER',
  number: 'NUMBER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
});

const clone = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const uniqueJsonValues = (values = []) => {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    let signature = '';
    try {
      signature = JSON.stringify(value);
    } catch {
      return;
    }
    if (seen.has(signature)) return;
    seen.add(signature);
    out.push(clone(value, value));
  });
  return out;
};

const inferConstType = (value) => {
  if (typeof value === 'string') return GEMINI_SCHEMA_TYPES.string;
  if (typeof value === 'boolean') return GEMINI_SCHEMA_TYPES.boolean;
  if (Number.isInteger(value)) return GEMINI_SCHEMA_TYPES.integer;
  if (typeof value === 'number' && Number.isFinite(value)) return GEMINI_SCHEMA_TYPES.number;
  return '';
};

const mergeDescriptions = (schemas = []) => {
  const descriptions = schemas
    .map(schema => String(schema?.description || '').trim())
    .filter(Boolean);
  return descriptions.length === 1 ? descriptions[0] : '';
};

const mergeCompiledSchemas = (schemas = [], options = {}) => {
  const source = schemas.filter(isPlainObject);
  if (!source.length) return {};
  if (source.length === 1) return clone(source[0], {});

  const types = [...new Set(source.map(schema => schema.type).filter(Boolean))];
  const type = types.length === 1 ? types[0] : '';
  const out = {};
  if (type) out.type = type;

  const description = mergeDescriptions(source);
  if (description) out.description = description;
  if (source.every(schema => schema.nullable === true)) out.nullable = true;
  if (options.preserveAdditionalProperties && source.every(schema => schema.additionalProperties === false)) {
    out.additionalProperties = false;
  }

  if (options.preserveBounds) {
    ['minItems', 'maxItems'].forEach((key) => {
      const values = source.map(schema => schema[key]).filter(value => Number.isFinite(Number(value)));
      if (values.length === source.length && new Set(values.map(Number)).size === 1) out[key] = Number(values[0]);
    });
  }

  const enums = source.map(schema => Array.isArray(schema.enum) ? schema.enum : null);
  if (enums.every(Boolean)) out.enum = uniqueJsonValues(enums.flat());

  if (type === GEMINI_SCHEMA_TYPES.object) {
    const propertyNames = [...new Set(source.flatMap(schema => Object.keys(schema.properties || {})))];
    if (propertyNames.length) {
      out.properties = {};
      propertyNames.forEach((name) => {
        const variants = source
          .map(schema => schema.properties?.[name])
          .filter(isPlainObject);
        out.properties[name] = mergeCompiledSchemas(variants, options);
      });
      const commonRequired = source.reduce((common, schema, index) => {
        const required = new Set(Array.isArray(schema.required) ? schema.required : []);
        return index === 0
          ? required
          : new Set([...common].filter(name => required.has(name)));
      }, new Set());
      const required = [...commonRequired].filter(name => Object.hasOwn(out.properties, name));
      if (required.length) out.required = required;
    }
  } else if (type === GEMINI_SCHEMA_TYPES.array) {
    const items = source.map(schema => schema.items).filter(isPlainObject);
    if (items.length) out.items = mergeCompiledSchemas(items, options);
  }

  return out;
};

const compileNode = (value, options = {}) => {
  if (!isPlainObject(value)) return {};
  const union = Array.isArray(value.oneOf)
    ? value.oneOf
    : (Array.isArray(value.anyOf) ? value.anyOf : null);
  if (union?.length) return mergeCompiledSchemas(
    union.map(item => compileNode(item, options)),
    options,
  );

  const out = {};
  const rawType = String(value.type || '').trim().toLowerCase();
  const hasConst = Object.hasOwn(value, 'const');
  const type = GEMINI_SCHEMA_TYPES[rawType] || (hasConst ? inferConstType(value.const) : '');
  if (type) out.type = type;
  if (hasConst && (typeof value.const === 'string' || options.preserveNonStringEnums)) {
    out.enum = [clone(value.const, value.const)];
  }
  else if (
    Array.isArray(value.enum)
    && value.enum.length
    && (options.preserveNonStringEnums || value.enum.every(item => typeof item === 'string'))
  ) {
    out.enum = uniqueJsonValues(value.enum);
  }

  const description = String(value.description || '').trim();
  if (description) out.description = description;
  if (value.nullable === true) out.nullable = true;
  if (typeof value.format === 'string' && value.format.trim()) out.format = value.format.trim();
  if (options.preserveAdditionalProperties && value.additionalProperties === false) {
    out.additionalProperties = false;
  }
  if (options.preserveBounds) {
    ['minItems', 'maxItems'].forEach((key) => {
      if (Number.isFinite(Number(value[key]))) out[key] = Number(value[key]);
    });
  }

  if (isPlainObject(value.properties)) {
    out.type = out.type || GEMINI_SCHEMA_TYPES.object;
    out.properties = {};
    Object.entries(value.properties).forEach(([name, schema]) => {
      out.properties[name] = compileNode(schema, options);
    });
    const required = (Array.isArray(value.required) ? value.required : [])
      .filter(name => Object.hasOwn(out.properties, name));
    if (required.length) out.required = [...new Set(required)];
  }
  if (isPlainObject(value.items)) {
    out.type = out.type || GEMINI_SCHEMA_TYPES.array;
    out.items = compileNode(value.items, options);
  }
  return out;
};

export const compileProviderSafeUnionFreeSchema = (schema = {}, options = {}) => (
  compileNode(schema, options)
);

export const compileGeminiProviderSafeSchema = (schema = {}) => (
  compileProviderSafeUnionFreeSchema(schema)
);

export const isGeminiPhoneTerminalTool = (name = '') => [
  'emit_private_reply',
  'emit_phone_batch',
].includes(String(name || '').trim());
