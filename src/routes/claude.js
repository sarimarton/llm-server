// Claude CLI routes

import { Router } from 'express';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { DEFAULT_CLAUDE_MODEL, VALID_CLAUDE_MODELS } from '../config.js';
import { extractText, extractSystemPrompt, createChatResponse } from '../utils.js';
import {
  getSessionContext,
  addMessage,
  startNewSession,
  formatContextForPrompt,
  getSessionStats
} from '../session.js';

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
 * Log session info and input/output to console
 */
function logRequest(input, output, model, sessionInfo) {
  const { isCarryOver, context, stats } = sessionInfo;

  console.log('\n' + chalk.dim('─'.repeat(60)));

  // Session status line
  if (isCarryOver) {
    console.log(chalk.green('● Session') + chalk.dim(` │ carry-over │ ${stats.messageCount} msgs │ last: ${stats.timeSinceLastActivity}`));
  } else {
    console.log(chalk.yellow('○ Session') + chalk.dim(' │ new session'));
  }

  // Context (if carry-over)
  if (isCarryOver && context?.messages.length > 0) {
    console.log(chalk.dim('─'.repeat(60)));
    console.log(chalk.dim('Context:'));
    for (const msg of context.messages.slice(-4)) { // Show last 4 messages
      const prefix = msg.role === 'user' ? chalk.blue('  ← ') : chalk.green('  → ');
      const content = msg.content.length > 60 ? msg.content.slice(0, 60) + '...' : msg.content;
      console.log(prefix + chalk.dim(content));
    }
    if (context.messages.length > 4) {
      console.log(chalk.dim(`  ... and ${context.messages.length - 4} more`));
    }
  }

  console.log(chalk.dim('─'.repeat(60)));

  // Current input
  console.log(chalk.blue('← Input'));
  console.log('  ' + input.replace(/\n/g, '\n  '));

  // Output
  console.log(chalk.green(`→ Output`) + chalk.dim(` (${model})`));
  console.log('  ' + output.replace(/\n/g, '\n  '));

  console.log(chalk.dim('─'.repeat(60)) + '\n');
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
    // Check for session carry-over
    const context = getSessionContext();
    const stats = getSessionStats();
    const isCarryOver = context !== null;

    // Build the prompt with context if carrying over
    let fullPrompt = input;
    if (isCarryOver) {
      const contextPrefix = formatContextForPrompt(context);
      if (contextPrefix) {
        fullPrompt = contextPrefix + '\n' + input;
      }
    } else {
      // Start new session
      startNewSession();
    }

    const claudeModel = (model && VALID_CLAUDE_MODELS.includes(model)) ? model : DEFAULT_CLAUDE_MODEL;
    const result = processClaude(fullPrompt, systemPrompt, claudeModel);

    // Store the exchange in session
    addMessage('user', dictatedText);
    addMessage('assistant', result.text);

    // Log with session info
    logRequest(dictatedText, result.text, result.model, { isCarryOver, context, stats });

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
