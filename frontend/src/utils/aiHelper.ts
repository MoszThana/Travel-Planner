import { GoogleGenAI } from '@google/genai';
import { getRequestContext } from '@cloudflare/next-on-pages';

// Gemini is optional. With no GEMINI_API_KEY the AI features are hidden in the app
// and the AI routes answer 503 — they never return made-up answers.

let aiClient: GoogleGenAI | null = null;

function getApiKey(): string | undefined {
  try {
    const key = (getRequestContext().env as any).GEMINI_API_KEY as string | undefined;
    if (key) return key;
  } catch {
    // Outside a Cloudflare request context
  }
  return process.env.GEMINI_API_KEY;
}

export const isAiConfigured = (): boolean => !!getApiKey();

export class AiUnavailableError extends Error {
  readonly isAiUnavailable = true;
}

/** Ask Gemini for JSON. Throws AiUnavailableError if AI is not set up or the call fails. */
export async function queryGemini<T = unknown>(prompt: string): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) throw new AiUnavailableError('AI is not set up.');
  if (!aiClient) aiClient = new GoogleGenAI({ apiKey });

  try {
    const response = await aiClient.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    return JSON.parse(response.text || 'null') as T;
  } catch (err) {
    console.error('Gemini API call failed:', err);
    throw new AiUnavailableError('The AI service did not answer. Please try again later.');
  }
}
