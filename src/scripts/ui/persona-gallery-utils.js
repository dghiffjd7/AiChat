const text = value => String(value ?? '').trim();

const normalizeSearchText = value => text(value).toLocaleLowerCase();

const normalizeTags = value => {
  const items = Array.isArray(value)
    ? value
    : text(value).split(/[,，|]/u);
  return Array.from(new Set(items.map(item => text(item)).filter(Boolean))).slice(0, 24);
};

const getRawCardData = rawCard => {
  if (!rawCard || typeof rawCard !== 'object' || rawCard._tooLarge === true) return {};
  return rawCard.data && typeof rawCard.data === 'object' ? rawCard.data : rawCard;
};

export const buildPersonaGallerySearchText = (persona = {}) => {
  const source = persona?.source && typeof persona.source === 'object' ? persona.source : {};
  return normalizeSearchText([
    persona?.name,
    persona?.description,
    source.characterName,
    source.cardName,
    source.originalFile,
    source.format,
  ].map(value => text(value)).filter(Boolean).join('\n'));
};

export const filterPersonaGalleryItems = (personas = [], query = '') => {
  const normalizedQuery = normalizeSearchText(query);
  const items = Array.isArray(personas) ? personas.filter(Boolean) : [];
  if (!normalizedQuery) return items.slice();
  const terms = normalizedQuery.split(/\s+/u).filter(Boolean);
  return items.filter(persona => {
    const haystack = buildPersonaGallerySearchText(persona);
    return terms.every(term => haystack.includes(term));
  });
};

export const buildPersonaGalleryDetails = (persona = {}, rawCard = null) => {
  const source = persona?.source && typeof persona.source === 'object' ? persona.source : {};
  const raw = getRawCardData(rawCard);
  const description = text(persona?.description) || text(raw.description);
  const personality = text(raw.personality);
  const scenario = text(raw.scenario);
  const creatorNotes = text(raw.creator_notes || raw.creatorNotes);
  const creator = text(raw.creator || raw.character_version || raw.characterVersion);
  const tags = normalizeTags(raw.tags);
  const sourceParts = [text(source.format), text(source.originalFile)].filter(Boolean);
  return {
    description,
    personality,
    scenario,
    creatorNotes,
    creator,
    tags,
    sourceLabel: sourceParts.join(' · '),
    summary: description || personality || scenario || '',
    rawAvailable: Object.keys(raw).length > 0,
    tooLarge: rawCard?._tooLarge === true,
  };
};
