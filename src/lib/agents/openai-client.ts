import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY environment variable is not set");
    _client = new OpenAI({ apiKey: key });
  }
  return _client;
}

export const DEFAULT_MODEL = "gpt-4o-mini";

export async function chatCompletion(
  prompt: string,
  opts?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const client = getOpenAIClient();
  const resp = await client.chat.completions.create({
    model: opts?.model ?? DEFAULT_MODEL,
    temperature: opts?.temperature ?? 0.1,
    max_tokens: opts?.maxTokens ?? 8192,
    messages: [{ role: "user", content: prompt }],
  });
  return resp.choices[0]?.message?.content ?? "";
}

export async function chatCompletionWithImage(
  textPrompt: string,
  imageBase64: string,
  mimeType: string,
  opts?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const client = getOpenAIClient();
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const resp = await client.chat.completions.create({
    model: opts?.model ?? "gpt-4o-mini",
    temperature: opts?.temperature ?? 0.1,
    max_tokens: opts?.maxTokens ?? 8192,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: textPrompt },
        ],
      },
    ],
  });
  return resp.choices[0]?.message?.content ?? "";
}
