import { buildLineDiff } from '../utils/line-diff-utils.js';

export const normalizePresetBlockText = value =>
  String(value ?? '').replace(/\r\n?/g, '\n');

export const presetBlockContentChanged = (baseText, draftText) =>
  normalizePresetBlockText(baseText) !== normalizePresetBlockText(draftText);

export const buildPresetPreviewBlockMap = ({
  messageTexts = [],
  blocks = [],
} = {}) => {
  const texts = (Array.isArray(messageTexts) ? messageTexts : []).map(text => String(text ?? ''));
  const claimed = texts.map(() => []);
  const result = new Map();

  const tryClaim = (id, needle, exact) => {
    const value = String(needle ?? '');
    if (!value) return false;
    for (let messageIndex = 0; messageIndex < texts.length; messageIndex += 1) {
      let searchFrom = 0;
      while (searchFrom <= texts[messageIndex].length - value.length) {
        const start = texts[messageIndex].indexOf(value, searchFrom);
        if (start < 0) break;
        const end = start + value.length;
        searchFrom = start + 1;
        if (claimed[messageIndex].some(([claimedStart, claimedEnd]) => start < claimedEnd && end > claimedStart)) {
          continue;
        }
        claimed[messageIndex].push([start, end]);
        result.set(id, { msg: messageIndex, start, len: value.length, exact });
        return true;
      }
    }
    return false;
  };

  const fuzzyPass = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const id = String(block?.id || '').trim();
    if (!id || block?.marker === true || block?.enabled === false) continue;
    const content = String(block?.content ?? '');
    if (content.trim().length < 6) continue;
    if (!tryClaim(id, content, true)) fuzzyPass.push({ id, content });
  }

  for (const { id, content } of fuzzyPass) {
    const segments = content
      .split(/\{\{[^{}]*\}\}|<%[\s\S]*?%>/)
      .map(segment => segment.trim())
      .filter(segment => segment.length >= 24)
      .sort((left, right) => right.length - left.length)
      .slice(0, 3);
    for (const segment of segments) {
      if (tryClaim(id, segment, false)) break;
    }
  }

  return result;
};

export const applyPresetBlockHunk = (baseText, draftText, hunkIndex, mode) => {
  const { rows } = buildLineDiff(baseText, draftText, { collapseContext: false });
  const isChanged = row => row?.type === 'del' || row?.type === 'add';
  let currentHunk = -1;
  const lines = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (isChanged(row) && !isChanged(rows[index - 1])) currentHunk += 1;
    if (row.type === 'context') {
      lines.push(row.text);
      continue;
    }
    const inTargetHunk = currentHunk === hunkIndex;
    if (mode === 'accept') {
      if (row.type === 'del' ? !inTargetHunk : inTargetHunk) lines.push(row.text);
    } else if (row.type === 'del' ? inTargetHunk : !inTargetHunk) {
      lines.push(row.text);
    }
  }

  return lines.join('\n');
};

export const createLatestPreviewBuildQueue = ({
  build,
  onStart = null,
  onResult = null,
  onFailure = null,
} = {}) => {
  let revision = 0;
  let queuedJob = null;
  let running = null;

  const drain = async () => {
    while (queuedJob) {
      const job = queuedJob;
      queuedJob = null;
      onStart?.(job);
      let result = null;
      let error = null;
      try {
        result = await build?.(job.options);
      } catch (err) {
        error = err;
      }
      if (job.revision !== revision) continue;
      if (result) onResult?.(result, job);
      else onFailure?.(error, job);
    }
  };

  return {
    request(options = {}) {
      queuedJob = { revision: ++revision, options };
      if (!running) {
        running = drain().finally(() => { running = null; });
      }
      return running;
    },
    invalidate() {
      revision += 1;
      queuedJob = null;
    },
  };
};

