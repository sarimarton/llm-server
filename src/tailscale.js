// Tailscale integration

import { execSync, exec } from 'child_process';
import { TAILSCALE_PATH } from './config.js';

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
 * Get current Tailscale serve configuration
 * Returns { port, https } or null if not configured
 */
export function getTailscaleServeStatus() {
  try {
    const output = tailscaleExec('serve status --json 2>/dev/null');
    const status = JSON.parse(output);

    // Parse the serve config to find the port
    // The structure is: { TCP: { "443": { HTTPS: true } }, Web: { "hostname:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:PORT" } } } } }
    if (status.Web) {
      for (const [key, webConfig] of Object.entries(status.Web)) {
        if (webConfig.Handlers && webConfig.Handlers['/']) {
          const proxy = webConfig.Handlers['/'].Proxy;
          if (proxy) {
            const match = proxy.match(/:(\d+)$/);
            if (match) {
              return {
                port: parseInt(match[1], 10),
                https: true,
                proxy
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
 * Check if Tailscale serve is configured for the specified port
 */
export function isServeConfiguredForPort(port) {
  const status = getTailscaleServeStatus();
  return status?.port === port;
}

/**
 * Setup Tailscale serve for a port (runs in background)
 */
export async function setupTailscaleServe(port) {
  return new Promise((resolve, reject) => {
    // First, turn off any existing serve
    try {
      tailscaleExec('serve off 2>/dev/null');
    } catch {
      // Ignore errors - might not have anything to turn off
    }

    // Then set up the new serve
    const cmd = `"${TAILSCALE_PATH}" serve --bg ${port}`;
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
 * Turn off Tailscale serve
 */
export function disableTailscaleServe() {
  try {
    tailscaleExec('serve off 2>/dev/null');
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
    serve: serveStatus
  };
}
