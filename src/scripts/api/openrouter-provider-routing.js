const trim = value => String(value ?? '').trim();

export const normalizeOpenRouterProviderSlugs = (value = []) => {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  source.forEach((item) => {
    const slug = trim(item).toLowerCase();
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    out.push(slug);
  });
  return out;
};

export const extractOpenRouterModelProviders = (payload = {}) => {
  const endpoints = Array.isArray(payload?.data?.endpoints)
    ? payload.data.endpoints
    : (Array.isArray(payload?.endpoints) ? payload.endpoints : []);
  const seen = new Set();
  const out = [];
  endpoints.forEach((endpoint) => {
    const tag = trim(endpoint?.tag);
    const slug = normalizeOpenRouterProviderSlugs([tag.split('/')[0]])[0] || '';
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    out.push({
      slug,
      name: trim(endpoint?.provider_name) || slug,
    });
  });
  return out;
};
