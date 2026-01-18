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

    // Parse the serve config for HTTPS port-based serving
    // Structure: { TCP: { "443": { HTTPS: true, ... } }, Web: { ... } }
    // or with custom port: { TCP: { "PORT": { HTTPS: true, ... } }, Web: { "hostname:PORT": ... } }

    if (status.Web) {
      for (const [key, webConfig] of Object.entries(status.Web)) {
        // Extract port from key like "hostname:PORT" or ":PORT" or use 443 for default HTTPS
        const portMatch = key.match(/:(\d+)$/);
        const servePort = portMatch ? parseInt(portMatch[1], 10) : 443;

        if (webConfig.Handlers) {
          // Find the root handler or any handler that proxies to localhost
          for (const [path, handler] of Object.entries(webConfig.Handlers)) {
            if (handler?.Proxy) {
              const proxyMatch = handler.Proxy.match(/:(\d+)$/);
              if (proxyMatch) {
                return {
                  port: parseInt(proxyMatch[1], 10),
                  httpsPort: servePort,
                  https: true,
                  proxy: handler.Proxy,
                  path: path
                };
              }
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
 * Check if Tailscale serve is configured correctly for our port
 */
export function isServeConfiguredCorrectly(port) {
  const status = getTailscaleServeStatus();
  return status?.port === port;
}

/**
 * Setup Tailscale serve with port-based routing (HTTPS on custom port)
 */
export async function setupTailscaleServe(port) {
  return new Promise((resolve, reject) => {
    // First, reset any existing serve configuration
    try {
      tailscaleExec('serve reset 2>/dev/null');
    } catch {
      // Ignore errors - might not have anything to reset
    }

    // Set up the new serve with HTTPS on the same port number
    // This exposes https://hostname:PORT -> http://127.0.0.1:PORT
    const cmd = `"${TAILSCALE_PATH}" serve --bg --https=${port} http://127.0.0.1:${port}`;
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
 * Remove Tailscale serve configuration
 */
export function disableTailscaleServe() {
  try {
    tailscaleExec('serve reset 2>/dev/null');
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
