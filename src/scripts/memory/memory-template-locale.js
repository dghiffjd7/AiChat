import { translateUiText } from '../i18n/index.js';
import { DEFAULT_MEMORY_TEMPLATE } from './default-template.js';

const clone = value => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const sameText = (left, right) => String(left ?? '').replace(/\r\n?/g, '\n')
  === String(right ?? '').replace(/\r\n?/g, '\n');

const replaceExact = (value, source, target) => (
  typeof value === 'string' && typeof source === 'string' && sameText(value, source)
    ? target
    : value
);

const buildLocalizedDefinition = (translate) => {
  const next = clone(DEFAULT_MEMORY_TEMPLATE);
  for (const key of ['name', 'author', 'description']) next.meta[key] = translate(next.meta[key]);
  next.meta.tags = next.meta.tags.map(translate);
  next.tables.forEach((table) => {
    table.name = translate(table.name);
    for (const key of ['note', 'initNode', 'insertNode', 'updateNode', 'deleteNode']) {
      if (typeof table.sourceData?.[key] === 'string') table.sourceData[key] = translate(table.sourceData[key]);
    }
    table.columns.forEach((column) => {
      column.name = translate(column.name);
      // options are persisted enum values. Renderers translate their labels without changing stored values.
    });
  });
  return next;
};

const transformOfficialRecord = (input, sourceDefinition, targetDefinition) => {
  const next = clone(input && typeof input === 'object' ? input : {});
  const isRecord = Boolean(next.schema && typeof next.schema === 'object');
  const definition = isRecord ? next.schema : next;
  const templateId = String(definition?.meta?.id || next?.id || '').trim();
  if ((isRecord && next?.is_builtin !== true) || templateId !== DEFAULT_MEMORY_TEMPLATE.meta.id) return next;

  definition.meta ||= {};
  for (const key of ['name', 'author', 'description']) {
    definition.meta[key] = replaceExact(definition.meta[key], sourceDefinition.meta[key], targetDefinition.meta[key]);
  }
  if (Array.isArray(definition.meta.tags)) {
    definition.meta.tags = definition.meta.tags.map((value, index) => (
      replaceExact(value, sourceDefinition.meta.tags?.[index], targetDefinition.meta.tags?.[index])
    ));
  }

  const sourceTables = new Map(sourceDefinition.tables.map(table => [String(table.id || ''), table]));
  const targetTables = new Map(targetDefinition.tables.map(table => [String(table.id || ''), table]));
  definition.tables = (Array.isArray(definition.tables) ? definition.tables : []).map((table) => {
    const tableNext = clone(table);
    const sourceTable = sourceTables.get(String(tableNext?.id || ''));
    const targetTable = targetTables.get(String(tableNext?.id || ''));
    if (!sourceTable || !targetTable) return tableNext;
    tableNext.name = replaceExact(tableNext.name, sourceTable.name, targetTable.name);
    for (const key of ['note', 'initNode', 'insertNode', 'updateNode', 'deleteNode']) {
      if (tableNext.sourceData) {
        tableNext.sourceData[key] = replaceExact(
          tableNext.sourceData[key],
          sourceTable.sourceData?.[key],
          targetTable.sourceData?.[key],
        );
      }
    }
    const sourceColumns = new Map((sourceTable.columns || []).map(column => [String(column.id || ''), column]));
    const targetColumns = new Map((targetTable.columns || []).map(column => [String(column.id || ''), column]));
    tableNext.columns = (Array.isArray(tableNext.columns) ? tableNext.columns : []).map((column) => {
      const columnNext = clone(column);
      const sourceColumn = sourceColumns.get(String(columnNext?.id || ''));
      const targetColumn = targetColumns.get(String(columnNext?.id || ''));
      if (sourceColumn && targetColumn) {
        columnNext.name = replaceExact(columnNext.name, sourceColumn.name, targetColumn.name);
      }
      return columnNext;
    });
    return tableNext;
  });

  if (isRecord) {
    for (const key of ['name', 'author', 'description']) {
      next[key] = replaceExact(next[key], sourceDefinition.meta[key], targetDefinition.meta[key]);
    }
  }
  return next;
};

export const localizeOfficialMemoryTemplateRecord = (
  record,
  translate = translateUiText,
) => transformOfficialRecord(record, DEFAULT_MEMORY_TEMPLATE, buildLocalizedDefinition(translate));

export const canonicalizeOfficialMemoryTemplateRecord = (
  record,
  translate = translateUiText,
) => transformOfficialRecord(record, buildLocalizedDefinition(translate), DEFAULT_MEMORY_TEMPLATE);
