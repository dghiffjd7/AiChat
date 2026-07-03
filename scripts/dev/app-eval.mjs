// 在运行中的 dev APP（WebView2，--remote-debugging-port=9222）里执行 JS 并打印结果。
// 用法：node scripts/dev/app-eval.mjs "<expression>" | @expr-file.js
// 表达式在 APP 页面上下文求值，支持 await；结果以 JSON 输出。
// 超时：环境变量 CDP_TIMEOUT_MS（默认 30000）。

import { readFileSync } from 'node:fs';
import { evaluateInApp } from './cdp-client.mjs';

const main = async () => {
  let expression = process.argv[2];
  if (!expression) {
    console.error('usage: node scripts/dev/app-eval.mjs "<js expression>" | @expr-file.js');
    process.exit(1);
  }
  if (expression.startsWith('@')) {
    expression = readFileSync(expression.slice(1), 'utf8').replace(/^﻿/, '');
  }
  const timeoutMs = Math.max(5000, Number(process.env.CDP_TIMEOUT_MS || 30000) || 30000);
  try {
    const value = await evaluateInApp(expression, { timeoutMs });
    console.log(JSON.stringify(value ?? null, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err?.message || String(err));
    process.exit(err?.message?.includes('timed out') ? 3 : 2);
  }
};

main();
