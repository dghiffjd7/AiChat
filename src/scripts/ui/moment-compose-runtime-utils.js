export const persistComposedMomentRecord = ({
  momentsStore = null,
  record = null,
  assets = [],
  normalizeGeneratedImageAsset = (asset, extra) => ({ ...(asset || {}), ...(extra || {}) }),
} = {}) => {
  if (!record || typeof record !== 'object' || typeof momentsStore?.upsert !== 'function') {
    return {
      ok: false,
      reason: 'missing-input',
      momentId: '',
      moment: null,
      generatedImages: [],
    };
  }

  const saved = momentsStore.upsert(record);
  const momentId = String(saved?.id || record?.id || '').trim();
  if (!momentId) {
    return {
      ok: false,
      reason: 'missing-moment-id',
      momentId: '',
      moment: saved || null,
      generatedImages: [],
    };
  }

  const generatedImages = (Array.isArray(assets) ? assets : [])
    .map(asset => normalizeGeneratedImageAsset(asset, { sourceMomentId: momentId }))
    .filter(Boolean);

  let moment = saved || momentsStore.get?.(momentId) || null;
  if (generatedImages.length) {
    moment = momentsStore.upsert({ id: momentId, generatedImages })
      || momentsStore.get?.(momentId)
      || saved
      || null;
  } else if (typeof momentsStore.get === 'function') {
    moment = momentsStore.get(momentId) || moment;
  }

  return {
    ok: true,
    reason: '',
    momentId,
    moment,
    generatedImages,
  };
};
