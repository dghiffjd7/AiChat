const trim = value => String(value ?? '').trim();

const uniqueStrings = (value = []) => Array.from(new Set(
  (Array.isArray(value) ? value : []).map(trim).filter(Boolean),
));

const enabledCapabilities = (value = {}) => [
  ['momentPost', 'moment_post'],
  ['momentCommentSideChats', 'side_chats'],
  ['imagePrompt', 'image_prompt'],
  ['tableEdit', 'table_edit'],
  ['variableUpdate', 'variable_update'],
  ['summary', 'summary'],
].filter(([key]) => value?.[key] === true).map(([, label]) => label);

const normalizeTargets = value => (Array.isArray(value) ? value : [])
  .map(item => ({ id: trim(item?.id), name: trim(item?.name || item?.id) }))
  .filter(item => item.id && item.name);

const normalizeTables = value => (Array.isArray(value) ? value : [])
  .map(item => ({
    id: trim(item?.id),
    name: trim(item?.name || item?.id),
    rowIds: uniqueStrings(item?.rowIds),
  }))
  .filter(item => item.id && item.name);

export const buildChatStructuredContractSummary = ({
  adapter = 'private_reply',
  surface = 'private_chat',
  target = {},
  capabilities = {},
  allowedItemTypes = ['text'],
  allowedStickerKeywords = [],
} = {}) => {
  const capabilityNames = enabledCapabilities(capabilities);
  return {
    schemaVersion: 1,
    adapter: trim(adapter),
    surface: trim(surface),
    frozenTarget: {
      sessionId: trim(target?.sessionId),
      targetName: trim(target?.targetName),
      speakerName: trim(target?.speakerName),
      momentId: trim(target?.momentId),
      members: normalizeTargets(target?.members),
      momentAuthors: normalizeTargets(target?.momentAuthors),
      privateTargets: normalizeTargets(target?.privateTargets),
      groupTargets: normalizeTargets(target?.groupTargets),
    },
    allowedItemTypes: uniqueStrings(allowedItemTypes),
    allowedStickerKeywords: uniqueStrings(allowedStickerKeywords),
    tableTargets: normalizeTables(target?.tableTargets),
    capabilities: capabilityNames,
    fixedOrder: [
      'primary_reply',
      ...capabilityNames,
    ],
  };
};
