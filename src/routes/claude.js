// Claude CLI routes

import { Router } from 'express';
import { execSync } from 'child_process';
import { DEFAULT_CLAUDE_MODEL, VALID_CLAUDE_MODELS } from '../config.js';
import { extractText, extractSystemPrompt, createChatResponse } from '../utils.js';

const router = Router();

/**
 * Process text through Claude CLI
 */
function processClaude(text, systemPrompt, claudeModel = DEFAULT_CLAUDE_MODEL) {
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
}

/**
 * Log input/output to console
 */
function logIO(input, output, model) {
  console.log('\n┌─ INPUT ──────────────────────────────────────');
  console.log('│ ' + input.replace(/\n/g, '\n│ '));
  console.log('└──────────────────────────────────────────────');
  console.log(`┌─ OUTPUT (claude/${model}) ─────────────────────────────────────`);
  console.log('│ ' + output.replace(/\n/g, '\n│ '));
  console.log('└──────────────────────────────────────────────\n');
}

// Chat completions endpoint
router.post('/v1/chat/completions', async (req, res) => {
  const { messages = [], model, stream } = req.body;
  const input = extractText(messages);
  const systemPrompt = extractSystemPrompt(messages);

  // Extract dictated text from backticks if present
  const dictatedMatch = input.match(/```\n?([\s\S]*?)\n?```/);
  const dictatedText = dictatedMatch ? dictatedMatch[1].trim() : input;

  try {
    const claudeModel = (model && VALID_CLAUDE_MODELS.includes(model)) ? model : DEFAULT_CLAUDE_MODEL;
    const result = processClaude(input, systemPrompt, claudeModel);

    logIO(dictatedText, result.text, result.model);

    const id = `chatcmpl-claude-${Date.now()}`;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const { chunk, finish } = createChatResponse({
        id,
        model: model || 'claude',
        content: result.text,
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
        model: model || 'claude',
        content: result.text,
        inputLength: input.length
      }));
    }
  } catch (error) {
    console.error('Claude CLI error:', error.message);
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
    data: VALID_CLAUDE_MODELS.map(id => ({ id, object: 'model', owned_by: 'anthropic' }))
  });
});

export default router;
