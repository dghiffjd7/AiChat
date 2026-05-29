const INTERNAL_TO_PROVIDER_TOOL_NAMES = Object.freeze({
  'contact_profile.list': 'contact_profile_list',
  'contact_profile.get': 'contact_profile_get',
  'chat.emit_private': 'chat_emit_private',
  'chat.emit_group': 'chat_emit_group',
  'chat.emit_moment_comment': 'chat_emit_moment_comment',
  'chat.emit_moment_post': 'chat_emit_moment_post',
});

const PROVIDER_TO_INTERNAL_TOOL_NAMES = Object.freeze(
  Object.fromEntries(
    Object.entries(INTERNAL_TO_PROVIDER_TOOL_NAMES)
      .map(([internalName, providerName]) => [providerName, internalName]),
  ),
);

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const toProviderToolModelName = (toolName = '') => {
  const name = trim(toolName);
  return INTERNAL_TO_PROVIDER_TOOL_NAMES[name] || name;
};

export const toInternalProviderToolName = (toolName = '') => {
  const name = trim(toolName);
  return PROVIDER_TO_INTERNAL_TOOL_NAMES[name] || name;
};

export const listProviderToolNameAliases = () => (
  Object.entries(INTERNAL_TO_PROVIDER_TOOL_NAMES)
    .map(([internalName, providerName]) => ({ internalName, providerName }))
);
