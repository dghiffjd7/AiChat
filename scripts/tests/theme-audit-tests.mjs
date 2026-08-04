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

// --- 纸墨主题 Phase 1 兼容契约（源码级） ---
{
  const fs = await import('node:fs');
  const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

  const paperCss = read('src/assets/css/theme-paper-ink.css');
  assert.match(paperCss, /body\[data-theme-preset='paper-ink'\]\s*\{\s*background:\s*linear-gradient/, '纸墨用暖纸渐变整体替换旧背景图');
  assert.ok(!/background-image:\s*none/.test(paperCss), '不得用 background-image:none 误杀渐变');

  const indexHtml = read('src/index.html');
  assert.ok(indexHtml.includes('theme-paper-ink.css'), 'index.html 挂载纸墨兼容 CSS');

  const appSource = read('src/scripts/ui/app.js');
  assert.match(appSource, /PAPER_INK_USER_DEFAULTS\s*=\s*\{\s*bubbleColor:\s*'#F6E9E1'/, '纸墨用户气泡默认为朱红淡底');
  assert.match(appSource, /if \(isPaperInkThemePreset\(\)\) return \{ \.\.\.PAPER_INK_USER_DEFAULTS \};/, '浅色分支按纸墨预设切默认');
  assert.match(
    appSource,
    /\(isDarkThemeMode\(\) \|\| isPaperInkThemePreset\(\)\) && isLegacyUserDefaultColor\(raw, 'bubble'\)/,
    '纸墨下旧浅蓝默认气泡色重映射，自定义色不受影响',
  );

  const mainCss = read('src/assets/css/main.css');
  assert.ok(!/rgba\(37, 99, 235,/.test(mainCss.replace(/rgba\(var\(--app-accent-rgb, 37, 99, 235\),/g, '')), 'main.css 固定蓝已 token 化');
  assert.match(read('src/assets/css/qq-legacy.css'), /--qq-color-primary:\s*var\(--app-accent-primary, #199aff\)/, 'qq-legacy 主色跟随 accent token');
  console.log('ok - paper-ink phase-1 compat contracts hold');

  // Phase 2 质感层契约
  assert.match(paperCss, /body\[data-theme-preset='paper-ink'\]::after[\s\S]*fractalNoise/, '纸张噪点覆盖层存在');
  assert.match(paperCss, /::after[\s\S]*pointer-events:\s*none/, '噪点层不拦截交互');
  assert.match(paperCss, /--app-scrollbar-thumb:/, '滚动条走 token 覆盖');
  assert.match(paperCss, /Noto Serif SC/, '衬线标题字族存在');
  assert.match(paperCss, /@keyframes paper-ink-focus-breathe/, 'focus 呼吸动画存在');
  assert.match(paperCss, /animation:\s*paper-ink-focus-breathe/, 'focus 呼吸动画已挂到输入控件');
  console.log('ok - paper-ink phase-2 texture contracts hold');
}
