import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { analyzeThemeAuditContent } from '../utils/theme-audit-core.mjs';

const fileUrl = new URL('../../src/scripts/ui/moments-panel.js', import.meta.url);
const content = await fs.readFile(fileUrl, 'utf8');
const findings = analyzeThemeAuditContent(content, {
  filePath: 'src/scripts/ui/moments-panel.js',
});

assert.deepEqual(findings, []);

console.log('ok - moments panel avoids hardcoded light-theme literals');
