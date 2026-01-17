// Server configuration

export const PORT = process.env.PORT || 51732;
export const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'http://localhost:5001/translate';
export const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'haiku';
export const VALID_CLAUDE_MODELS = ['haiku', 'sonnet', 'opus'];

// Tailscale paths per platform
export const TAILSCALE_PATH = process.platform === 'darwin'
  ? '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
  : 'tailscale';
