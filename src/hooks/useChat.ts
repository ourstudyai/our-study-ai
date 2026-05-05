// Chat Hook — Manages chat state, streaming, retry logic
'use client';

import { useState, useCallback, useRef } from 'react';
import { ChatMessage, ChatSession, StudyMode, MessageStatus } from '@/lib/types';

interface UseChatOptions {
  courseId: string;
  courseName: string;
  courseDescription: string;
  mode: StudyMode;
  userId: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  sessionId: string | null;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  regenerateLastResponse: () => Promise<void>;
  retryLastMessage: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setSessionId: React.Dispatch<React.SetStateAction<string | null>>;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export function useChat({
  courseId,
  courseName,
  courseDescription,
  mode,
  userId,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>('');

  const sendMessage = useCallback(
    async (content: string, retryCount = 0) => {
      setError(null);
      lastUserMessageRef.current = content;

      // Add user message to UI immediately
      const userMessage: ChatMessage = {
        id: `temp_user_${Date.now()}`,
        sessionId: sessionId || '',
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        status: 'complete',
        flagged: false,
        feedback: null,
      };

      // Add assistant placeholder
      const assistantPlaceholder: ChatMessage = {
        id: `temp_assistant_${Date.now()}`,
        sessionId: sessionId || '',
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        status: 'streaming',
        flagged: false,
        feedback: null,
      };

      if (retryCount === 0) {
        setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      } else {
        // On retry, only replace the last assistant message
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = assistantPlaceholder;
          return newMessages;
        });
      }

      setIsStreaming(true);

      // Cancel any ongoing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            courseId,
            courseName,
            courseDescription,
            mode,
            message: content,
            conversationHistory: messages
              .filter((m) => m.status === 'complete')
              .map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('No response body — streaming not supported');
        }

        // Read the streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';
        let newSessionId = sessionId;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'session') {
                  newSessionId = data.sessionId;
                  setSessionId(data.sessionId);
                } else if (data.type === 'text') {
                  accumulatedContent += data.content;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                      updated[lastIdx] = {
                        ...updated[lastIdx],
                        content: accumulatedContent,
                        status: 'streaming',
                      };
                    }
                    return updated;
                  });
                } else if (data.type === 'done') {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                      updated[lastIdx] = {
                        ...updated[lastIdx],
                        id: data.messageId || updated[lastIdx].id,
                        sessionId: newSessionId || '',
                        content: accumulatedContent,
                        status: 'complete',
                      };
                    }
                    // Update user message ID too
                    if (lastIdx >= 1 && updated[lastIdx - 1].role === 'user') {
                      updated[lastIdx - 1] = {
                        ...updated[lastIdx - 1],
                        id: data.userMessageId || updated[lastIdx - 1].id,
                        sessionId: newSessionId || '',
                      };
                    }
                    return updated;
                  });
                } else if (data.type === 'error') {
                  throw new Error(data.content);
                }
              } catch (parseError) {
                // Skip malformed SSE lines
                if (line.slice(6).trim()) {
                  console.warn('SSE parse error:', parseError);
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;

        console.error('Chat error:', err);

        // Auto-retry logic
        if (retryCount < MAX_RETRIES) {
          console.log(`Retrying... attempt ${retryCount + 1}/${MAX_RETRIES}`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (retryCount + 1)));
          return sendMessage(content, retryCount + 1);
        }

        // Mark message as error after all retries exhausted
        setError(err.message || 'Failed to get response');
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: 'Sorry, I was unable to respond. Please try again.',
              status: 'error',
            };
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [courseId, courseName, courseDescription, mode, sessionId, messages, userId]
  );

  const regenerateLastResponse = useCallback(async () => {
    if (!lastUserMessageRef.current) return;
    // Remove last assistant message and re-send
    setMessages((prev) => prev.slice(0, -1));
    await sendMessage(lastUserMessageRef.current, 0);
  }, [sendMessage]);

  const retryLastMessage = useCallback(async () => {
    if (!lastUserMessageRef.current) return;
    // Remove both the last user and assistant messages, then re-send
    setMessages((prev) => prev.slice(0, -2));
    await sendMessage(lastUserMessageRef.current, 0);
  }, [sendMessage]);

  return {
    messages,
    sessionId,
    isStreaming,
    error,
    sendMessage,
    regenerateLastResponse,
    retryLastMessage,
    setMessages,
    setSessionId,
  };
}
