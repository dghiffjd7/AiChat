export const getCharacterCardSource = (item = null) => {
  return item?.source && typeof item.source === 'object' ? item.source : {};
};

export const getCharacterCardDisplayName = (item = null, fallback = '角色卡') => {
  const source = getCharacterCardSource(item);
  const raw = String(source.characterName || source.cardName || item?.name || '').trim();
  return raw || fallback;
};

export const getCharacterCardBoundUserId = (item = null) => {
  const source = getCharacterCardSource(item);
  return String(source.boundUserId || source.userId || '').trim();
};
