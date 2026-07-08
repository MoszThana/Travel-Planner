import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    try {
      aiClient = new GoogleGenAI({ apiKey });
    } catch (err) {
      console.error('Failed to initialize GoogleGenAI client:', err);
      return null;
    }
  }
  return aiClient;
}

export async function queryGemini(prompt: string, fallbackJson: any) {
  const client = getAiClient();
  if (client) {
    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const text = response.text || '';
      
      // Attempt to clean markdown backticks from JSON responses
      const cleanJsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJsonStr);
    } catch (err) {
      console.error('Gemini API call failed, using rule-based simulation:', err);
    }
  }
  return fallbackJson;
}
