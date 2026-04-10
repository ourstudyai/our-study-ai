import { NextRequest } from 'next/server';
import { sanitizeForAI } from '../../../lib/gemini/privacy-wrapper';
import { getSystemPrompt } from '../../../lib/gemini/system-prompts';
import { ChatRequest, StudyMode } from '../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest & {
      conversationHistory?: Array<{ role: string; content: string }>;
    } = await request.json();

    const { sessionId, courseId, courseName, courseDescription, mode, message, conversationHistory = [] } = body;

    if (!courseId || !mode || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const systemInstruction = getSystemPrompt(
      mode as StudyMode,
      courseName || 'Unknown Course',
      courseDescription || ''
    );

    const sanitized = sanitizeForAI({
      systemInstruction,
      userMessage: message,
      conversationHistory,
    });

    const messages = sanitized.conversationHistory.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
      content: msg.content,
    }));

    messages.push({ role: 'user', content: sanitized.userMessage });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY || ''}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: sanitized.systemInstruction },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Groq API error');
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sessionData = JSON.stringify({
          type: 'session',
          sessionId: sessionId || `session_${Date.now()}`,
        });
        controller.enqueue(encoder.encode(`data: ${sessionData}\n\n`));

        try {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  const text = parsed.choices?.[0]?.delta?.content;
                  if (text) {
                    const chunkData = JSON.stringify({ type: 'text', content: text });
                    controller.enqueue(encoder.encode(`data: ${chunkData}\n\n`));
                  }
                } catch { }
              }
            }
          }

          const doneData = JSON.stringify({
            type: 'done',
            messageId: `msg_${Date.now()}`,
            userMessageId: `umsg_${Date.now()}`,
          });
          controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));

        } catch (streamError: any) {
          console.error('Streaming error:', streamError);
          const errorData = JSON.stringify({
            type: 'error',
            content: streamError.message || 'Streaming failed',
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}