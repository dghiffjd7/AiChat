export const stripUpdateVariableBlocks = (text) => {
  let out = String(text || '');
  if (!out) return out;
  const openRe = /<\s*(update(?:variable)?|variableupdate)\b[^>]*>/i;
  for (let i = 0; i < 20; i += 1) {
    const open = openRe.exec(out);
    if (!open) break;
    const tag = String(open[1] || 'UpdateVariable');
    const start = open.index;
    const afterStart = start + open[0].length;
    const tail = out.slice(afterStart);
    const closeRe = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'i');
    const close = closeRe.exec(tail);
    if (!close) {
      out = out.slice(0, start);
      break;
    }
    const end = afterStart + close.index + close[0].length;
    out = out.slice(0, start) + out.slice(end);
  }
  return out
    .replace(/<\s*\/?\s*(update(?:variable)?|variableupdate)\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
};

export const extractUpdateVariableBlocks = (text) => {
  let out = String(text || '');
  if (!out) return { blocks: [], cleaned: out };
  const blocks = [];
  const openRe = /<\s*(update(?:variable)?|variableupdate)\b[^>]*>/i;
  for (let i = 0; i < 50; i += 1) {
    const open = openRe.exec(out);
    if (!open) break;
    const tag = String(open[1] || 'UpdateVariable');
    const start = open.index;
    const afterStart = start + open[0].length;
    const tail = out.slice(afterStart);
    const closeRe = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'i');
    const close = closeRe.exec(tail);
    if (!close) {
      blocks.push(out.slice(afterStart));
      out = out.slice(0, start);
      break;
    }
    const end = afterStart + close.index + close[0].length;
    blocks.push(out.slice(afterStart, afterStart + close.index));
    out = out.slice(0, start) + out.slice(end);
  }
  return { blocks, cleaned: out };
};
