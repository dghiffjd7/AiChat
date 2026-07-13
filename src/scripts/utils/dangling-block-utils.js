// 未闭合（悬空）格式块的"块语法前缀"判定：命令/JSON/注释行属于块内容，散文行不属于。
// 模型在思考或正文中途输出未闭合 <tableEdit>/<UpdateVariable> 一类标签时，
// 只把紧随其后的块语法行当作残块吞掉，其余散文必须归还正文——不能从标签起截断到底，
// 也不能让悬空开标签与后面另一个完整块的闭合错误配对、吞掉中间内容。
const DANGLING_BLOCK_CONTENT_LINE_RE = /^\s*(?:[{}[\]"'`,:;]|-?\d|_\s*\.\s*[\w$]+\s*\(|[\w$]+(?:\.[\w$]+)*\s*\(|\/\/|<!--|-->)/;

export const splitDanglingBlockTail = (tail) => {
  const raw = String(tail ?? '');
  if (!raw) return { block: '', rest: '' };
  const lines = raw.split('\n');
  let blockEnd = 0;
  let consumedContent = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      // 空行本身不决定归属：夹在块语法行之间算块，块结束后算正文。
      continue;
    }
    if (!DANGLING_BLOCK_CONTENT_LINE_RE.test(line)) break;
    blockEnd = index + 1;
    consumedContent = true;
  }
  if (!consumedContent) return { block: '', rest: raw };
  return {
    block: lines.slice(0, blockEnd).join('\n'),
    rest: lines.slice(blockEnd).join('\n'),
  };
};
