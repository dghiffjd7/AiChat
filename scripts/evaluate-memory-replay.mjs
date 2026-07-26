#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { buildMemoryCoverageLine } from '../src/scripts/memory/memory-coverage-utils.js';
import { buildMemoryKeywordRecallPlan } from '../src/scripts/memory/memory-keyword-recall-utils.js';
import {
  buildMemoryPromptRowLayers,
} from '../src/scripts/memory/memory-segment-plan-utils.js';

const SUMMARY_TABLE_IDS = new Set([
  'chat_summary',
  'group_summary',
  'moment_summary',
  'rp_summary',
]);

const asArray = value => Array.isArray(value) ? value : [];
const uniqueStrings = values => Array.from(new Set(
  asArray(values).map(value => String(value || '').trim()).filter(Boolean),
));
const ratio = (part, total) => total > 0 ? part / total : 1;

const stringifyMessageContent = (content) => {
  if (!Array.isArray(content)) return String(content ?? '').trim();
  return content
    .map(part => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'text') return String(part.text || '').trim();
      if (part.type === 'image_url') return '[图片]';
      if (part.type === 'input_audio') return '[语音]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
};

const resolveRows = input => (
  asArray(input?.memoryRows).length ? asArray(input.memoryRows)
    : asArray(input?.memories).length ? asArray(input.memories)
      : asArray(input?.memory?.rows).length ? asArray(input.memory.rows)
        : asArray(input?.session?.memoryRows)
);

const resolveMessages = input => (
  asArray(input?.messages).length ? asArray(input.messages)
    : asArray(input?.session?.messages).length ? asArray(input.session.messages)
      : asArray(input?.chat?.messages).length ? asArray(input.chat.messages)
        : asArray(input?.conversation?.messages)
);

const normalizeMemoryRows = (rows = []) => asArray(rows)
  .filter(row => row && typeof row === 'object')
  .map((row, index) => {
    const tableId = String(row?.table_id || row?.tableId || '').trim();
    const id = String(row?.id || `${tableId || 'memory'}:${index}`).trim();
    const rowData = row?.row_data && typeof row.row_data === 'object'
      ? row.row_data
      : (row?.rowData && typeof row.rowData === 'object' ? row.rowData : {});
    return {
      ...row,
      id,
      table_id: tableId,
      row_data: rowData,
    };
  })
  .filter(row => row.table_id);

const buildTableMap = (tables = [], rows = []) => {
  const map = new Map();
  asArray(tables).forEach((table) => {
    const id = String(table?.id || table?.table_id || '').trim();
    if (!id) return;
    map.set(id, {
      ...table,
      id,
      name: String(table?.name || id).trim() || id,
      columns: asArray(table?.columns),
    });
  });
  rows.forEach((row) => {
    const tableId = row.table_id;
    if (map.has(tableId)) return;
    map.set(tableId, {
      id: tableId,
      name: tableId,
      columns: Object.keys(row.row_data || {}).map(id => ({ id, name: id, type: 'text' })),
    });
  });
  return map;
};

const annotateMessageTurns = (messages = []) => {
  let inferredTurn = 0;
  return asArray(messages).map((message, index) => {
    const role = String(message?.role || '').trim().toLowerCase();
    if (role === 'user') inferredTurn += 1;
    const explicit = Number(
      message?.turn
      ?? message?.timelineTurnNumber
      ?? message?.meta?.timelineTurnNumber
      ?? message?.meta?.turn,
    );
    return {
      ...message,
      _index: index,
      _turn: Number.isFinite(explicit) && explicit > 0 ? Math.trunc(explicit) : inferredTurn,
      _text: stringifyMessageContent(message?.content ?? message?.text ?? message?.raw),
    };
  });
};

const buildAutomaticCases = (messages = [], recentTurns = 12) => {
  const output = [];
  messages.forEach((message, index) => {
    if (String(message?.role || '').toLowerCase() !== 'user') return;
    const nextAssistant = messages.slice(index + 1).find(item => (
      String(item?.role || '').toLowerCase() === 'assistant'
    ));
    output.push({
      id: `turn-${message._turn || output.length + 1}`,
      turn: message._turn || output.length + 1,
      messageIndex: index,
      userText: message._text,
      assistantText: nextAssistant?._text || '',
      trimmedFromTurn: 1,
      trimmedToTurn: Math.max(0, (message._turn || 0) - recentTurns),
    });
  });
  return output;
};

const resolveCaseText = (caseItem, messages, historyMessages) => {
  const userText = String(caseItem?.userText || caseItem?.query || '').trim();
  const historyText = String(caseItem?.historyText || '').trim();
  if (historyText) return [userText, historyText].filter(Boolean).join('\n');
  const historyDepthRaw = Number(caseItem?.historyDepth);
  const historyDepth = Number.isFinite(historyDepthRaw)
    ? Math.max(0, Math.trunc(historyDepthRaw))
    : historyMessages;
  const indexRaw = Math.trunc(Number(caseItem?.messageIndex));
  const turnRaw = Math.trunc(Number(caseItem?.turn));
  let endIndex = Number.isFinite(indexRaw) && indexRaw >= 0
    ? Math.min(messages.length - 1, indexRaw)
    : messages.findLastIndex(message => message._turn <= turnRaw && String(message?.role || '').toLowerCase() === 'user');
  if (endIndex < 0) endIndex = messages.length - 1;
  const history = historyDepth > 0
    ? messages
        .slice(0, Math.max(0, endIndex))
        .filter(message => message._text)
        .slice(-historyDepth)
        .map(message => message._text)
    : [];
  const current = userText || messages[endIndex]?._text || '';
  return [current, ...history].filter(Boolean).join('\n');
};

const resolveAssistantText = (caseItem, messages) => {
  const explicit = String(caseItem?.assistantText || '').trim();
  if (explicit) return explicit;
  const index = Math.trunc(Number(caseItem?.messageIndex));
  if (!Number.isFinite(index) || index < 0) return '';
  const next = messages.slice(index + 1).find(message => (
    String(message?.role || '').toLowerCase() === 'assistant'
  ));
  return next?._text || '';
};

// 与 bridge 注入链共用同一分层实现（含召回准入过滤）：
// 评测器若自带口径，用户手动禁用的行会被当召回候选，评测结果就不代表生产。
const buildReplayRowLayers = (rows = []) => {
  const layers = buildMemoryPromptRowLayers(rows);
  return { limitedWorkingRows: layers.limitedRows, recallRows: layers.recallCandidateRows };
};

export const normalizeMemoryReplayDataset = (input = {}) => {
  const rows = normalizeMemoryRows(resolveRows(input));
  const messages = annotateMessageTurns(resolveMessages(input));
  const config = {
    recallBudgetTokens: Math.max(0, Math.trunc(Number(input?.config?.recallBudgetTokens)) || 12000),
    recallMaxRows: Math.max(0, Math.trunc(Number(input?.config?.recallMaxRows)) || 20),
    historyMessages: Math.max(0, Math.trunc(Number(input?.config?.historyMessages)) || 12),
    recentTurns: Math.max(0, Math.trunc(Number(input?.config?.recentTurns)) || 12),
    tokenMode: input?.config?.tokenMode || 'rough',
  };
  const providedCases = asArray(input?.cases);
  return {
    source: String(input?.source || input?.name || input?.session?.id || '').trim(),
    rows,
    messages,
    tables: asArray(input?.tables).length ? asArray(input.tables) : asArray(input?.memory?.tables),
    cases: providedCases.length ? providedCases : buildAutomaticCases(messages, config.recentTurns),
    config,
  };
};

export const evaluateMemoryReplay = (input = {}) => {
  const dataset = normalizeMemoryReplayDataset(input);
  const tableById = buildTableMap(dataset.tables, dataset.rows);
  const { limitedWorkingRows, recallRows } = buildReplayRowLayers(dataset.rows);
  const workingRowIds = new Set(limitedWorkingRows.map(row => row.id));
  const summaryRows = dataset.rows.filter(row => SUMMARY_TABLE_IDS.has(row.table_id));
  const caseResults = [];
  let coverageCovered = 0;
  let coverageTarget = 0;
  let recallExpected = 0;
  let recallHits = 0;
  let recallSelected = 0;
  let recallRelevantSelected = 0;
  let consistencyReferences = 0;
  let consistencyConflicts = 0;

  dataset.cases.forEach((rawCase, caseIndex) => {
    const caseItem = rawCase && typeof rawCase === 'object' ? rawCase : {};
    const queryText = resolveCaseText(caseItem, dataset.messages, dataset.config.historyMessages);
    const fullRecall = buildMemoryKeywordRecallPlan({
      rows: recallRows,
      tableById,
      queryText,
      tokenBudget: Number.POSITIVE_INFINITY,
      maxRows: Number.POSITIVE_INFINITY,
      tokenMode: dataset.config.tokenMode,
    });
    const actualRecall = buildMemoryKeywordRecallPlan({
      rows: recallRows,
      tableById,
      queryText,
      tokenBudget: Number.isFinite(Number(caseItem?.recallBudgetTokens))
        ? Number(caseItem.recallBudgetTokens)
        : dataset.config.recallBudgetTokens,
      maxRows: Number.isFinite(Number(caseItem?.recallMaxRows))
        ? Number(caseItem.recallMaxRows)
        : dataset.config.recallMaxRows,
      tokenMode: dataset.config.tokenMode,
    });
    const expectedIds = Object.prototype.hasOwnProperty.call(caseItem, 'expectedRecallRowIds')
      ? uniqueStrings(caseItem.expectedRecallRowIds)
      : uniqueStrings(fullRecall.items.map(item => item.id));
    const actualIds = uniqueStrings(actualRecall.items.map(item => item.id));
    const actualSet = new Set(actualIds);
    const hitIds = expectedIds.filter(id => actualSet.has(id));
    const relevantSet = new Set(expectedIds);
    const relevantSelected = actualIds.filter(id => relevantSet.has(id));

    const turn = Math.max(0, Math.trunc(Number(caseItem?.turn)) || 0);
    const fromTurn = Math.max(1, Math.trunc(Number(caseItem?.trimmedFromTurn)) || 1);
    const toTurn = Number.isFinite(Number(caseItem?.trimmedToTurn))
      ? Math.max(0, Math.trunc(Number(caseItem.trimmedToTurn)))
      : Math.max(0, turn - dataset.config.recentTurns);
    const coverage = buildMemoryCoverageLine({ summaryRows, fromTurn, toTurn });

    const assistantText = resolveAssistantText(caseItem, dataset.messages);
    const assistantReferences = Object.prototype.hasOwnProperty.call(caseItem, 'assistantReferencedRowIds')
      ? uniqueStrings(caseItem.assistantReferencedRowIds)
      : uniqueStrings(buildMemoryKeywordRecallPlan({
          rows: dataset.rows,
          tableById,
          queryText: assistantText,
          tokenBudget: Number.POSITIVE_INFINITY,
          maxRows: Number.POSITIVE_INFINITY,
          tokenMode: dataset.config.tokenMode,
        }).items.map(item => item.id));
    const injectedIds = Object.prototype.hasOwnProperty.call(caseItem, 'injectedRowIds')
      ? uniqueStrings(caseItem.injectedRowIds)
      : uniqueStrings([...workingRowIds, ...actualIds]);
    const injectedSet = new Set(injectedIds);
    const conflictIds = assistantReferences.filter(id => !injectedSet.has(id));

    coverageCovered += coverage.coveredTurns;
    coverageTarget += coverage.targetTurns;
    recallExpected += expectedIds.length;
    recallHits += hitIds.length;
    recallSelected += actualIds.length;
    recallRelevantSelected += relevantSelected.length;
    consistencyReferences += assistantReferences.length;
    consistencyConflicts += conflictIds.length;
    caseResults.push({
      id: String(caseItem?.id || `case-${caseIndex + 1}`),
      turn,
      queryText,
      coverage,
      recall: {
        expectedRowIds: expectedIds,
        selectedRowIds: actualIds,
        hitRowIds: hitIds,
        missedRowIds: expectedIds.filter(id => !actualSet.has(id)),
        hitRate: ratio(hitIds.length, expectedIds.length),
        precision: ratio(relevantSelected.length, actualIds.length),
        usedTokens: actualRecall.tokens,
        quotaTokens: actualRecall.quotaTokens,
        matchedTerms: actualRecall.items.flatMap(item => item.matchedTerms || []),
      },
      consistency: {
        assistantReferencedRowIds: assistantReferences,
        injectedRowIds: injectedIds,
        conflictRowIds: conflictIds,
        conflictRate: ratio(conflictIds.length, assistantReferences.length),
      },
    });
  });

  return {
    schemaVersion: 1,
    source: dataset.source,
    evaluatedAt: new Date().toISOString(),
    config: dataset.config,
    totals: {
      messages: dataset.messages.length,
      memoryRows: dataset.rows.length,
      replayCases: caseResults.length,
      workingRows: limitedWorkingRows.length,
      recallCandidateRows: recallRows.length,
    },
    metrics: {
      coverage: {
        coveredTurns: coverageCovered,
        targetTurns: coverageTarget,
        holes: caseResults.reduce((sum, item) => sum + item.coverage.holes.length, 0),
        rate: ratio(coverageCovered, coverageTarget),
        pass: coverageTarget === 0 || coverageCovered === coverageTarget,
      },
      recall: {
        expectedRows: recallExpected,
        hitRows: recallHits,
        missedRows: Math.max(0, recallExpected - recallHits),
        selectedRows: recallSelected,
        hitRate: ratio(recallHits, recallExpected),
        precision: ratio(recallRelevantSelected, recallSelected),
      },
      consistency: {
        assistantReferences: consistencyReferences,
        conflicts: consistencyConflicts,
        conflictRate: ratio(consistencyConflicts, consistencyReferences),
      },
    },
    cases: caseResults,
  };
};

const parseArgs = (argv = []) => {
  const args = [...argv];
  const options = {
    input: '',
    out: '',
    pretty: false,
    failOnCoverage: false,
    help: false,
  };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--out') options.out = String(args.shift() || '');
    else if (arg === '--pretty') options.pretty = true;
    else if (arg === '--fail-on-coverage') options.failOnCoverage = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (!options.input) options.input = String(arg || '');
    else throw new Error(`未知参数：${arg}`);
  }
  return options;
};

const printHelp = () => {
  process.stdout.write([
    '用法：node scripts/evaluate-memory-replay.mjs <会话数据.json> [--out 报表.json] [--pretty] [--fail-on-coverage]',
    '',
    '输入至少包含 messages 与 memoryRows（也支持 session.messages、memory.rows、memories 等常见包裹）。',
    '可选 cases 用于人工标注 expectedRecallRowIds、assistantReferencedRowIds、trimmedFromTurn/trimmedToTurn；',
    '未提供 cases 时会按每条用户消息自动回放，预期召回与助手实体引用由本地关键词索引推导。',
    '覆盖率必须为 100%；--fail-on-coverage 可在存在覆盖空洞时返回非零退出码。',
    '',
  ].join('\n'));
};

export const runMemoryReplayCli = async (argv = process.argv.slice(2)) => {
  const options = parseArgs(argv);
  if (options.help || !options.input) {
    printHelp();
    return options.help ? 0 : 2;
  }
  const inputPath = path.resolve(options.input);
  const raw = await fs.readFile(inputPath, 'utf8');
  const report = evaluateMemoryReplay(JSON.parse(raw));
  const output = `${JSON.stringify(report, null, options.pretty || options.out ? 2 : 0)}\n`;
  if (options.out) {
    await fs.writeFile(path.resolve(options.out), output, 'utf8');
  } else {
    process.stdout.write(output);
  }
  if (options.failOnCoverage && !report.metrics.coverage.pass) return 1;
  return 0;
};

const isDirectRun = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;
if (isDirectRun) {
  runMemoryReplayCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`记忆回放评估失败：${String(error?.message || error)}\n`);
      process.exitCode = 1;
    });
}
