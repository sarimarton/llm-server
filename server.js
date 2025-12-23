const express = require('express');
const { execSync } = require('child_process');
const app = express();

const LIBRETRANSLATE_URL = 'http://localhost:5001/translate';
const PORT = 8080;

app.use(express.json());

function extractText(messages) {
  // Only extract user messages (skip system prompts)
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

function extractSystemPrompt(messages) {
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

// LibreTranslate backend
async function translateLibre(text, source, target) {
  const res = await fetch(LIBRETRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target })
  });
  const data = await res.json();
  return data.translatedText || text;
}

async function processLibreTranslate(text) {
  const en = await translateLibre(text, 'hu', 'en');
  const hu = await translateLibre(en, 'en', 'hu');
  return hu;
}

// Claude CLI backend
function processClaude(text, systemPrompt) {
  try {
    const escape = s => s.replace(/'/g, "'\\''");
    let cmd = `claude -p '${escape(text)}'`;
    if (systemPrompt) {
      cmd += ` --system-prompt '${escape(systemPrompt)}'`;
    }
    const result = execSync(cmd, {
      encoding: 'utf-8',
      shell: '/bin/bash',
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });
    return result.trim();
  } catch (error) {
    console.error('Claude CLI error:', error.message);
    throw new Error('Claude CLI failed: ' + error.message);
  }
}

// Chat completions endpoint factory
function createChatHandler(backend) {
  return async (req, res) => {
    const { messages = [], model } = req.body;
    const input = extractText(messages);
    const systemPrompt = extractSystemPrompt(messages);

    try {
      let result;
      if (backend === 'claude') {
        result = processClaude(input, systemPrompt);
      } else {
        result = await processLibreTranslate(input);
      }

      res.json({
        id: `chatcmpl-${backend}`,
        object: 'chat.completion',
        model: model || backend,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: result },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: input.length,
          completion_tokens: result.length,
          total_tokens: input.length + result.length
        }
      });
    } catch (error) {
      res.status(500).json({
        error: {
          message: error.message,
          type: 'server_error'
        }
      });
    }
  };
}

// LibreTranslate routes
app.post('/libretranslate/v1/chat/completions', createChatHandler('libretranslate'));
app.get('/libretranslate/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [{ id: 'libretranslate', object: 'model', owned_by: 'local' }]
  });
});

// Claude routes
app.post('/claude/v1/chat/completions', createChatHandler('claude'));
app.get('/claude/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [{ id: 'claude', object: 'model', owned_by: 'anthropic' }]
  });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('MacWhisper Configuration Options:');
  console.log('='.repeat(60));
  console.log('\n[1] LibreTranslate (requires Docker):');
  console.log('    Name:       LibreTranslate');
  console.log(`    Base URL:   http://localhost:${PORT}/libretranslate/v1`);
  console.log('    API Key:    dummy');
  console.log('    Model Name: libretranslate');
  console.log('\n[2] Claude CLI (requires claude command):');
  console.log('    Name:       Claude');
  console.log(`    Base URL:   http://localhost:${PORT}/claude/v1`);
  console.log('    API Key:    dummy');
  console.log('    Model Name: claude');
  console.log('\n' + '='.repeat(60));
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('='.repeat(60) + '\n');
});
