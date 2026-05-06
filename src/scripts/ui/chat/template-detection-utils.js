export const containsTemplateSyntax = (value) => {
  if (!value) return false;
  if (typeof value === 'string') return value.includes('<%');
  if (Array.isArray(value)) return value.some(containsTemplateSyntax);
  if (typeof value === 'object') {
    if (containsTemplateSyntax(value.content)) return true;
    if (containsTemplateSyntax(value.text)) return true;
  }
  return false;
};

export const hasTemplateInMessages = (messages) => {
  if (!Array.isArray(messages)) return false;
  return messages.some(message => containsTemplateSyntax(message?.content ?? message));
};
