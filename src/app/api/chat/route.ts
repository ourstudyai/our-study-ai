// Chat API Route — Streaming Gemini responses with SSE
import { NextRequest } from 'next/server';
import { getModel } from '../../../lib/gemini/client';
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

    // Build system prompt for the mode
    const systemInstruction = getSystemPrompt(
      mode as StudyMode,
      courseName || 'Unknown Course',
      courseDescription || ''
    );

    // Sanitize — strip PII before sending to Gemini
    const sanitized = sanitizeForAI({
      systemInstruction,
      userMessage: message,
      conversationHistory,
    });

    // Build conversation for Gemini
    const model = getModel();

    const chatHistory = sanitized.conversationHistory.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' as const : 'model' as const,
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history: chatHistory,
      systemInstruction: { role: 'system', parts: [{ text: sanitized.systemInstruction }] },
    });

    // Stream the response
    const result = await chat.sendMessageStream(sanitized.userMessage);

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Send session info
        const sessionData = JSON.stringify({
          type: 'session',
          sessionId: sessionId || `session_${Date.now()}`,
        });
        controller.enqueue(encoder.encode(`data: ${sessionData}\n\n`));

        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              const chunkData = JSON.stringify({ type: 'text', content: text });
              controller.enqueue(encoder.encode(`data: ${chunkData}\n\n`));
            }
          }

          // Signal completion
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
