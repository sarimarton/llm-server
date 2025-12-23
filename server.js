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

    // DEBUG
    console.log('\n=== REQUEST ===');
    console.log('Full body:', JSON.stringify(req.body, null, 2));

    const input = extractText(messages);
    const systemPrompt = extractSystemPrompt(messages);

    console.log('Extracted input:', JSON.stringify(input));
    console.log('System prompt:', systemPrompt ? 'yes (' + systemPrompt.length + ' chars)' : 'none');
    console.log('Stream requested:', req.body.stream);

    try {
      let result;
      if (backend === 'claude') {
        result = processClaude(input, systemPrompt);
      } else {
        result = await processLibreTranslate(input);
      }

      console.log('Result:', JSON.stringify(result));
      console.log('=== END ===\n');

      const id = `chatcmpl-${backend}-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

      // Handle streaming response
      if (req.body.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Send content chunk
        const chunk = {
          id,
          object: 'chat.completion.chunk',
          created,
          model: model || backend,
          choices: [{
            index: 0,
            delta: { role: 'assistant', content: result },
            finish_reason: null
          }]
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);

        // Send finish chunk
        const finishChunk = {
          id,
          object: 'chat.completion.chunk',
          created,
          model: model || backend,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
          }]
        };
        res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);

        // Send done signal
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Non-streaming response
        res.json({
          id,
          object: 'chat.completion',
          created,
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
      }
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
