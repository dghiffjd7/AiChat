import assert from 'node:assert/strict';

import {
  lazyMigratePresetProfileToAgentCenterSettings,
  mergeImportedAgentCenterSettings,
  migratePresetStateToAgentCenterSettings,
  resolveAgentOpenAIPreset,
  resolveAgentSyspromptPreset,
  setAgentCardEnabled,
  setAgentPromptConfig,
  setMemoryAgentSettings,
} from '../../src/scripts/storage/agent-center-settings-store.js';

{
  const migrated = migratePresetStateToAgentCenterSettings({}, {
    presets: {
      sysprompt: {
        alpha: {
          name: 'Alpha',
          auto_image_prompt_enabled: true,
          auto_image_prompt_rules: 'image rules alpha',
          auto_image_prompt_position: 4,
          auto_image_prompt_depth: 0,
          auto_image_prompt_role: 0,
          summary_enabled: false,
          summary_position: 1,
          summary_rules: 'summary alpha',
        },
        beta: {
          name: 'Beta',
          auto_image_prompt_enabled: false,
          auto_image_prompt_rules: 'image rules beta',
        },
      },
      openai: {
        gen: {
          name: 'Gen',
          memory_data_position: 'history_depth',
          memory_data_depth: 3,
          memory_guide_position: 'before_latest_user',
          memory_guide_depth: 1,
        },
      },
    },
  }, { now: () => 1000 });

  assert.equal(migrated.migrations.presetPromptV1.completed, true);
  assert.equal(migrated.profiles['sysprompt:alpha'].agents.image_director.prompts['auto-image-prompt'].rules, 'image rules alpha');
  assert.equal(migrated.profiles['sysprompt:beta'].agents.image_director.prompts['auto-image-prompt'].enabled, false);
  assert.equal(migrated.profiles['openai:gen'].agents.memory_table_agent.settings.dataPosition, 'history_depth');
  assert.equal(migrated.profiles['openai:gen'].agents.memory_table_agent.settings.dataDepth, 3);
  console.log('ok - agent center settings migrates all sysprompt/openai preset fields');
}

{
  let settings = migratePresetStateToAgentCenterSettings({}, {
    presets: {
      sysprompt: {
        alpha: {
          name: 'Alpha',
          auto_image_prompt_enabled: true,
          auto_image_prompt_rules: 'old image rules',
          auto_image_prompt_position: 4,
          auto_image_prompt_depth: 0,
          auto_image_prompt_role: 0,
        },
      },
      openai: {},
    },
  }, { now: () => 1000 });
  settings = setAgentPromptConfig(settings, {
    profileType: 'sysprompt',
    presetId: 'alpha',
    agentId: 'image_director',
    promptId: 'auto-image-prompt',
    config: {
      enabled: true,
      rules: 'new image rules',
      position: 5,
      depth: 2,
      role: 1,
    },
  }, { now: () => 2000 });
  const resolved = resolveAgentSyspromptPreset(settings, {
    presetId: 'alpha',
    preset: {
      auto_image_prompt_enabled: true,
      auto_image_prompt_rules: 'old image rules',
      auto_image_prompt_position: 4,
      auto_image_prompt_depth: 0,
      auto_image_prompt_role: 0,
    },
  });
  assert.equal(resolved.auto_image_prompt_rules, 'new image rules');
  assert.equal(resolved.auto_image_prompt_position, 5);
  assert.equal(resolved.auto_image_prompt_depth, 2);
  assert.equal(resolved.auto_image_prompt_role, 1);

  const disabled = resolveAgentSyspromptPreset(
    setAgentCardEnabled(settings, 'image_director', false, { now: () => 3000 }),
    {
      presetId: 'alpha',
      preset: {
        auto_image_prompt_enabled: true,
        auto_image_prompt_rules: 'old image rules',
      },
    },
  );
  assert.equal(disabled.auto_image_prompt_enabled, false);
  assert.equal(disabled.auto_image_prompt_rules, 'new image rules');
  console.log('ok - agent center sysprompt resolver prefers new store and respects card disable');
}

{
  let settings = migratePresetStateToAgentCenterSettings({}, {
    presets: {
      sysprompt: {
        alpha: {
          name: 'Alpha',
          summary_enabled: false,
          summary_position: 1,
          summary_rules: 'keep summary rules',
        },
      },
      openai: {},
    },
  }, { now: () => 1000 });
  settings = setAgentPromptConfig(settings, {
    profileType: 'sysprompt',
    presetId: 'alpha',
    agentId: 'summary_agent',
    promptId: 'summary',
    config: {
      position: 2,
    },
  }, { now: () => 2000 });
  const resolved = resolveAgentSyspromptPreset(settings, {
    presetId: 'alpha',
    preset: {
      summary_enabled: true,
      summary_position: 1,
      summary_rules: 'old fallback',
    },
  });
  assert.equal(resolved.summary_enabled, false);
  assert.equal(resolved.summary_rules, 'keep summary rules');
  assert.equal(resolved.summary_position, 2);
  console.log('ok - agent center prompt config patch preserves existing custom fields');
}

{
  let settings = lazyMigratePresetProfileToAgentCenterSettings({}, {
    profileType: 'openai',
    presetId: 'gen',
    preset: {
      memory_data_position: 'before_latest_user',
      memory_data_depth: 0,
      memory_guide_position: '',
      memory_guide_depth: 0,
    },
  });
  settings = setMemoryAgentSettings(settings, {
    presetId: 'gen',
    preset: {},
    config: {
      dataPosition: 'history_depth',
      dataDepth: 4,
      guidePosition: 'after_latest_user',
      guideDepth: 2,
    },
  });
  const resolved = resolveAgentOpenAIPreset(settings, {
    presetId: 'gen',
    preset: {
      memory_data_position: 'before_latest_user',
      memory_data_depth: 0,
      memory_guide_position: '',
      memory_guide_depth: 0,
    },
  });
  assert.equal(resolved.memory_data_position, 'history_depth');
  assert.equal(resolved.memory_data_depth, 4);
  assert.equal(resolved.memory_guide_position, 'after_latest_user');
  assert.equal(resolved.memory_guide_depth, 2);
  console.log('ok - agent center openai resolver applies memory table settings');
}

{
  const imported = migratePresetStateToAgentCenterSettings({}, {
    presets: {
      sysprompt: {
        oldSysp: {
          name: 'Imported Sysprompt',
          summary_rules: 'imported summary',
        },
      },
      openai: {},
    },
  });
  const merged = mergeImportedAgentCenterSettings({}, imported, {
    presetIdMap: { sysprompt: 'newSysp' },
    now: () => 4000,
  });
  assert.equal(merged.profiles['sysprompt:newSysp'].presetId, 'newSysp');
  assert.equal(merged.profiles['sysprompt:newSysp'].agents.summary_agent.prompts.summary.rules, 'imported summary');
  assert.equal(merged.profiles['sysprompt:oldSysp'], undefined);
  console.log('ok - imported agent center settings remap profile ids');
}
