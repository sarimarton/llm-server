// Shared utilities

/**
 * Extract text content from chat messages (user messages only)
 */
export function extractText(messages) {
  return messages
    .filter(msg => msg.role === 'user')
    .map(msg => {
      if (typeof msg.content === 'string') return msg.content;
      if (Array.isArray(msg.content)) {
        return msg.content
          .filter(p => p.type === 'text')
          .map(p => p.text)
          .join('\n');
      }
      return '';
    })
    .join('\n');
}

/**
 * Extract system prompt from messages
 */
export function extractSystemPrompt(messages) {
  const systemMsg = messages.find(msg => msg.role === 'system');
  if (!systemMsg) return null;
  if (typeof systemMsg.content === 'string') return systemMsg.content;
  if (Array.isArray(systemMsg.content)) {
    return systemMsg.content
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join('\n');
  }
  return null;
}

/**
 * Create an OpenAI-compatible chat completion response
 */
export function createChatResponse({ id, model, content, inputLength, streaming = false }) {
  const created = Math.floor(Date.now() / 1000);

  if (streaming) {
    return {
      chunk: {
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{
          index: 0,
          delta: { role: 'assistant', content },
          finish_reason: null
        }]
      },
      finish: {
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }]
      }
    };
  }

  return {
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: inputLength,
      completion_tokens: content.length,
      total_tokens: inputLength + content.length
    }
  };
}
