const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const normalizeMaidImageAttachments = (attachments = []) => (
  (Array.isArray(attachments) ? attachments : [])
    .map(item => ({
      id: trim(item?.id),
      name: trim(item?.name),
      mime: trim(item?.mime),
      size: Number(item?.size || 0) || 0,
      url: trim(item?.llmUrl || item?.url),
      kind: trim(item?.kind, 'image'),
    }))
    .filter(item => item.kind === 'image' && item.url)
);

export const getMaidImageAttachmentsFromContext = (context = {}) => (
  normalizeMaidImageAttachments(context?.maidAttachments)
);

export const buildMaidImageAttachmentSummary = (attachments = []) => {
  const images = normalizeMaidImageAttachments(attachments);
  if (!images.length) return '';
  return images
    .map((image, index) => {
      const meta = [image.name, image.mime, image.size ? `${image.size} bytes` : ''].filter(Boolean).join(', ');
      return `图片${index + 1}${meta ? `：${meta}` : ''}`;
    })
    .join('\n');
};

export const buildMaidUserContentWithImages = (text = '', attachments = []) => {
  const prompt = trim(text);
  const images = normalizeMaidImageAttachments(attachments);
  if (!images.length) return prompt;
  return [
    { type: 'text', text: prompt || '请查看我附上的图片。' },
    ...images.map(image => ({ type: 'image_url', image_url: { url: image.url } })),
  ];
};
