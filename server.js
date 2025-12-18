const express = require('express');
const app = express();

const LIBRETRANSLATE_URL = 'http://localhost:5001/translate';
const PORT = 8080;

app.use(express.json());

function extractText(messages) {
  return messages
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

async function translate(text, source, target) {
  const res = await fetch(LIBRETRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target })
  });
  const data = await res.json();
  return data.translatedText || text;
}

async function processDictation(text) {
  const en = await translate(text, 'hu', 'en');
  const hu = await translate(en, 'en', 'hu');
  return hu;
}

app.post('/v1/chat/completions', async (req, res) => {
  const { messages = [], model = 'libretranslate' } = req.body;
  const input = extractText(messages);
  const result = await processDictation(input);

  res.json({
    id: 'chatcmpl-libretranslate',
    object: 'chat.completion',
    model,
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
});

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [{ id: 'libretranslate', object: 'model', owned_by: 'local' }]
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('MacWhisper Configuration:');
  console.log('='.repeat(50));
  console.log('  Name:       LibreTranslate');
  console.log(`  Base URL:   http://localhost:${PORT}/v1`);
  console.log('  API Key:    dummy');
  console.log('  Model Name: libretranslate');
  console.log('='.repeat(50));
  console.log(`\nServer running on http://localhost:${PORT}\n`);
});
