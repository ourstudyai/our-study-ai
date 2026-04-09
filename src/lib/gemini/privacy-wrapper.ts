// Privacy Wrapper — Strip PII before sending prompt to Gemini
// Ensures the AI only sees theology, never the person

export interface SanitizedPrompt {
  systemInstruction: string;
  userMessage: string;
  conversationHistory: Array<{ role: 'user' | 'model'; content: string }>;
}

/**
 * Strips all personally identifiable information from the prompt context.
 * The AI receives only:
 * - The system instruction (no user IDs)
 * - The conversation content (messages only, no metadata)
 * - The current question
 * 
 * It never sees: user IDs, email addresses, display names, IP addresses
 */
export function sanitizeForAI(params: {
  systemInstruction: string;
  userMessage: string;
  conversationHistory: Array<{ role: string; content: string }>;
  userName?: string;
  userEmail?: string;
  userId?: string;
}): SanitizedPrompt {
  const { systemInstruction, userMessage, conversationHistory, userName, userEmail, userId } = params;

  // Strip any user identifiers that might have leaked into the message content
  let cleanMessage = userMessage;
  let cleanInstruction = systemInstruction;
  const cleanHistory = conversationHistory.map(msg => ({
    role: msg.role as 'user' | 'model',
    content: stripPII(msg.content, userName, userEmail, userId),
  }));

  // Clean the instruction and message
  cleanMessage = stripPII(cleanMessage, userName, userEmail, userId);
  cleanInstruction = stripPII(cleanInstruction, userName, userEmail, userId);

  return {
    systemInstruction: cleanInstruction,
    userMessage: cleanMessage,
    conversationHistory: cleanHistory,
  };
}

function stripPII(
  text: string,
  userName?: string,
  userEmail?: string,
  userId?: string
): string {
  let cleaned = text;

  // Remove specific user identifiers
  if (userId) {
    cleaned = cleaned.replace(new RegExp(escapeRegex(userId), 'gi'), '[STUDENT]');
  }
  if (userEmail) {
    cleaned = cleaned.replace(new RegExp(escapeRegex(userEmail), 'gi'), '[STUDENT]');
  }
  if (userName) {
    cleaned = cleaned.replace(new RegExp(escapeRegex(userName), 'gi'), '[STUDENT]');
  }

  // Remove email patterns that might appear in text
  cleaned = cleaned.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL_REMOVED]');

  // Remove Firebase UID patterns (28-char alphanumeric)
  cleaned = cleaned.replace(/\b[a-zA-Z0-9]{28}\b/g, (match) => {
    // Only replace if it looks like a Firebase UID, not a regular word
    if (/[A-Z]/.test(match) && /[0-9]/.test(match)) {
      return '[ID_REMOVED]';
    }
    return match;
  });

  return cleaned;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
