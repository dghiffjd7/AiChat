import { WRITE_PREVIEW_PROVIDER_MODEL_CONTEXT_TOOLS } from './provider-tool-request-schema.js';

const normalizeToolList = (value = []) => {
  const tools = Array.isArray(value) ? value : [value];
  return Array.from(new Set(tools
    .map(tool => String(tool || '').trim())
    .filter(Boolean)));
};

export const resolveWritePreviewGatePatch = ({
  gate = {},
  enabling = false,
} = {}) => {
  const currentTools = normalizeToolList(gate?.allowedTools);
  const previewTools = Array.from(WRITE_PREVIEW_PROVIDER_MODEL_CONTEXT_TOOLS);
  const previewToolSet = new Set(previewTools);
  return {
    enabled: enabling === true ? true : gate?.enabled === true,
    allowedTools: enabling === true
      ? normalizeToolList(currentTools.concat(previewTools))
      : currentTools.filter(tool => !previewToolSet.has(tool)),
  };
};
