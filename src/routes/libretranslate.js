// LibreTranslate routes

import { Router } from 'express';
import { LIBRETRANSLATE_URL } from '../config.js';
import { extractText, createChatResponse } from '../utils.js';

const router = Router();

/**
 * Translate text using LibreTranslate
 */
async function translateLibre(text, source, target) {
  const res = await fetch(LIBRETRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target })
  });
  const data = await res.json();
  return data.translatedText || text;
}

/**
 * Process text through LibreTranslate (hu -> en -> hu)
 */
async function processLibreTranslate(text) {
  const en = await translateLibre(text, 'hu', 'en');
  const hu = await translateLibre(en, 'en', 'hu');
  return hu;
}

/**
 * Log input/output to console
 */
function logIO(input, output) {
  console.log('\n┌─ INPUT ──────────────────────────────────────');
  console.log('│ ' + input.replace(/\n/g, '\n│ '));
  console.log('└──────────────────────────────────────────────');
  console.log('┌─ OUTPUT (libretranslate) ─────────────────────────────────────');
  console.log('│ ' + output.replace(/\n/g, '\n│ '));
  console.log('└──────────────────────────────────────────────\n');
}

// Chat completions endpoint
router.post('/v1/chat/completions', async (req, res) => {
  const { messages = [], model, stream } = req.body;
  const input = extractText(messages);

  // Extract dictated text from backticks if present
  const dictatedMatch = input.match(/```\n?([\s\S]*?)\n?```/);
  const dictatedText = dictatedMatch ? dictatedMatch[1].trim() : input;

  try {
    const result = await processLibreTranslate(input);

    logIO(dictatedText, result);

    const id = `chatcmpl-libretranslate-${Date.now()}`;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const { chunk, finish } = createChatResponse({
        id,
        model: model || 'libretranslate',
        content: result,
        inputLength: input.length,
        streaming: true
      });

      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write(`data: ${JSON.stringify(finish)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.json(createChatResponse({
        id,
        model: model || 'libretranslate',
        content: result,
        inputLength: input.length
      }));
    }
  } catch (error) {
    console.error('LibreTranslate error:', error.message);
    res.status(500).json({
      error: {
        message: error.message,
        type: 'server_error'
      }
    });
  }
});

// Models endpoint
router.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [{ id: 'libretranslate', object: 'model', owned_by: 'local' }]
  });
});

export default router;
