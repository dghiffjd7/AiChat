export const TEXT_PROTOCOL_PATTERN = /(?:MiPhone_(?:start|end)|msg_(?:start|end)|moment_(?:start|end|reply_start|reply_end)|<\s*\/?\s*(?:tableEdit|UpdateVariable|image_prompt)\b|<\s*details\b[^>]*>\s*<\s*summary\b|\[\s*summary_format\s*\]|<\s*\/?\s*[^>\n]*的私聊\s*>|<\s*\/?\s*群聊\s*[:：])/iu;

export const containsTextProtocol = value => (
  TEXT_PROTOCOL_PATTERN.test(String(value ?? ''))
);
