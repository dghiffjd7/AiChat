#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  compareThemeAuditBaseline,
  runThemeSourceAudit,
} from './utils/theme-audit-core.mjs';

const cwd = process.cwd();
const baselinePath = path.resolve(cwd, 'scripts/theme-audit-baseline.json');
const args = new Set(process.argv.slice(2));
const jsonMode = args.has('--json');
const updateBaseline = args.has('--update-baseline');

const sortObject = (value = {}) => Object.fromEntries(
  Object.entries(value || {}).sort((a, b) => a[0].localeCompare(b[0])),
);

const print = (message = '') => process.stdout.write(`${message}\n`);

const buildBaselinePayload = (report) => ({
  version: 1,
  generatedAt: new Date().toISOString(),
  scannedFiles: Number(report?.scannedFiles || 0),
  summary: {
    total: Number(report?.summary?.total || 0),
    byCategory: sortObject(report?.summary?.byCategory || {}),
    byFile: sortObject(report?.summary?.byFile || {}),
  },
  fingerprints: (Array.isArray(report?.findings) ? report.findings : [])
    .map((item) => String(item?.fingerprint || ''))
    .filter(Boolean)
    .sort(),
});

const formatFinding = (item) => {
  const file = String(item?.file || '');
  const line = Number(item?.line || 0);
  const category = String(item?.categoryLabel || item?.category || '');
  const token = String(item?.token || '');
  const snippet = String(item?.lineText || '');
  return `- ${file}:${line} [${category}] ${token}\n  ${snippet}`;
};

async function loadBaseline() {
  try {
    const raw = await fs.readFile(baselinePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const report = await runThemeSourceAudit(cwd);
  const payload = buildBaselinePayload(report);

  if (jsonMode) {
    print(JSON.stringify({
      ...payload,
      findings: report.findings,
    }, null, 2));
    return;
  }

  if (updateBaseline) {
    await fs.writeFile(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    print(`[theme-audit] baseline updated: ${path.relative(cwd, baselinePath).replace(/\\/g, '/')}`);
    print(`[theme-audit] scanned files: ${payload.scannedFiles}`);
    print(`[theme-audit] findings: ${payload.summary.total}`);
    return;
  }

  const baseline = await loadBaseline();
  if (!baseline) {
    print('[theme-audit] baseline not found');
    print('[theme-audit] run `npm run audit:theme:update` to create the initial baseline');
    process.exitCode = payload.summary.total > 0 ? 1 : 0;
    return;
  }

  const diff = compareThemeAuditBaseline(report.findings, baseline.fingerprints || []);
  const byCategory = Object.entries(payload.summary.byCategory || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');

  print(`[theme-audit] scanned files: ${payload.scannedFiles}`);
  print(`[theme-audit] findings: ${payload.summary.total}${byCategory ? ` (${byCategory})` : ''}`);
  print(`[theme-audit] baseline: ${Array.isArray(baseline.fingerprints) ? baseline.fingerprints.length : 0}`);

  if (!diff.added.length) {
    print('[theme-audit] no new theme-risk findings');
    if (diff.removed.length) {
      print(`[theme-audit] removed findings detected: ${diff.removed.length}`);
      print('[theme-audit] run `npm run audit:theme:update` when you want to refresh the baseline');
    }
    return;
  }

  const fingerprintToFinding = new Map(report.findings.map((item) => [item.fingerprint, item]));
  print(`[theme-audit] new findings: ${diff.added.length}`);
  diff.added.slice(0, 40).forEach((fingerprint) => {
    const finding = fingerprintToFinding.get(fingerprint);
    if (finding) print(formatFinding(finding));
  });
  if (diff.added.length > 40) {
    print(`[theme-audit] ... truncated ${diff.added.length - 40} more findings`);
  }
  print('[theme-audit] fix the new literals or refresh the baseline if the new findings are intentional');
  process.exitCode = 1;
}

main().catch((err) => {
  const msg = err?.stack || err?.message || String(err || 'unknown error');
  process.stderr.write(`${msg}\n`);
  process.exitCode = 1;
});
