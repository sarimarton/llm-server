// Tailscale integration

import { execSync, exec } from 'child_process';
import { TAILSCALE_PATH, BASE_PATH } from './config.js';

/**
 * Execute a Tailscale CLI command
 */
function tailscaleExec(args, options = {}) {
  const cmd = `"${TAILSCALE_PATH}" ${args}`;
  return execSync(cmd, { encoding: 'utf-8', ...options }).trim();
}

/**
 * Check if Tailscale is installed and running
 */
export function isTailscaleAvailable() {
  try {
    tailscaleExec('status 2>/dev/null');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Tailscale IP and hostname
 */
export function getTailscaleInfo() {
  try {
    const ip = tailscaleExec('ip -4 2>/dev/null');
    const status = tailscaleExec('status --json 2>/dev/null');
    const parsed = JSON.parse(status);
    const hostname = parsed.Self?.DNSName?.replace(/\.$/, '') || null;
    return { ip, hostname };
  } catch {
    return null;
  }
}

/**
 * Get current Tailscale serve configuration for our BASE_PATH
 * Returns { path, port, https } or null if not configured
 */
export function getTailscaleServeStatus() {
  try {
    const output = tailscaleExec('serve status --json 2>/dev/null');
    const status = JSON.parse(output);

    // Parse the serve config to find our path
    // Structure: { Web: { "hostname:443": { Handlers: { "/llm-server": { Proxy: "http://127.0.0.1:PORT" } } } } }
    if (status.Web) {
      for (const [key, webConfig] of Object.entries(status.Web)) {
        if (webConfig.Handlers) {
          // Check if our BASE_PATH is configured
          const handler = webConfig.Handlers[BASE_PATH];
          if (handler?.Proxy) {
            const match = handler.Proxy.match(/:(\d+)$/);
            if (match) {
              return {
                path: BASE_PATH,
                port: parseInt(match[1], 10),
                https: true,
                proxy: handler.Proxy
              };
            }
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if Tailscale serve is configured correctly for our path and port
 */
export function isServeConfiguredCorrectly(port) {
  const status = getTailscaleServeStatus();
  return status?.path === BASE_PATH && status?.port === port;
}

/**
 * Setup Tailscale serve with path-based routing
 */
export async function setupTailscaleServe(port) {
  return new Promise((resolve, reject) => {
    // First, remove any existing handler for our path
    try {
      tailscaleExec(`serve --remove ${BASE_PATH} 2>/dev/null`);
    } catch {
      // Ignore errors - path might not exist
    }

    // Set up the new serve with path
    const cmd = `"${TAILSCALE_PATH}" serve --bg --set-path ${BASE_PATH} http://127.0.0.1:${port}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Failed to setup Tailscale serve: ${stderr || error.message}`));
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Remove Tailscale serve for our path
 */
export function disableTailscaleServe() {
  try {
    tailscaleExec(`serve --remove ${BASE_PATH} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get diagnostic info for Tailscale setup
 */
export function getTailscaleDiagnostics() {
  const available = isTailscaleAvailable();
  const info = available ? getTailscaleInfo() : null;
  const serveStatus = available ? getTailscaleServeStatus() : null;

  return {
    installed: available,
    running: available,
    ip: info?.ip || null,
    hostname: info?.hostname || null,
    serve: serveStatus,
    basePath: BASE_PATH
  };
}
