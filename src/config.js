// Server configuration

import 'dotenv/config';
import { createHash } from 'crypto';
import { hostname } from 'os';

// Generate a consistent random 5-digit port based on machine hostname
// Range: 10000-65535 (valid 5-digit ports)
function getDefaultPort() {
  const hash = createHash('md5').update(hostname()).digest('hex');
  const num = parseInt(hash.slice(0, 8), 16);
  return 10000 + (num % 55536); // 10000-65535
}

export const PORT = parseInt(process.env.PORT, 10) || getDefaultPort();
export const BASE_PATH = process.env.BASE_PATH || '/llm-server';
export const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'http://localhost:5001/translate';
export const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'haiku';
export const VALID_CLAUDE_MODELS = ['haiku', 'sonnet', 'opus'];

// Auto-configure Tailscale serve if available (default: true)
export const TAILSCALE_AUTO_SERVE = process.env.TAILSCALE_AUTO_SERVE !== 'false';

// Tailscale CLI path per platform
export const TAILSCALE_PATH = process.platform === 'darwin'
  ? '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
  : 'tailscale';
