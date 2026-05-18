const COLUMN_TYPES = ['text', 'number', 'select', 'multiline'];
const SCOPE_TYPES = ['global', 'contact', 'group'];
const INJECTION_POSITIONS = [
  'system_end',
  'after_persona',
  'before_chat',
  'history_before',
  'history_after',
  'history_depth',
  'before_latest_user',
  'after_latest_user',
];
const RULE_FIELDS = ['note', 'initNode', 'insertNode', 'updateNode', 'deleteNode'];

export const templateSchema = {
  columnTypes: COLUMN_TYPES,
  scopes: SCOPE_TYPES,
  injectionPositions: INJECTION_POSITIONS,
  ruleFields: RULE_FIELDS,
};

export const validateTemplate = (template) => {
  const errors = [];
  const isPlainObject = (val) => val && typeof val === 'object' && !Array.isArray(val);
  const isStringArray = (val) => Array.isArray(val) && val.every(item => typeof item === 'string');
  const parseInjectionPositions = (value) => {
    if (Array.isArray(value)) {
      return value
        .map(item => String(item || '').trim().toLowerCase())
        .filter(Boolean);
    }
    const text = String(value || '').trim().toLowerCase();
    if (!text) return [];
    return text
      .split(/[+,]/)
      .map(part => part.trim())
      .filter(Boolean);
  };
  if (!template || typeof template !== 'object') {
    return { ok: false, errors: ['template must be an object'] };
  }
  const meta = template.meta;
  if (!meta || typeof meta !== 'object') errors.push('meta is required');
  if (!String(meta?.id || '').trim()) errors.push('meta.id is required');
  if (!String(meta?.name || '').trim()) errors.push('meta.name is required');
  if (!Array.isArray(template.tables)) {
    errors.push('tables must be an array');
  } else {
    template.tables.forEach((table, idx) => {
      const prefix = `tables[${idx}]`;
      if (!table || typeof table !== 'object') {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (!String(table?.id || '').trim()) errors.push(`${prefix}.id is required`);
      if (table.scope && !SCOPE_TYPES.includes(String(table.scope))) {
        errors.push(`${prefix}.scope is invalid`);
      }
      if (!Array.isArray(table.columns)) {
        errors.push(`${prefix}.columns must be an array`);
      } else {
        table.columns.forEach((col, cidx) => {
          const cprefix = `${prefix}.columns[${cidx}]`;
          if (!col || typeof col !== 'object') {
            errors.push(`${cprefix} must be an object`);
            return;
          }
          if (!String(col?.id || '').trim()) errors.push(`${cprefix}.id is required`);
          if (col.type && !COLUMN_TYPES.includes(String(col.type))) {
            errors.push(`${cprefix}.type is invalid`);
          }
        });
      }
      if (table.sourceData != null) {
        if (!isPlainObject(table.sourceData)) {
          errors.push(`${prefix}.sourceData must be an object`);
        } else {
          RULE_FIELDS.forEach((field) => {
            if (field in table.sourceData && typeof table.sourceData[field] !== 'string') {
              errors.push(`${prefix}.sourceData.${field} must be a string`);
            }
          });
        }
      }
      if (table.updateConfig != null) {
        if (!isPlainObject(table.updateConfig)) {
          errors.push(`${prefix}.updateConfig must be an object`);
        } else {
          ['contextDepth', 'updateFrequency', 'batchSize', 'skipFloors'].forEach((key) => {
            const value = table.updateConfig[key];
            if (value != null && !Number.isFinite(Number(value))) {
              errors.push(`${prefix}.updateConfig.${key} must be a number`);
            }
          });
        }
      }
      if (table.exportConfig != null) {
        if (!isPlainObject(table.exportConfig)) {
          errors.push(`${prefix}.exportConfig must be an object`);
        } else {
          const exportConfig = table.exportConfig;
          if (exportConfig.enabled != null && typeof exportConfig.enabled !== 'boolean') {
            errors.push(`${prefix}.exportConfig.enabled must be a boolean`);
          }
          if (exportConfig.splitByRow != null && typeof exportConfig.splitByRow !== 'boolean') {
            errors.push(`${prefix}.exportConfig.splitByRow must be a boolean`);
          }
          if (exportConfig.entryName != null && typeof exportConfig.entryName !== 'string') {
            errors.push(`${prefix}.exportConfig.entryName must be a string`);
          }
          if (exportConfig.keywords != null && typeof exportConfig.keywords !== 'string' && !isStringArray(exportConfig.keywords)) {
            errors.push(`${prefix}.exportConfig.keywords must be a string or string[]`);
          }
          if (exportConfig.injectionTemplate != null && typeof exportConfig.injectionTemplate !== 'string') {
            errors.push(`${prefix}.exportConfig.injectionTemplate must be a string`);
          }
        }
      }
    });
  }
  if (template.injection && typeof template.injection === 'object') {
    const positions = parseInjectionPositions(template.injection.position);
    if (positions.length) {
      const invalid = positions.filter(pos => !INJECTION_POSITIONS.includes(pos));
      if (invalid.length) errors.push('injection.position is invalid');
    }
    if (template.injection.template && typeof template.injection.template !== 'string') {
      errors.push('injection.template must be a string');
    }
    if (template.injection.wrapper && typeof template.injection.wrapper !== 'string') {
      errors.push('injection.wrapper must be a string');
    }
  }
  return { ok: errors.length === 0, errors };
};
