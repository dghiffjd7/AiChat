import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { WRITE_PREVIEW_PROVIDER_MODEL_CONTEXT_TOOLS } from '../../src/scripts/agent/provider-tool-request-schema.js';
import { resolveWritePreviewGatePatch } from '../../src/scripts/agent/write-preview-gate-utils.js';

const previewTools = Array.from(WRITE_PREVIEW_PROVIDER_MODEL_CONTEXT_TOOLS);
const appSource = await readFile(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');

{
  const patch = resolveWritePreviewGatePatch({
    gate: { enabled: false, allowedTools: ['contact_profile.list'] },
    enabling: true,
  });
  assert.deepEqual(patch, {
    enabled: true,
    allowedTools: ['contact_profile.list', ...previewTools],
  });
  console.log('ok - enabling write preview opens the current gate and appends preview tools');
}

{
  const patch = resolveWritePreviewGatePatch({
    gate: { enabled: true, allowedTools: ['contact_profile.list', ...previewTools, 'chat.emit_private'] },
    enabling: false,
  });
  assert.deepEqual(patch, {
    enabled: true,
    allowedTools: ['contact_profile.list', 'chat.emit_private'],
  });
  console.log('ok - disabling write preview removes only preview tools and preserves gate state');
}

{
  const patch = resolveWritePreviewGatePatch({
    gate: { enabled: false, allowedTools: ['contact_profile.list', previewTools[0], 'contact_profile.list', previewTools[0]] },
    enabling: true,
  });
  assert.deepEqual(patch.allowedTools, ['contact_profile.list', ...previewTools]);
  console.log('ok - write preview gate patch de-duplicates existing and appended tools');
}

{
  const patch = resolveWritePreviewGatePatch({
    gate: { enabled: false, allowedTools: ['custom.beta', '', 'custom.alpha'] },
    enabling: false,
  });
  assert.deepEqual(patch, {
    enabled: false,
    allowedTools: ['custom.beta', 'custom.alpha'],
  });
  console.log('ok - write preview gate patch keeps existing non-preview tool order');
}

{
  assert.match(
    appSource,
    /setAgentFeatureEnabled:\s*async[\s\S]*?agentFeatureSettingsStore\.setEnabled[\s\S]*?resolveWritePreviewGatePatch\([\s\S]*?readCurrentProviderToolSessionGate\(\)[\s\S]*?writeCurrentProviderToolSessionGate\(/,
  );
  assert.match(appSource, /source:\s*'agent_feature_toggle'/);
  console.log('ok - app registry action owns the required write preview gate side effect');
}
