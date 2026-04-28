import assert from 'node:assert/strict';
import {
  analyzeThemeAuditContent,
  compareThemeAuditBaseline,
} from '../utils/theme-audit-core.mjs';

{
  const findings = analyzeThemeAuditContent(`
    .card { background: #fff; color: #0f172a; border: 1px solid #e2e8f0; }
  `, { filePath: 'src/assets/css/demo.css' });
  assert.equal(findings.length, 3);
  assert.equal(findings[0].category, 'light-background');
  assert.equal(findings[1].category, 'light-border');
  assert.equal(findings[2].category, 'dark-text');
}

{
  const findings = analyzeThemeAuditContent(`
    button { background:#fff; } /* theme-audit-ignore */
    .title { color:#0f172a; }
  `, { filePath: 'src/assets/css/demo.css' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, 'dark-text');
}

{
  const findings = analyzeThemeAuditContent(`
    .card { background: var(--app-surface-card, #fff); color: var(--app-text-primary, #333); }
  `, { filePath: 'src/assets/css/demo.css' });
  assert.equal(findings.length, 0);
}

{
  const findings = analyzeThemeAuditContent(`
    .title { background:none; white-space: nowrap; }
  `, { filePath: 'src/assets/css/demo.css' });
  assert.equal(findings.length, 0);
}

{
  const current = [
    { fingerprint: 'a' },
    { fingerprint: 'b' },
  ];
  const diff = compareThemeAuditBaseline(current, ['b', 'c']);
  assert.deepEqual(diff.added, ['a']);
  assert.deepEqual(diff.removed, ['c']);
}

console.log('ok - theme audit core detects risky literals and baseline drift');
