export const buildLlmUserContext = ({
  promptUserName = '',
  activeUser = null,
} = {}) => ({
  name: String(promptUserName || ''),
  persona: String(activeUser?.description || ''),
  personaPosition: activeUser?.position,
  personaDepth: activeUser?.depth,
  personaRole: activeUser?.role,
});

export const buildLlmCharacterContext = ({
  characterName = '',
  activePersona = null,
} = {}) => ({
  name: String(characterName || ''),
  description: String(activePersona?.description || ''),
});

export const buildLlmSessionContext = ({
  sessionId = '',
  isGroupChat = false,
  characterName = '',
  sessionSettings = null,
} = {}) => ({
  id: String(sessionId || ''),
  isGroup: Boolean(isGroupChat),
  name: String(characterName || ''),
  settings: sessionSettings || {},
});

export const buildLlmGroupContext = ({
  isGroupChat = false,
  sessionId = '',
  characterName = '',
  groupMembers = [],
  getContactName = null,
} = {}) => {
  if (!isGroupChat) return null;
  const members = Array.isArray(groupMembers) ? groupMembers.slice() : [];
  return {
    id: String(sessionId || ''),
    name: String(characterName || ''),
    members,
    memberNames: members.map(id => (
      typeof getContactName === 'function' ? (getContactName(id) || id) : id
    )),
  };
};
