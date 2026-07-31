import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const target = String(process.argv[2] || '').trim();
const output = resolve(String(process.argv[3] || '').trim());
if (!target || !output) {
  throw new Error('usage: capture-contact-avatar.mjs <contact-name> <output-path>');
}

const dataUrl = await evaluateInApp(`(() => {
  const store = window.appBridge?.debugUiRegistry?.stores?.contactsStore;
  return String(store?.getContact?.(${JSON.stringify(target)})?.avatar || '');
})()`);
const match = String(dataUrl || '').match(/^data:([^;,]+);base64,([\s\S]+)$/);
if (!match) throw new Error(`contact avatar is not a base64 data URL: ${target}`);
writeFileSync(output, Buffer.from(match[2], 'base64'));
console.log(JSON.stringify({
  target,
  output,
  mime: match[1],
  bytes: Buffer.byteLength(match[2], 'base64'),
}));
