#!/usr/bin/env node

// LLM Server - Main entry point

import express from 'express';
import { program } from 'commander';
import chalk from 'chalk';
import { PORT, TAILSCALE_AUTO_SERVE } from './config.js';
import { checkTailscaleStatus, showServerBanner } from './cli/index.js';
import { isTailscaleAvailable, setupTailscaleServe, getTailscaleInfo } from './tailscale.js';
import claudeRoutes from './routes/claude.js';
import libretranslateRoutes from './routes/libretranslate.js';

// CLI setup
program
  .name('llm-server')
  .description('OpenAI-compatible API proxy for Claude CLI and LibreTranslate')
  .version('1.0.0')
  .option('-p, --port <port>', 'Port to listen on', String(PORT))
  .option('--no-tailscale', 'Disable Tailscale auto-configuration')
  .parse();

const options = program.opts();
const port = parseInt(options.port, 10);

/**
 * Auto-configure Tailscale serve (silent, no prompts)
 */
async function autoConfigureTailscale() {
  if (!TAILSCALE_AUTO_SERVE || options.tailscale === false) {
    return;
  }

  if (!isTailscaleAvailable()) {
    console.log(chalk.dim('Tailscale not available, skipping HTTPS setup'));
    return;
  }

  const status = checkTailscaleStatus(port);

  if (status.ok) {
    // Already configured correctly
    return;
  }

  // Auto-configure
  console.log(chalk.dim(`Configuring Tailscale serve for port ${port}...`));

  try {
    await setupTailscaleServe(port);
    const info = getTailscaleInfo();
    console.log(chalk.green(`✓ HTTPS: https://${info?.hostname}:${port}`));
  } catch (err) {
    console.log(chalk.yellow(`⚠ Tailscale serve setup failed: ${err.message}`));
  }
}

/**
 * Main startup function
 */
async function main() {
  // Auto-configure Tailscale (silent)
  await autoConfigureTailscale();

  // Create Express app
  const app = express();
  app.use(express.json());

  // Mount routes
  app.use('/claude', claudeRoutes);
  app.use('/libretranslate', libretranslateRoutes);

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Start server
  app.listen(port, () => {
    showServerBanner(port);
  });
}

// Run
main().catch((err) => {
  console.error(chalk.red('Fatal error:'), err.message);
  process.exit(1);
});
