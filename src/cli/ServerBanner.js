// Server Banner - Ink Component

import React from 'react';
import { render, Box, Text } from 'ink';
import htm from 'htm';
import { PORT, BASE_PATH, DEFAULT_CLAUDE_MODEL, VALID_CLAUDE_MODELS } from '../config.js';
import { getLocalIP } from '../network.js';
import { getTailscaleInfo } from '../tailscale.js';

// Bind htm to React.createElement
const html = htm.bind(React.createElement);

/**
 * URL Row Component
 */
function UrlRow({ label, url }) {
  return html`
    <${Box}>
      <${Text} dimColor>  ${label.padEnd(12)}<//>
      <${Text} color="cyan">${url}<//>
    <//>
  `;
}

/**
 * Endpoint Section Component
 */
function EndpointSection({ title, apiKey, model, models, urls, endpointPath }) {
  return html`
    <${Box} flexDirection="column" marginTop=${1}>
      <${Text}>
        <${Text} color="white" bold>[${title}]<//>
        <${Text} dimColor> API Key: <//>
        <${Text}>${apiKey}<//>
        <${Text} dimColor> | Model: <//>
        <${Text} color="green">${model}<//>
        ${models && html`<${Text} dimColor> (or: ${models.join(', ')})<//>`}
      <//>
      <${Text} dimColor>${'─'.repeat(65)}<//>
      ${urls.local && html`<${UrlRow} label="Local:" url=${`${urls.local}${endpointPath}`} />`}
      ${urls.network && html`<${UrlRow} label="Network:" url=${`${urls.network}${endpointPath}`} />`}
      ${urls.tailscale && html`<${UrlRow} label="Tailscale:" url=${`${urls.tailscale}${endpointPath}`} />`}
      ${urls.https && html`<${UrlRow} label="HTTPS/iOS:" url=${`${urls.https}${endpointPath}`} />`}
    <//>
  `;
}

/**
 * Server Banner Component
 */
function ServerBanner({ port = PORT }) {
  const localIP = getLocalIP();
  const tailscale = getTailscaleInfo();

  // All URLs include port (port-based routing for WebSocket compatibility)
  const urls = {
    local: `http://localhost:${port}${BASE_PATH}`,
    network: `http://${localIP}:${port}${BASE_PATH}`,
    tailscale: tailscale ? `http://${tailscale.ip}:${port}${BASE_PATH}` : null,
    https: tailscale?.hostname ? `https://${tailscale.hostname}:${port}${BASE_PATH}` : null
  };

  return html`
    <${Box} flexDirection="column" paddingY=${1}>
      <${Text} color="white" bold>${'═'.repeat(65)}<//>
      <${Text} color="white" bold>MacWhisper / iOS Configuration<//>
      <${Text} color="white" bold>${'═'.repeat(65)}<//>

      <${EndpointSection}
        title="Claude"
        apiKey="dummy"
        model=${DEFAULT_CLAUDE_MODEL}
        models=${VALID_CLAUDE_MODELS}
        urls=${urls}
        endpointPath="/claude/v1"
      />

      <${EndpointSection}
        title="LibreTranslate"
        apiKey="dummy"
        model="libretranslate"
        urls=${urls}
        endpointPath="/libretranslate/v1"
      />

      <${Box} marginTop=${1}>
        <${Text} color="white" bold>${'═'.repeat(65)}<//>
      <//>
    <//>
  `;
}

/**
 * Render the server banner to console
 */
export function showServerBanner(port = PORT) {
  const { unmount } = render(html`<${ServerBanner} port=${port} />`);
  // Unmount after render to avoid keeping React running
  setTimeout(() => unmount(), 50);
}

export default ServerBanner;
