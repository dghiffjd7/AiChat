const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const safeCode = value => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9._:-]+/gu, '_')
  .slice(0, 160);

const parseBody = (body) => {
  if (isPlainObject(body)) return body;
  const raw = String(body ?? '').trim();
  if (!raw || (raw[0] !== '{' && raw[0] !== '[')) return null;
  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const extractSafeProviderErrorMetadata = (body = null) => {
  const parsed = parseBody(body);
  const detail = isPlainObject(parsed?.error) ? parsed.error : (parsed || {});
  const providerCode = safeCode(
    detail.code
    || detail.type
    || detail.status
    || parsed?.code
    || parsed?.type
    || parsed?.status,
  );
  const providerCategory = safeCode(
    detail.category
    || detail.param
    || detail.reason
    || parsed?.category
    || parsed?.param,
  );
  return {
    ...(providerCode ? { providerCode } : {}),
    ...(providerCategory ? { providerCategory } : {}),
  };
};

export const attachSafeProviderErrorMetadata = (error, body = null) => {
  if (!error || typeof error !== 'object') return error;
  const metadata = extractSafeProviderErrorMetadata(body);
  if (metadata.providerCode) error.providerCode = metadata.providerCode;
  if (metadata.providerCategory) error.providerCategory = metadata.providerCategory;
  return error;
};
