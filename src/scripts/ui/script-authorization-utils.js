export const buildScriptPermissionLines = (settings = {}) => [
  `读取聊天记录：${settings.scriptAllowReadMessages !== false ? '允许' : '禁用'}`,
  `修改变量：${settings.scriptAllowModifyVariables !== false ? '允许' : '禁用'}`,
  `访问网络：${settings.scriptAllowNetwork === true ? '允许' : '禁用'}`,
];

export const buildScriptAuthorizationMessage = ({
  leadText = '检测到脚本。',
  settings = {},
} = {}) => `${leadText}\n脚本可能需要权限：\n- ${buildScriptPermissionLines(settings).join('\n- ')}`;
