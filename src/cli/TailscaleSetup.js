// Tailscale Setup Wizard - Ink Component

import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { Spinner } from '@inkjs/ui';
import htm from 'htm';
import {
  isTailscaleAvailable,
  getTailscaleInfo,
  getTailscaleServeStatus,
  setupTailscaleServe
} from '../tailscale.js';
import { PORT, BASE_PATH } from '../config.js';

const html = htm.bind(React.createElement);

/**
 * Simple Y/N Confirm component using useInput
 */
function Confirm({ message, onConfirm, defaultYes = true }) {
  const [ready, setReady] = useState(false);

  // Small delay to avoid capturing stray input from terminal
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useInput((input, key) => {
    if (!ready) return;

    if (input.toLowerCase() === 'y') {
      onConfirm(true);
    } else if (input.toLowerCase() === 'n') {
      onConfirm(false);
    } else if (key.return) {
      onConfirm(defaultYes);
    }
  });

  const hint = defaultYes ? 'Y/n' : 'y/N';

  return html`
    <${Box}>
      <${Text}>${message} <//>
      <${Text} color="cyan">[${hint}]<//>
      <${Text}> <//>
    <//>
  `;
}

/**
 * Multiple choice component
 */
function Choice({ question, options, onSelect }) {
  const [selected, setSelected] = useState(0);
  const [ready, setReady] = useState(false);

  // Small delay to avoid capturing stray input from terminal
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useInput((input, key) => {
    if (!ready) return;

    if (key.upArrow) {
      setSelected(s => Math.max(0, s - 1));
    } else if (key.downArrow) {
      setSelected(s => Math.min(options.length - 1, s + 1));
    } else if (key.return) {
      onSelect(options[selected].value);
    } else if (input >= '1' && input <= String(options.length)) {
      onSelect(options[parseInt(input, 10) - 1].value);
    }
  });

  return html`
    <${Box} flexDirection="column">
      <${Text} bold>${question}<//>
      <${Text}> <//>
      ${options.map((opt, i) => html`
        <${Box} key=${opt.value}>
          <${Text} color=${i === selected ? 'cyan' : 'white'}>
            ${i === selected ? '❯' : ' '} ${i + 1}) ${opt.label}
          <//>
        <//>
        ${opt.description && html`
          <${Text} dimColor>     ${opt.description}<//>
        `}
      `)}
      <${Text}> <//>
      <${Text} dimColor>↑/↓ to move, Enter to select, or press 1-${options.length}<//>
    <//>
  `;
}

/**
 * Installation instructions component
 */
function InstallInstructions({ method }) {
  if (method === 'brew') {
    return html`
      <${Box} flexDirection="column" marginTop=${1}>
        <${Text} bold>Install via Homebrew:<//>
        <${Text}> <//>
        <${Text} color="cyan">  brew install tailscale<//>
        <${Text} color="cyan">  sudo brew services start tailscale<//>
        <${Text} color="cyan">  tailscale up<//>
        <${Text}> <//>
        <${Text} dimColor>After installation, run this server again.<//>
      <//>
    `;
  }

  if (method === 'app') {
    return html`
      <${Box} flexDirection="column" marginTop=${1}>
        <${Text} bold>Install Tailscale.app:<//>
        <${Text}> <//>
        <${Text} color="cyan">  https://tailscale.com/download/mac<//>
        <${Text}> <//>
        <${Text} dimColor>Or via Homebrew:<//>
        <${Text} color="cyan">  brew install --cask tailscale<//>
        <${Text}> <//>
        <${Text} dimColor>After installation, open Tailscale from Applications and sign in.<//>
      <//>
    `;
  }

  return null;
}

/**
 * Main Tailscale Setup Wizard Component
 */
function TailscaleSetupWizard({ port, onComplete }) {
  const [step, setStep] = useState('checking');
  const [tailscaleInfo, setTailscaleInfo] = useState(null);
  const [serveStatus, setServeStatus] = useState(null);
  const [installMethod, setInstallMethod] = useState(null);
  const [error, setError] = useState(null);
  const { exit } = useApp();

  useEffect(() => {
    const available = isTailscaleAvailable();
    if (!available) {
      setStep('not-installed');
      return;
    }

    const info = getTailscaleInfo();
    setTailscaleInfo(info);

    const serve = getTailscaleServeStatus();
    setServeStatus(serve);

    if (serve?.port === port) {
      setStep('configured');
      onComplete({ success: true, alreadyConfigured: true });
    } else if (serve?.port) {
      setStep('wrong-port');
    } else {
      setStep('not-configured');
    }
  }, [port]);

  const handleInstallChoice = (choice) => {
    setInstallMethod(choice);
    if (choice === 'skip') {
      setStep('skipped');
      onComplete({ success: false, reason: 'skipped' });
    } else {
      setStep('show-install');
      onComplete({ installed: false, method: choice });
    }
  };

  const handleConfirm = async (confirmed) => {
    if (!confirmed) {
      setStep('skipped');
      onComplete({ success: false, reason: 'skipped' });
      return;
    }

    setStep('configuring');
    try {
      await setupTailscaleServe(port);
      setStep('done');
      onComplete({ success: true, hostname: tailscaleInfo?.hostname });
    } catch (err) {
      setError(err.message);
      setStep('error');
      onComplete({ success: false, reason: 'error', error: err.message });
    }
  };

  // Checking state
  if (step === 'checking') {
    return html`<${Spinner} label="Checking Tailscale status..." />`;
  }

  // Not installed - show install options
  if (step === 'not-installed') {
    return html`
      <${Choice}
        question="Tailscale is not installed. How would you like to install it?"
        options=${[
          { value: 'brew', label: 'Homebrew (CLI only)', description: 'Headless, no menu bar icon. Good for servers.' },
          { value: 'app', label: 'Tailscale.app (Full UI)', description: 'Menu bar icon, visual status. Good for desktops.' },
          { value: 'skip', label: 'Skip for now', description: 'HTTPS access will not be available.' }
        ]}
        onSelect=${handleInstallChoice}
      />
    `;
  }

  // Show installation instructions
  if (step === 'show-install') {
    return html`<${InstallInstructions} method=${installMethod} />`;
  }

  // Already configured
  if (step === 'configured') {
    return html`
      <${Text} color="green">✓ Tailscale serve is configured for port ${port}<//>
    `;
  }

  // Wrong port - ask to reconfigure
  if (step === 'wrong-port') {
    return html`
      <${Box} flexDirection="column">
        <${Text} color="yellow">⚠ Tailscale serve is configured for port ${serveStatus?.port}<//>
        <${Confirm}
          message=${`Reconfigure for port ${port}?`}
          onConfirm=${handleConfirm}
        />
      <//>
    `;
  }

  // Not configured - ask to set up
  if (step === 'not-configured') {
    return html`
      <${Box} flexDirection="column">
        ${tailscaleInfo?.hostname && html`
          <${Text} dimColor>HTTPS would be: https://${tailscaleInfo.hostname}<//>
        `}
        <${Confirm}
          message=${`Set up Tailscale serve for port ${port}?`}
          onConfirm=${handleConfirm}
        />
      <//>
    `;
  }

  // Configuring
  if (step === 'configuring') {
    return html`<${Spinner} label="Configuring Tailscale serve..." />`;
  }

  // Done
  if (step === 'done') {
    return html`
      <${Box} flexDirection="column">
        <${Text} color="green">✓ Tailscale serve configured for port ${port}<//>
        ${tailscaleInfo?.hostname && html`
          <${Text} color="cyan">  HTTPS: https://${tailscaleInfo.hostname}<//>
        `}
      <//>
    `;
  }

  // Skipped
  if (step === 'skipped') {
    return html`<${Text} dimColor>Tailscale serve setup skipped.<//>`;
  }

  // Error
  if (step === 'error') {
    return html`
      <${Box} flexDirection="column">
        <${Text} color="red">✗ Failed to configure Tailscale serve<//>
        <${Text} dimColor>  ${error}<//>
      <//>
    `;
  }

  return null;
}

/**
 * Run the Tailscale setup wizard
 */
export function runTailscaleSetup(port = PORT) {
  return new Promise((resolve) => {
    let resolved = false;

    const { unmount } = render(
      html`<${TailscaleSetupWizard}
        port=${port}
        onComplete=${(result) => {
          if (resolved) return;
          resolved = true;
          // Give time for final state to render
          setTimeout(() => {
            unmount();
            resolve(result);
          }, 300);
        }}
      />`
    );
  });
}

/**
 * Check Tailscale status without interactive prompt
 */
export function checkTailscaleStatus(port = PORT) {
  const available = isTailscaleAvailable();
  if (!available) {
    return { ok: false, reason: 'not-installed' };
  }

  const info = getTailscaleInfo();
  const serve = getTailscaleServeStatus();

  // Check if path and port are correctly configured
  if (serve?.path === BASE_PATH && serve?.port === port) {
    return { ok: true, info, serve };
  } else if (serve?.path === BASE_PATH && serve?.port !== port) {
    return { ok: false, reason: 'wrong-port', expected: port, actual: serve.port, info, serve };
  } else {
    return { ok: false, reason: 'not-configured', info };
  }
}

export default TailscaleSetupWizard;
