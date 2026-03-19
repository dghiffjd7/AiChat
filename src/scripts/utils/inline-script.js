export const serializeForInlineScript = (value) => {
  let json = 'null';
  try {
    const next = JSON.stringify(value);
    json = typeof next === 'string' ? next : 'null';
  } catch {}
  return json
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
};
