import assert from 'node:assert/strict';

import {
  FORMAT_PATCH_PROTOCOL_VERSION,
  applyValidatedFormatLinePatches,
  createFormatPatchRevisionToken,
  normalizeFormatPatchModelResult,
  validateFormatPatchRevision,
} from '../../src/scripts/ui/chat/format-patch-transaction-utils.js';

const revision = 'format-run:test-revision';

const buildPatchResult = (linePatches, overrides = {}) => ({
  protocolVersion: FORMAT_PATCH_PROTOCOL_VERSION,
  status: 'patch',
  baseRevision: revision,
  repairSummary: '修复格式',
  issues: [],
  linePatches,
  ...overrides,
});

{
  const source = '<rule1>\nrulea:\n<content></content>\n</rul';
  const result = normalizeFormatPatchModelResult(buildPatchResult([{
    startLine: 4,
    endLine: 4,
    originalLines: ['</rul'],
    replacementLines: ['</rule1>'],
    reason: '补全闭合标签',
  }]), {
    originalText: source,
    baseRevision: revision,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'patch');
  assert.equal(result.canRepair, true);
  assert.equal(result.candidateText, '<rule1>\nrulea:\n<content></content>\n</rule1>');
  assert.equal(Object.hasOwn(result, 'correctedText'), false);
  console.log('ok - format patch transaction applies one exact line replacement');
}

{
  const result = normalizeFormatPatchModelResult(buildPatchResult([{
    startLine: 1,
    endLine: 1,
    originalLines: ['正文到这里忽然'],
    replacementLines: ['正文到这里忽然'],
    reason: '仅示例',
  }], {
    issues: [{
      severity: 'warning',
      type: 'truncated_response',
      message: '正文疑似在末尾截断',
    }],
  }), {
    originalText: '正文到这里忽然',
    baseRevision: revision,
  });

  assert.equal(result.status, 'invalid_output', '无效果补丁仍应拒绝');
  assert.equal(result.sourceTruncationSuspected, false, '无效输出不应进入审阅警告');

  const valid = normalizeFormatPatchModelResult(buildPatchResult([{
    startLine: 1,
    endLine: 1,
    originalLines: ['正文到这里忽然</rul'],
    replacementLines: ['正文到这里忽然</rule1>'],
    reason: '补全闭合标签',
  }], {
    issues: [{
      severity: 'warning',
      type: 'truncated_response',
      message: '正文疑似在末尾截断',
    }],
  }), {
    originalText: '正文到这里忽然</rul',
    baseRevision: revision,
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.sourceTruncationSuspected, true);
  console.log('ok - valid patch results preserve the model truncation warning for review');
}

{
  const source = 'rulea:\r\n<content>正文</content>\r\n尾行';
  const result = normalizeFormatPatchModelResult(buildPatchResult([
    {
      startLine: 1,
      endLine: 1,
      originalLines: ['rulea:'],
      replacementLines: ['<rule1>', 'rulea:'],
      reason: '添加开始标签',
    },
    {
      startLine: 2,
      endLine: 2,
      originalLines: ['<content>正文</content>'],
      replacementLines: ['<content>正文</content>', '</rule1>'],
      reason: '添加结束标签',
    },
  ]), {
    originalText: source,
    baseRevision: revision,
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.candidateText,
    '<rule1>\r\nrulea:\r\n<content>正文</content>\r\n</rule1>\r\n尾行',
  );
  assert.equal(result.candidateText.endsWith('\r\n尾行'), true);
  console.log('ok - format patch transaction preserves CRLF outside edited ranges');
}

{
  const source = '一\n二\n三\n四';
  const result = normalizeFormatPatchModelResult(buildPatchResult([
    {
      startLine: 2,
      endLine: 3,
      originalLines: ['二', '三'],
      replacementLines: ['二', '三修'],
    },
    {
      startLine: 3,
      endLine: 4,
      originalLines: ['三', '四'],
      replacementLines: ['三', '四修'],
    },
  ]), {
    originalText: source,
    baseRevision: revision,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_output');
  assert.equal(result.validationErrors.some(item => item.code === 'overlapping_patches'), true);
  assert.equal(result.candidateText, '');
  console.log('ok - format patch transaction rejects overlapping patches before apply');
}

{
  const source = '一\n二\n三';
  const result = normalizeFormatPatchModelResult(buildPatchResult([{
    startLine: 2,
    endLine: 2,
    originalLines: ['不是二'],
    replacementLines: ['二修'],
  }]), {
    originalText: source,
    baseRevision: revision,
  });

  assert.equal(result.ok, false);
  assert.equal(result.validationErrors.some(item => item.code === 'original_lines_mismatch'), true);
  console.log('ok - format patch transaction rejects stale originalLines');
}

{
  const sourceLines = Array.from({ length: 21 }, (_value, index) => `line-${index + 1}`);
  const result = normalizeFormatPatchModelResult(buildPatchResult(
    sourceLines.map((line, index) => ({
      startLine: index + 1,
      endLine: index + 1,
      originalLines: [line],
      replacementLines: [`${line}-fixed`],
    })),
  ), {
    originalText: sourceLines.join('\n'),
    baseRevision: revision,
  });
  assert.equal(result.ok, false);
  assert.equal(result.validationErrors.some(item => item.code === 'too_many_patches'), true);

  const outOfRange = normalizeFormatPatchModelResult(buildPatchResult([{
    startLine: 2,
    endLine: 2,
    originalLines: ['不存在'],
    replacementLines: ['修复'],
  }]), {
    originalText: '只有一行',
    baseRevision: revision,
  });
  assert.equal(outOfRange.validationErrors.some(item => item.code === 'line_out_of_range'), true);
  console.log('ok - format patch transaction enforces patch count and source bounds');
}

{
  const source = '一\n二';
  const result = normalizeFormatPatchModelResult(buildPatchResult([], {
    correctedText: '一\n二修',
  }), {
    originalText: source,
    baseRevision: revision,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_output');
  assert.equal(result.validationErrors.some(item => item.code === 'corrected_text_forbidden'), true);
  console.log('ok - format patch transaction rejects correctedText full-response output');
}

{
  const result = normalizeFormatPatchModelResult({
    protocolVersion: FORMAT_PATCH_PROTOCOL_VERSION,
    status: 'no_change',
    baseRevision: revision,
    repairSummary: '格式正确',
    issues: [],
    linePatches: [],
  }, {
    originalText: '原文',
    baseRevision: revision,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'no_change');
  assert.equal(result.canRepair, false);
  assert.equal(result.candidateText, '');
  console.log('ok - format patch transaction accepts no_change without a candidate');
}

{
  const result = normalizeFormatPatchModelResult(buildPatchResult([{
    startLine: 1,
    endLine: 1,
    originalLines: ['原文'],
    replacementLines: ['修复'],
  }], {
    baseRevision: 'stale-token',
  }), {
    originalText: '原文',
    baseRevision: revision,
  });

  assert.equal(result.ok, false);
  assert.equal(result.validationErrors.some(item => item.code === 'revision_mismatch'), true);
  assert.deepEqual(validateFormatPatchRevision({
    snapshotText: '原文',
    currentText: '已被编辑',
  }), {
    ok: false,
    reason: 'revision_expired',
  });
  console.log('ok - format patch transaction rejects mismatched run and source revisions');
}

{
  const patches = [{
    startLine: 2,
    endLine: 2,
    originalLines: ['二'],
    replacementLines: [],
    reason: '删除多余行',
  }];
  const result = applyValidatedFormatLinePatches('一\r\n二\r\n三', patches);
  assert.equal(result.ok, true);
  assert.equal(result.candidateText, '一\r\n三');
  console.log('ok - format patch transaction deletes a line without normalizing neighbors');
}

{
  const token = createFormatPatchRevisionToken({
    now: () => 123456,
    random: () => 0.5,
  });
  assert.match(token, /^format-run:/);
  assert.equal(typeof token, 'string');
  assert.equal(token.length > 16, true);
  console.log('ok - format patch transaction creates an opaque revision token');
}
