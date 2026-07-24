import { cloneMvuVariableValue } from '../variables/mvu-variable-defaults-utils.js';

export const writeImportedMvuConversion = ({
  chatStore = null,
  sessionId = '',
  conversion = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  const variables = conversion?.variables && typeof conversion.variables === 'object'
    ? conversion.variables
    : {};
  const schemas = conversion?.schemas && typeof conversion.schemas === 'object'
    ? conversion.schemas
    : {};
  if (!chatStore || !sid) {
    return {
      ok: false,
      sessionId: sid,
      variableCount: 0,
      schemaCount: 0,
    };
  }

  Object.entries(schemas).forEach(([name, schema]) => {
    const key = String(name || '').trim();
    if (!key) return;
    const source = schema && typeof schema === 'object' ? schema : {};
    const nextSchema = { ...source };
    if (
      nextSchema.default === undefined
      && Object.prototype.hasOwnProperty.call(variables, key)
    ) {
      nextSchema.default = cloneMvuVariableValue(variables[key]);
    }
    chatStore.setVariableSchema?.(key, nextSchema, sid);
  });

  Object.entries(variables).forEach(([name, value]) => {
    const key = String(name || '').trim();
    if (!key) return;
    chatStore.setVariable?.(key, cloneMvuVariableValue(value), sid);
    chatStore.setInitialVariable?.(key, cloneMvuVariableValue(value), sid);
  });

  if (Array.isArray(conversion?.rules) && conversion.rules.length > 0) {
    chatStore.setVariableRules?.(conversion.rules, sid);
  }
  if (conversion?.stageSchema) {
    chatStore.setStageSchema?.(conversion.stageSchema, sid);
  }

  return {
    ok: true,
    sessionId: sid,
    variableCount: Object.keys(variables).length,
    schemaCount: Object.keys(schemas).length,
  };
};
