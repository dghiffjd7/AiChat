import { validateExpressionSyntax } from './safe-expression-evaluator.js';

export const EXPRESSION_SUPPORT_GUIDANCE =
  '请改写为变量、括号、逻辑/比较/四则运算；不支持函数调用、可选链、空值合并、三元表达式。';

export const getExpressionCompatibilityDiagnostic = (expression = '') => {
  const expr = String(expression || '').trim();
  if (!expr) return null;
  const result = validateExpressionSyntax(expr);
  if (result.ok) return null;
  return {
    expression: expr,
    error: result.error || 'unsupported expression syntax',
  };
};

export const formatUnsupportedExpressionMessage = (diagnosticOrError, {
  prefix = '当前不支持这类条件语法',
} = {}) => {
  const error = typeof diagnosticOrError === 'string'
    ? String(diagnosticOrError || '').trim()
    : String(diagnosticOrError?.error || '').trim();
  if (!error) return `${prefix}。${EXPRESSION_SUPPORT_GUIDANCE}`;
  return `${prefix}：${error}。${EXPRESSION_SUPPORT_GUIDANCE}`;
};

export const buildRuleConditionDiagnostics = (rules = []) => {
  const out = {};
  const list = Array.isArray(rules) ? rules : [];
  list.forEach((rule, index) => {
    if (String(rule?.trigger?.type || '').trim().toLowerCase() !== 'condition') return;
    const id = String(rule?.id || `rule_${index + 1}`);
    const diagnostic = getExpressionCompatibilityDiagnostic(rule?.trigger?.expr);
    if (diagnostic) out[id] = diagnostic;
  });
  return out;
};

export const buildStageConditionDiagnostics = (schema = null) => {
  const out = {};
  const stages = Array.isArray(schema?.stages) ? schema.stages : [];
  stages.forEach((stage, index) => {
    const id = String(stage?.id || `stage_${index + 1}`);
    const diagnostic = getExpressionCompatibilityDiagnostic(stage?.condition);
    if (diagnostic) out[id] = diagnostic;
  });
  return out;
};
