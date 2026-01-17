const express = require('express');
const { execSync } = require('child_process');
const os = require('os');
const app = express();

// Get local network IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'unknown';
}

// Get Tailscale IP and hostname
function getTailscaleInfo() {
  try {
    // On macOS, use the Tailscale app's CLI path
    const tailscalePath = process.platform === 'darwin'
      ? '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
      : 'tailscale';
    const ip = execSync(`"${tailscalePath}" ip -4 2>/dev/null`, { encoding: 'utf-8' }).trim();
    const status = execSync(`"${tailscalePath}" status --json 2>/dev/null`, { encoding: 'utf-8' });
    const parsed = JSON.parse(status);
    const hostname = parsed.Self?.DNSName?.replace(/\.$/, '') || null;
    return { ip, hostname };
  } catch {
    return null;
  }
}

const LIBRETRANSLATE_URL = 'http://localhost:5001/translate';
const PORT = 51732;
const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'haiku';

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

// Valid Claude models
const VALID_CLAUDE_MODELS = ['haiku', 'sonnet', 'opus'];

// Claude CLI backend
function processClaude(text, systemPrompt, claudeModel = DEFAULT_CLAUDE_MODEL) {
  try {
    const escape = s => s.replace(/'/g, "'\\''");
    let cmd = `claude -p '${escape(text)}' --model ${claudeModel}`;
    if (systemPrompt) {
      cmd += ` --system-prompt '${escape(systemPrompt)}'`;
    }
    const result = execSync(cmd, {
      encoding: 'utf-8',
      shell: '/bin/bash',
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });
    return { text: result.trim(), model: claudeModel };
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

    // Extract just the dictated text from backticks if present
    const dictatedMatch = input.match(/```\n?([\s\S]*?)\n?```/);
    const dictatedText = dictatedMatch ? dictatedMatch[1].trim() : input;

    console.log('\n┌─ INPUT ──────────────────────────────────────');
    console.log('│ ' + dictatedText.replace(/\n/g, '\n│ '));
    console.log('└──────────────────────────────────────────────');

    try {
      let result;
      let usedModel = backend;
      if (backend === 'claude') {
        // Use model from request if valid, or fall back to default
        const claudeModel = (model && VALID_CLAUDE_MODELS.includes(model)) ? model : DEFAULT_CLAUDE_MODEL;
        const claudeResult = processClaude(input, systemPrompt, claudeModel);
        result = claudeResult.text;
        usedModel = `claude/${claudeResult.model}`;
      } else {
        result = await processLibreTranslate(input);
      }

      console.log(`┌─ OUTPUT (${usedModel}) ─────────────────────────────────────`);
      console.log('│ ' + result.replace(/\n/g, '\n│ '));
      console.log('└──────────────────────────────────────────────\n');

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
    data: VALID_CLAUDE_MODELS.map(id => ({ id, object: 'model', owned_by: 'anthropic' }))
  });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  const localIP = getLocalIP();
  const tailscale = getTailscaleInfo();

  const urls = {
    local: `http://localhost:${PORT}`,
    network: `http://${localIP}:${PORT}`,
    tailscale: tailscale ? `http://${tailscale.ip}:${PORT}` : null,
    https: tailscale?.hostname ? `https://${tailscale.hostname}` : null
  };

  console.log('\n' + '='.repeat(65));
  console.log('MacWhisper / iOS Configuration');
  console.log('='.repeat(65));

  console.log('\n[Claude] API Key: dummy | Model: ' + DEFAULT_CLAUDE_MODEL + ' (or: haiku, sonnet, opus)');
  console.log('-'.repeat(65));
  console.log(`  Local:      ${urls.local}/claude/v1`);
  console.log(`  Network:    ${urls.network}/claude/v1`);
  if (urls.tailscale) {
    console.log(`  Tailscale:  ${urls.tailscale}/claude/v1`);
  }
  if (urls.https) {
    console.log(`  HTTPS/iOS:  ${urls.https}/claude/v1`);
  }

  console.log('\n[LibreTranslate] API Key: dummy | Model: libretranslate');
  console.log('-'.repeat(65));
  console.log(`  Local:      ${urls.local}/libretranslate/v1`);
  console.log(`  Network:    ${urls.network}/libretranslate/v1`);
  if (urls.tailscale) {
    console.log(`  Tailscale:  ${urls.tailscale}/libretranslate/v1`);
  }
  if (urls.https) {
    console.log(`  HTTPS/iOS:  ${urls.https}/libretranslate/v1`);
  }

  if (tailscale?.hostname) {
    console.log('\n' + '-'.repeat(65));
    console.log(`To enable HTTPS: tailscale serve --bg ${PORT}`);
  }

  console.log('\n' + '='.repeat(65) + '\n');
});
