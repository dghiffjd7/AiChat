const DEFAULT_VALUES = Object.freeze({
  product_name: 'MiPhone',
  stage_name: 'FC two-stage runtime',
});

const clone = value => JSON.parse(JSON.stringify(value));

export const CHAT_FC_READONLY_FIXTURE_TOOL_NAME = 'read_fc_fixture_fact';

export const buildChatFcReadonlyFixtureTool = ({
  values = DEFAULT_VALUES,
  onRead = null,
  executeOverride = null,
} = {}) => {
  const source = values && typeof values === 'object' && !Array.isArray(values)
    ? clone(values)
    : clone(DEFAULT_VALUES);
  const keys = Object.keys(source);
  return {
    name: CHAT_FC_READONLY_FIXTURE_TOOL_NAME,
    description: 'Read one deterministic fixture fact for the FC two-stage zero-write test.',
    readOnly: true,
    effect: 'read',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        key: { type: 'string', enum: keys },
      },
      required: ['key'],
    },
    execute: typeof executeOverride === 'function'
      ? executeOverride
      : async ({ arguments: args = {} } = {}) => {
          const key = String(args?.key || '').trim();
          try { onRead?.({ key }); } catch {}
          if (!Object.prototype.hasOwnProperty.call(source, key)) {
            return { ok: false, reason: 'fixture_key_unknown' };
          }
          return { ok: true, key, value: source[key] };
        },
  };
};
