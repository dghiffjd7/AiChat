import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const generalSettingsSource = read('../../src/scripts/ui/general-settings-panel.js');
const themeExportStart = generalSettingsSource.indexOf("this.themeExportBtn?.addEventListener('click'");
const themeExportEnd = generalSettingsSource.indexOf("this.debugToggle?.addEventListener('change'", themeExportStart);
const themeExportBlock = generalSettingsSource.slice(themeExportStart, themeExportEnd);

assert.ok(themeExportStart >= 0 && themeExportEnd > themeExportStart, 'theme export handler should be discoverable');
assert.match(themeExportBlock, /safeInvoke\('export_attachment'/);
assert.match(themeExportBlock, /data:application\/json;base64/);
assert.doesNotMatch(themeExportBlock, /save_attachment_bytes|theme-export/);

console.log('ok - mobile theme export publishes JSON through the shared download command');
