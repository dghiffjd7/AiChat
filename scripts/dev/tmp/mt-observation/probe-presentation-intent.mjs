import { classifyMaidPresentationIntent } from '../../../../src/scripts/agent/maid-assistant-agent.js';

const cases = [
  '不要打开页面。',
  '不要逐房重复绑定或打开页面。',
  '重复执行幂等核对；不要逐房重复绑定或打开页面。',
];

console.log(JSON.stringify(cases.map(input => ({
  input,
  result: classifyMaidPresentationIntent(input),
})), null, 2));
