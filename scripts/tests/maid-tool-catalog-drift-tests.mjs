import assert from 'node:assert/strict';

import { createAgentToolRegistry } from '../../src/scripts/agent/agent-tool-registry.js';
import { listAppFeatures } from '../../src/scripts/agent/app-feature-catalog.js';
import { registerAppNavigationAgentTools } from '../../src/scripts/agent/tools/app-navigation-tools.js';
import { registerAppSessionAgentTools } from '../../src/scripts/agent/tools/app-session-tools.js';
import { registerAppContentAgentTools } from '../../src/scripts/agent/tools/app-content-tools.js';
import { registerMaidMediaAssetTools } from '../../src/scripts/agent/tools/media-asset-tools.js';
import { registerAppUiCaptureTools } from '../../src/scripts/agent/tools/app-ui-capture-tools.js';
import { registerMaidTodoTools } from '../../src/scripts/agent/tools/maid-todo-tools.js';
import { registerGuideStartFlowTools } from '../../src/scripts/agent/tools/guide-start-flow-tools.js';
import { registerChatFormatRepairTools } from '../../src/scripts/agent/tools/chat-format-tools.js';
import { registerWebSearchAgentTools } from '../../src/scripts/agent/tools/web-search-tools.js';
import { registerMomentsAgentTools } from '../../src/scripts/agent/tools/moments-tools.js';

// 已注册但不进入功能目录的元工具/本地工具。
// 新工具默认必须进目录；确需豁免时在这里登记并写明原因。
const CATALOG_EXEMPT_TOOLS = new Set([]);

const registry = createAgentToolRegistry();
registerAppNavigationAgentTools(registry, {});
registerAppSessionAgentTools(registry, {});
registerAppContentAgentTools(registry, {});
registerMaidMediaAssetTools(registry, {});
registerAppUiCaptureTools(registry, {});
registerMaidTodoTools(registry, {});
registerGuideStartFlowTools(registry, {});
registerChatFormatRepairTools(registry, {});
registerWebSearchAgentTools(registry, {});
registerMomentsAgentTools(registry, {});

const registeredNames = new Set(registry.listTools().map(tool => tool.name));
const features = listAppFeatures();
const catalogToolNames = new Set(
  features.flatMap(feature => (Array.isArray(feature.tools) ? feature.tools : [])),
);

{
  const missingInRegistry = Array.from(catalogToolNames)
    .filter(name => !registeredNames.has(name));
  assert.deepEqual(
    missingInRegistry,
    [],
    `功能目录引用了未注册的工具：${missingInRegistry.join(', ')}`,
  );
  console.log('ok - 功能目录引用的每个工具都已在 registry 注册');
}

{
  const missingInCatalog = Array.from(registeredNames)
    .filter(name => !catalogToolNames.has(name) && !CATALOG_EXEMPT_TOOLS.has(name));
  assert.deepEqual(
    missingInCatalog,
    [],
    `已注册工具未进入功能目录（如确属元工具请登记豁免并说明原因）：${missingInCatalog.join(', ')}`,
  );
  console.log('ok - 每个已注册女仆工具都在功能目录或豁免清单中');
}

{
  const staleExemptions = Array.from(CATALOG_EXEMPT_TOOLS)
    .filter(name => !registeredNames.has(name) || catalogToolNames.has(name));
  assert.deepEqual(
    staleExemptions,
    [],
    `豁免清单过期（工具已删除或已进目录）：${staleExemptions.join(', ')}`,
  );
  console.log('ok - 豁免清单没有过期条目');
}

{
  const missingVerificationDecl = features
    .filter(feature => feature.writes === true)
    .filter(feature => !Object.prototype.hasOwnProperty.call(feature, 'verification'))
    .map(feature => feature.id);
  assert.deepEqual(
    missingVerificationDecl,
    [],
    `写入类功能必须显式声明 verification（对象或 null）：${missingVerificationDecl.join(', ')}`,
  );
  const invalidVerificationTools = features
    .filter(feature => feature.verification?.tool)
    .filter(feature => !registeredNames.has(feature.verification.tool))
    .map(feature => `${feature.id} -> ${feature.verification.tool}`);
  assert.deepEqual(
    invalidVerificationTools,
    [],
    `verification.tool 指向未注册工具：${invalidVerificationTools.join(', ')}`,
  );
  console.log('ok - 写入类功能都显式声明了 verification 且验证工具已注册');
}

{
  const directActionMissing = features
    .filter(feature => feature.directAction)
    .filter(feature => !registeredNames.has(feature.directAction))
    .map(feature => `${feature.id} -> ${feature.directAction}`);
  assert.deepEqual(
    directActionMissing,
    [],
    `功能目录 directAction 指向未注册工具：${directActionMissing.join(', ')}`,
  );
  console.log('ok - 每个功能的 directAction 都指向已注册工具');
}

console.log('maid-tool-catalog-drift-tests passed');
