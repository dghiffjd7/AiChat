const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

export const extractOpenAIResponsesText = (data = {}) => {
  if (typeof data?.output_text === 'string') return data.output_text;
  const output = Array.isArray(data?.output) ? data.output : [];
  return output
    .filter(item => trim(item?.type) === 'message')
    .flatMap(item => (Array.isArray(item?.content) ? item.content : []))
    .filter(part => trim(part?.type) === 'output_text' && typeof part?.text === 'string')
    .map(part => part.text)
    .join('');
};

const toOpenAIResponsesContent = (content, role = 'user') => {
  if (!Array.isArray(content)) return String(content ?? '');
  return content.flatMap((part) => {
    if (!isPlainObject(part)) return [];
    const type = trim(part.type);
    if (type === 'input_text' || type === 'input_image' || type === 'output_text') return [clone(part)];
    if (type === 'text') {
      return [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: String(part.text || '') }];
    }
    if (type === 'image_url') {
      const imageUrl = trim(part?.image_url?.url || part?.image_url);
      if (!imageUrl) return [];
      return [{
        type: 'input_image',
        image_url: imageUrl,
        ...(trim(part?.image_url?.detail) ? { detail: trim(part.image_url.detail) } : {}),
      }];
    }
    return [];
  });
};

export const toOpenAIResponsesInput = (messages = []) => (
  (Array.isArray(messages) ? messages : [])
    .filter(message => isPlainObject(message) && trim(message.role))
    .map(message => ({
      role: trim(message.role),
      content: toOpenAIResponsesContent(message.content, trim(message.role)),
    }))
);

export const toOpenAIResponsesTools = (tools = []) => (
  (Array.isArray(tools) ? tools : []).flatMap((tool) => {
    if (!isPlainObject(tool)) return [];
    if (trim(tool.type) === 'function' && trim(tool.name)) return [clone(tool)];
    const fn = isPlainObject(tool.function) ? tool.function : {};
    if (trim(tool.type) !== 'function' || !trim(fn.name)) return [];
    return [{
      type: 'function',
      name: trim(fn.name),
      description: trim(fn.description, trim(fn.name)),
      parameters: isPlainObject(fn.parameters)
        ? clone(fn.parameters)
        : { type: 'object', properties: {} },
      ...(fn.strict === true ? { strict: true } : {}),
    }];
  })
);

export const buildOpenAIResponsesOptions = (options = {}) => {
  const source = isPlainObject(options) ? options : {};
  const out = {};
  const maxOutputTokens = source.max_output_tokens ?? source.max_completion_tokens
    ?? source.max_tokens ?? source.maxTokens;
  if (Number.isFinite(maxOutputTokens)) out.max_output_tokens = Math.max(1, Math.trunc(maxOutputTokens));
  if (Number.isFinite(source.temperature)) out.temperature = source.temperature;
  if (Number.isFinite(source.top_p)) out.top_p = source.top_p;
  if (Object.prototype.hasOwnProperty.call(source, 'tool_choice')) out.tool_choice = clone(source.tool_choice);
  if (typeof source.parallel_tool_calls === 'boolean') out.parallel_tool_calls = source.parallel_tool_calls;
  if (Number.isFinite(source.max_tool_calls)) out.max_tool_calls = Math.max(1, Math.trunc(source.max_tool_calls));
  const tools = toOpenAIResponsesTools(source.tools);
  if (tools.length) out.tools = tools;
  if (isPlainObject(source.reasoning)) out.reasoning = clone(source.reasoning);
  else if (trim(source.reasoning_effort)) out.reasoning = { effort: trim(source.reasoning_effort) };
  return out;
};

export const buildOpenAIResponsesRequestBody = ({
  model = '',
  messages = [],
  input = [],
  options = {},
  stream = false,
} = {}) => ({
  model: trim(model),
  input: [...toOpenAIResponsesInput(messages), ...(Array.isArray(input) ? clone(input) : [])],
  stream: stream === true,
  store: false,
  ...buildOpenAIResponsesOptions(options),
});
