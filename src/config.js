// Server configuration

import 'dotenv/config';

export const PORT = parseInt(process.env.PORT, 10) || 51732;
export const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'http://localhost:5001/translate';
export const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'haiku';
export const VALID_CLAUDE_MODELS = ['haiku', 'sonnet', 'opus'];

// Auto-configure Tailscale serve if available (default: true)
export const TAILSCALE_AUTO_SERVE = process.env.TAILSCALE_AUTO_SERVE !== 'false';

// Tailscale CLI path per platform
export const TAILSCALE_PATH = process.platform === 'darwin'
  ? '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
  : 'tailscale';
