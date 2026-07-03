// 女仆/Agent 真机冒烟：对运行中的 dev APP（CDP 9222）依序执行 smoke-scenarios/ 下的场景。
// 用法（Windows node）：node scripts/dev/run-smoke.mjs [--with-ai]
//   默认只跑只读免 token 场景（01-06）；--with-ai 追加 ai- 前缀场景（会调用配置的模型）。
// 每个场景文件是页面上下文表达式，约定返回 { pass: boolean, detail: any }。

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateInApp } from './cdp-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenariosDir = join(__dirname, 'smoke-scenarios');
const withAi = process.argv.includes('--with-ai');

const files = readdirSync(scenariosDir)
  .filter(name => name.endsWith('.js'))
  .filter(name => (withAi ? true : !name.startsWith('ai-')))
  .sort();

const run = async () => {
  let failed = 0;
  for (const file of files) {
    const expression = readFileSync(join(scenariosDir, file), 'utf8').replace(/^﻿/, '');
    const isAi = file.startsWith('ai-');
    const timeoutMs = isAi ? 180000 : 30000;
    const startedAt = Date.now();
    try {
      const result = await evaluateInApp(expression, { timeoutMs });
      const pass = result?.pass === true;
      const ms = Date.now() - startedAt;
      console.log(`[${pass ? 'PASS' : 'FAIL'}] ${file} (${ms}ms)`);
      if (!pass) {
        failed += 1;
        console.log(`       detail: ${JSON.stringify(result?.detail ?? result).slice(0, 400)}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`[FAIL] ${file} (error)`);
      console.log(`       ${err?.message || err}`);
    }
  }
  console.log(`\nsmoke: ${files.length - failed}/${files.length} passed${withAi ? ' (with-ai)' : ''}`);
  process.exit(failed > 0 ? 1 : 0);
};

run();
