// Session management - in-memory context carry-over

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Session store
 * Tracks conversation history for context carry-over
 */
const session = {
  messages: [],      // Array of { role: 'user'|'assistant', content: string, timestamp: number }
  lastActivity: null
};

/**
 * Check if session is still active (within timeout)
 */
export function isSessionActive() {
  if (!session.lastActivity) return false;
  const elapsed = Date.now() - session.lastActivity;
  return elapsed < SESSION_TIMEOUT_MS;
}

/**
 * Get time since last activity in human-readable format
 */
export function getTimeSinceLastActivity() {
  if (!session.lastActivity) return null;
  const elapsed = Date.now() - session.lastActivity;
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

/**
 * Get current session context for carry-over
 * Returns null if session expired
 */
export function getSessionContext() {
  if (!isSessionActive()) {
    return null;
  }
  return {
    messages: [...session.messages],
    messageCount: session.messages.length,
    timeSinceLastActivity: getTimeSinceLastActivity()
  };
}

/**
 * Add a message to the session
 */
export function addMessage(role, content) {
  session.messages.push({
    role,
    content,
    timestamp: Date.now()
  });
  session.lastActivity = Date.now();
}

/**
 * Clear the session (start fresh)
 */
export function clearSession() {
  session.messages = [];
  session.lastActivity = null;
}

/**
 * Start a new session (clears old, marks activity)
 */
export function startNewSession() {
  clearSession();
  session.lastActivity = Date.now();
}

/**
 * Format session context as prompt prefix
 */
export function formatContextForPrompt(context) {
  if (!context || context.messages.length === 0) {
    return null;
  }

  const lines = ['[Previous dictations in this session]'];

  for (const msg of context.messages) {
    if (msg.role === 'user') {
      lines.push(`Input: "${msg.content}"`);
    } else {
      lines.push(`Output: "${msg.content}"`);
    }
  }

  lines.push('');
  lines.push('[Current dictation]');

  return lines.join('\n');
}

/**
 * Get session stats for logging
 */
export function getSessionStats() {
  return {
    active: isSessionActive(),
    messageCount: session.messages.length,
    timeSinceLastActivity: getTimeSinceLastActivity()
  };
}
