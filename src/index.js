#!/usr/bin/env node

// LLM Server - Main entry point

import express from 'express';
import { program } from 'commander';
import chalk from 'chalk';
import { PORT } from './config.js';
import { runTailscaleSetup, checkTailscaleStatus, showServerBanner } from './cli/index.js';
import claudeRoutes from './routes/claude.js';
import libretranslateRoutes from './routes/libretranslate.js';

// CLI setup
program
  .name('llm-server')
  .description('OpenAI-compatible API proxy for Claude CLI and LibreTranslate')
  .version('1.0.0')
  .option('-p, --port <port>', 'Port to listen on', String(PORT))
  .option('--setup-tailscale', 'Run Tailscale serve setup wizard')
  .option('--no-tailscale-check', 'Skip Tailscale serve check on startup')
  .parse();

const options = program.opts();
const port = parseInt(options.port, 10);

/**
 * Main startup function
 */
async function main() {
  // If --setup-tailscale flag is provided, run setup wizard and exit
  if (options.setupTailscale) {
    console.log(chalk.bold('\nTailscale Serve Setup\n'));
    const result = await runTailscaleSetup(port);
    process.exit(result.success ? 0 : 1);
  }

  // Check Tailscale status (unless --no-tailscale-check)
  if (options.tailscaleCheck !== false) {
    const status = checkTailscaleStatus(port);

    if (!status.ok) {
      const isTTY = process.stdin.isTTY && process.stdout.isTTY;

      if (isTTY) {
        // Interactive mode - let Ink handle everything
        const result = await runTailscaleSetup(port);

        // Small delay to let Ink finish rendering
        await new Promise(r => setTimeout(r, 200));

        // Only show follow-up hint if skipped
        if (result.reason === 'skipped') {
          console.log(chalk.dim(`Run with --setup-tailscale to configure later.\n`));
        }
      } else {
        // Non-interactive mode - show simple message
        if (status.reason === 'not-installed') {
          console.log(chalk.yellow('\n⚠ Tailscale is not installed'));
          console.log(chalk.dim('  Install from: https://tailscale.com/download\n'));
        } else {
          console.log(chalk.yellow('\n⚠ Tailscale serve needs configuration'));
          console.log(chalk.dim(`  Run: node src/index.js --setup-tailscale\n`));
        }
      }
    }
  }

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
