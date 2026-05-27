import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const {
  prepareRichFragmentDisplayHtmlForParsing,
  prepareRichFragmentHtmlForParsing,
} = await import('../../src/scripts/ui/chat/rich-text-renderer.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('keeps iframe diagnostic regex escapes inside generated srcdoc script', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/scripts/ui/chat/rich-text-renderer.js'), 'utf8');
  assert.ok(source.includes("replace(/\\\\s+/g, ' ').trim()"));
  assert.ok(source.includes('const contentHasBr = /<br\\\\s*\\\\/?>/i.test(contentHtml) ? 1 : 0;'));
  assert.ok(source.includes("match(/\\\\[旁白\\\\]\\\\|/g)"));
});

test('keeps balanced style scaffolds intact', () => {
  const input = '<style>.pf-wrap{display:block}</style><details><summary>cot</summary><div>body</div></details>';
  assert.equal(prepareRichFragmentHtmlForParsing(input), input);
});

test('escapes literal unclosed style mentions inside rich fragments', () => {
  const input = [
    '<style>.pf-wrap{display:block}</style>',
    '<details class="pf-wrap"><summary>cot</summary><div>',
    '同时根据<style>中的Baseline_Anchors，保持中景镜头。',
    '</div></details>',
    '<p>正文仍应显示</p>',
  ].join('');
  const output = prepareRichFragmentHtmlForParsing(input);
  assert.match(output, /^<style>\.pf-wrap/);
  assert.match(output, /根据&lt;style&gt;中的Baseline_Anchors/);
  assert.match(output, /<p>正文仍应显示<\/p>/);
});

test('escapes unsupported protocol tags as text in rich fragments', () => {
  const input = '<details><summary>cot</summary><div>正文用<content></content>包裹，末尾有<ztl>状态</ztl></div></details>';
  const output = prepareRichFragmentHtmlForParsing(input);
  assert.match(output, /正文用&lt;content&gt;&lt;\/content&gt;包裹/);
  assert.match(output, /末尾有&lt;ztl&gt;状态&lt;\/ztl&gt;/);
});

test('hides creative content wrapper before rich fragment display parsing', () => {
  const input = '<content><details><summary>cot</summary><div>正文</div></details></content>';
  const output = prepareRichFragmentDisplayHtmlForParsing(input);
  assert.equal(output, '<details><summary>cot</summary><div>正文</div></details>');
});

test('hides escaped creative content wrapper before display fallback', () => {
  const input = '&lt;content type=&quot;story&quot;&gt;正文&lt;/content&gt;';
  const output = prepareRichFragmentDisplayHtmlForParsing(input);
  assert.equal(output, '正文');
});

test('does not let a stray raw-text tag claim a later valid block', () => {
  const input = '说明<script>只是字面量<style>.x{color:red}</style><div>尾部</div>';
  const output = prepareRichFragmentHtmlForParsing(input);
  assert.match(output, /说明&lt;script&gt;只是字面量/);
  assert.match(output, /<style>\.x\{color:red\}<\/style>/);
  assert.match(output, /<div>尾部<\/div>/);
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
process.exit(0);
