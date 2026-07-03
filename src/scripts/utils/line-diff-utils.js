// 行级文本 diff（正文优化 / 格式修复的预览基础）。
// 输出行序列：context（未变）、del（红，旧行）、add（绿，新行）、skip（折叠的未变段），
// 以及 added/removed 统计。大文本用前后缀裁剪 + 中段 LCS，超过行数上限时退化为整段替换。

const MAX_LCS_LINES = 1500;

const splitLines = (text = '') => String(text ?? '').replace(/\r\n/g, '\n').split('\n');

// 中段 LCS 回溯出对齐关系；返回 [{ type: 'context'|'del'|'add', oldIndex?, newIndex? }]
const diffLinesLcs = (oldLines = [], newLines = []) => {
  const n = oldLines.length;
  const m = newLines.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'context', oldIndex: i, newIndex: j });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', oldIndex: i });
      i += 1;
    } else {
      ops.push({ type: 'add', newIndex: j });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: 'del', oldIndex: i });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: 'add', newIndex: j });
    j += 1;
  }
  return ops;
};

// 折叠连续 context 长段：变更附近保留 keep 行，其余合并为一个 skip 行。
// 首段只保留尾部 keep 行，末段只保留头部 keep 行。
const collapseContextRuns = (rows = [], { keep = 3 } = {}) => {
  const output = [];
  let run = [];
  const flushRun = ({ isHead = false, isTail = false } = {}) => {
    if (!run.length) return;
    const headKeep = isHead ? 0 : keep;
    const tailKeep = isTail ? 0 : keep;
    if (run.length <= headKeep + tailKeep + 1) {
      output.push(...run);
    } else {
      if (headKeep > 0) output.push(...run.slice(0, headKeep));
      output.push({ type: 'skip', count: run.length - headKeep - tailKeep });
      if (tailKeep > 0) output.push(...run.slice(run.length - tailKeep));
    }
    run = [];
  };
  rows.forEach((row) => {
    if (row.type === 'context') {
      run.push(row);
      return;
    }
    flushRun({ isHead: output.length === 0 });
    output.push(row);
  });
  flushRun({ isTail: true });
  return output;
};

export const buildLineDiff = (oldText = '', newText = '', {
  collapseContext = true,
  contextKeep = 3,
} = {}) => {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  const identical = oldLines.length === newLines.length &&
    oldLines.every((line, index) => line === newLines[index]);
  if (identical) {
    return { rows: [], added: 0, removed: 0, changed: false, truncated: false };
  }

  // 前后缀裁剪，缩小 LCS 规模。
  let prefix = 0;
  const maxCommon = Math.min(oldLines.length, newLines.length);
  while (prefix < maxCommon && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < maxCommon - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1;

  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);

  let truncated = false;
  let middleOps;
  if (oldMiddle.length > MAX_LCS_LINES || newMiddle.length > MAX_LCS_LINES) {
    // 超大变更退化为整段替换，避免 O(n*m) 内存失控。
    truncated = true;
    middleOps = [
      ...oldMiddle.map((_, index) => ({ type: 'del', oldIndex: prefix + index })),
      ...newMiddle.map((_, index) => ({ type: 'add', newIndex: prefix + index })),
    ];
  } else {
    middleOps = diffLinesLcs(oldMiddle, newMiddle).map(op => ({
      type: op.type,
      ...(op.oldIndex !== undefined ? { oldIndex: op.oldIndex + prefix } : {}),
      ...(op.newIndex !== undefined ? { newIndex: op.newIndex + prefix } : {}),
    }));
  }

  const ops = [
    ...Array.from({ length: prefix }, (_, index) => ({ type: 'context', oldIndex: index, newIndex: index })),
    ...middleOps,
    ...Array.from({ length: suffix }, (_, index) => ({
      type: 'context',
      oldIndex: oldLines.length - suffix + index,
      newIndex: newLines.length - suffix + index,
    })),
  ];

  let added = 0;
  let removed = 0;
  const rows = ops.map((op) => {
    if (op.type === 'del') {
      removed += 1;
      return { type: 'del', oldLine: op.oldIndex + 1, newLine: null, text: oldLines[op.oldIndex] };
    }
    if (op.type === 'add') {
      added += 1;
      return { type: 'add', oldLine: null, newLine: op.newIndex + 1, text: newLines[op.newIndex] };
    }
    return {
      type: 'context',
      oldLine: op.oldIndex + 1,
      newLine: op.newIndex + 1,
      text: oldLines[op.oldIndex],
    };
  });

  return {
    rows: collapseContext ? collapseContextRuns(rows, { keep: contextKeep }) : rows,
    added,
    removed,
    changed: added > 0 || removed > 0,
    truncated,
  };
};
