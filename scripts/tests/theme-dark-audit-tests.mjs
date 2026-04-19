import assert from 'node:assert/strict';
import {
  averageColors,
  contrastRatio,
  extractColorsFromBackgroundImage,
  parseCssColor,
  relativeLuminance,
} from '../../src/scripts/ui/theme-dark-audit.js';

{
  const color = parseCssColor('#f8fafc');
  assert.deepEqual(color, { r: 248, g: 250, b: 252, a: 1 });
}

{
  const color = parseCssColor('rgba(15, 23, 42, 0.38)');
  assert.equal(color.r, 15);
  assert.equal(color.g, 23);
  assert.equal(color.b, 42);
  assert.equal(color.a, 0.38);
}

{
  const colors = extractColorsFromBackgroundImage('linear-gradient(180deg, rgb(255, 255, 255) 0%, #f8fafc 100%)');
  assert.equal(colors.length, 2);
  const avg = averageColors(colors);
  assert.equal(avg.a, 1);
  assert.ok(avg.r >= 248);
  assert.ok(avg.g >= 250);
}

{
  const white = parseCssColor('#ffffff');
  const dark = parseCssColor('#0f172a');
  assert.ok(relativeLuminance(white) > relativeLuminance(dark));
  assert.ok(contrastRatio(white, dark) > 10);
}

console.log('ok - dark theme runtime audit helpers detect colors and contrast');
