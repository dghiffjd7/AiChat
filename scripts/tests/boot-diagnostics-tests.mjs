import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const {
  BOOT_DIAG_KEY,
  getBootDiag,
  markBootPhase,
  recordInvokeResult,
  recordBootError,
  buildBootDiagReport,
} = await import('../../src/scripts/utils/boot-diagnostics.js');

{
  // 复用 index.html 内联引导先建好的对象，不覆盖其早期错误
  const target = { [BOOT_DIAG_KEY]: { startedAt: 1000, errors: [{ at: 5, message: 'early SyntaxError' }] } };
  const diag = getBootDiag(target);
  assert.equal(diag, target[BOOT_DIAG_KEY]);
  assert.deepEqual(diag.phases, []);
  assert.equal(diag.errors[0].message, 'early SyntaxError');
  assert.equal(diag.invoke.timeout, 0);
  console.log('ok - boot diag reuses the inline bootstrap object and keeps early errors');
}

{
  const target = {};
  markBootPhase('module-evaluated', { target });
  markBootPhase('init-app', { target, detail: 'x' });
  recordInvokeResult({ cmd: 'load_kv', status: 'ok' }, { target });
  recordInvokeResult({ cmd: 'load_kv', status: 'timeout' }, { target });
  recordInvokeResult({ cmd: 'save_kv', status: 'error', message: 'boom' }, { target });
  recordBootError('App init failed: nope', { target });
  const diag = target[BOOT_DIAG_KEY];
  assert.equal(diag.moduleLoaded, true);
  assert.equal(diag.runtimeReady, false);
  assert.deepEqual(diag.phases.map(p => p.name), ['module-evaluated', 'init-app']);
  assert.deepEqual([diag.invoke.ok, diag.invoke.timeout, diag.invoke.error], [1, 1, 1]);
  assert.equal(diag.invoke.lastTimeout, 'load_kv');
  assert.match(diag.invoke.lastError, /save_kv: boom/);
  markBootPhase('done', { target });
  assert.equal(diag.runtimeReady, true);
  const report = buildBootDiagReport(diag, { userAgent: 'UA-TEST', version: '0.7.1', at: diag.startedAt + 25000 });
  assert.match(report, /v0\.7\.1/);
  assert.match(report, /耗时: 25s \| 主模块: 已加载 \| 运行时就绪: 是/);
  assert.match(report, /module-evaluated@0\.0s > init-app@0\.0s\(x\)/);
  assert.match(report, /timeout=1/);
  assert.match(report, /最近超时=load_kv/);
  assert.match(report, /App init failed: nope/);
  assert.match(report, /UA: UA-TEST/);
  console.log('ok - boot diag records phases, invoke outcomes, errors and renders a report');
}

{
  const html = await readFile(new URL('../../src/index.html', import.meta.url), 'utf8');
  const bootstrapIdx = html.indexOf('<script id="app-boot-diagnostics-bootstrap">');
  const polyfillIdx = html.indexOf('<script id="app-legacy-polyfills">');
  const splashThemeIdx = html.indexOf('<script id="app-startup-splash-theme">');
  const watchdogIdx = html.indexOf('<script id="app-boot-watchdog">');
  const moduleIdx = html.indexOf('<script type="module" src="./scripts/ui/app.js">');
  assert.ok(bootstrapIdx >= 0 && splashThemeIdx > bootstrapIdx, '诊断引导必须是最早的内联脚本');
  assert.ok(polyfillIdx > bootstrapIdx && polyfillIdx < splashThemeIdx, '旧内核垫片必须紧随诊断引导、先于其它脚本');
  assert.ok(watchdogIdx > 0 && watchdogIdx < moduleIdx, '看门狗必须在主模块脚本之前定义');
  for (const id of ['app-boot-diagnostics-bootstrap', 'app-legacy-polyfills', 'app-boot-watchdog']) {
    const block = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`))?.[1] || '';
    assert.ok(block.length > 0, `${id} 必须存在`);
    assert.doesNotMatch(block, /\?\.|\?\?|`|=>/, `${id} 必须保持 ES2015 以内写法，旧内核也要能解析`);
  }
  assert.match(html, /window\.addEventListener\('error'/);
  assert.match(html, /window\.addEventListener\('unhandledrejection'/);
  assert.match(html, /getElementById\('app-splash'\)/);
  assert.match(html, /复制诊断信息/);
  console.log('ok - index.html ships an early error capture and a splash watchdog in legacy-safe syntax');
}

{
  // 旧内核垫片：在删掉原生实现的 vm 环境里真实执行 inline 块，验证行为与不可枚举安装
  const html = await readFile(new URL('../../src/index.html', import.meta.url), 'utf8');
  const block = html.match(/<script id="app-legacy-polyfills">([\s\S]*?)<\/script>/)?.[1] || '';
  assert.ok(block.length > 0, 'app-legacy-polyfills 必须存在');
  assert.match(block, /typeof Object\.hasOwn !== 'function'/, '垫片必须条件安装，不能覆盖原生实现');
  const context = vm.createContext({});
  vm.runInContext('delete Object.hasOwn; delete Array.prototype.findLast; delete Array.prototype.findLastIndex;', context);
  assert.equal(vm.runInContext('typeof Object.hasOwn', context), 'undefined');
  vm.runInContext(block, context);
  const out = JSON.parse(vm.runInContext(`JSON.stringify({
    hasOwnTrue: Object.hasOwn({ a: 1 }, 'a'),
    hasOwnFalse: Object.hasOwn({ a: 1 }, 'b'),
    hasOwnProto: Object.hasOwn({}, 'toString'),
    findLast: [1, 2, 3, 4].findLast(function (v) { return v % 2 === 1; }),
    findLastIndex: [1, 2, 3, 4].findLastIndex(function (v) { return v % 2 === 1; }),
    findLastMiss: String([2, 4].findLast(function (v) { return v > 9; })),
    findLastIndexMiss: [2, 4].findLastIndex(function (v) { return v > 9; }),
    forInKeys: (function () { var seen = []; for (var k in [1]) seen.push(k); return seen.join(','); })()
  })`, context));
  assert.deepEqual(out, {
    hasOwnTrue: true,
    hasOwnFalse: false,
    hasOwnProto: false,
    findLast: 3,
    findLastIndex: 2,
    findLastMiss: 'undefined',
    findLastIndexMiss: -1,
    forInKeys: '0',
  });
  console.log('ok - legacy polyfills install conditionally and behave like the native APIs');
}

{
  const tauri = await readFile(new URL('../../src/scripts/utils/tauri.js', import.meta.url), 'utf8');
  assert.match(tauri, /recordInvokeResult\(\{ cmd, status: 'ok' \}\)/);
  assert.match(tauri, /status: message\.startsWith\('tauri_invoke_timeout:'\) \? 'timeout' : 'error'/);
  assert.match(tauri, /'Tauri invoke not available' \}\)/);
  const app = await readFile(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');
  for (const phase of ['module-evaluated', 'dom-ready', 'settings-hydrate', 'init-app', 'persona-user-ready', 'scope-stores', 'preset-store', 'maid-stores', 'restore-ui', 'done']) {
    assert.ok(app.includes(`markBootPhase('${phase}')`), `app.js 必须打点 ${phase}`);
  }
  assert.ok(app.indexOf("markBootPhase('done')") < app.indexOf("const splash = document.getElementById('app-splash');"), 'done 必须在移除 splash 之前标记');
  assert.match(app, /recordBootError\(`App init failed: /);
  console.log('ok - safeInvoke and app boot publish diagnostics for the watchdog');
}

console.log('boot-diagnostics-tests passed');
