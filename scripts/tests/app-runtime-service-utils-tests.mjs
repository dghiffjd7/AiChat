import assert from 'node:assert/strict';

import { getPluginRuntime } from '../../src/scripts/ui/app-runtime-service-utils.js';

{
  const pluginRuntime = { id: 'plugin-runtime' };
  const bridge = {
    pluginRuntime: { id: 'legacy-plugin-runtime' },
    getPluginRuntime: () => pluginRuntime,
  };
  assert.equal(getPluginRuntime(bridge), pluginRuntime);
  console.log('ok - app runtime service helper prefers plugin runtime getter');
}

{
  const legacy = { id: 'legacy-plugin-runtime' };
  assert.equal(getPluginRuntime({ pluginRuntime: legacy }), legacy);
  assert.equal(getPluginRuntime(null), null);
  console.log('ok - app runtime service helper keeps legacy plugin runtime fallback');
}
