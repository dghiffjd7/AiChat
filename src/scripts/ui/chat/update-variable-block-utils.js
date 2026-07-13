import { splitDanglingBlockTail } from '../../utils/dangling-block-utils.js';

export { splitDanglingBlockTail };

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
    const nextOpen = openRe.exec(tail);
    // 闭合缺失，或闭合其实属于后面另一个块（中间隔着新的开标签）：按悬空处理，不吞中间散文。
    if (!close || (nextOpen && nextOpen.index < close.index)) {
      const { rest } = splitDanglingBlockTail(tail);
      out = out.slice(0, start) + rest;
      continue;
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
    const nextOpen = openRe.exec(tail);
    if (!close || (nextOpen && nextOpen.index < close.index)) {
      const { block, rest } = splitDanglingBlockTail(tail);
      if (block.trim()) blocks.push(block);
      out = out.slice(0, start) + rest;
      continue;
    }
    const end = afterStart + close.index + close[0].length;
    blocks.push(out.slice(afterStart, afterStart + close.index));
    out = out.slice(0, start) + out.slice(end);
  }
  return { blocks, cleaned: out };
};
