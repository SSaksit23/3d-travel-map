/**
 * OpenAI Chat Tool
 * LLM completion wrapping the existing openai-client module.
 */

import { toolRegistry } from "./registry";
import {
  chatCompletion,
  chatCompletionWithImage,
} from "../openai-client";

export interface ChatInput {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatWithImageInput extends ChatInput {
  imageBase64: string;
  mimeType: string;
}

export type ChatOutput = string;

async function textHandler(args: ChatInput): Promise<ChatOutput> {
  return chatCompletion(args.prompt, {
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
  });
}

async function imageHandler(args: ChatWithImageInput): Promise<ChatOutput> {
  return chatCompletionWithImage(args.prompt, args.imageBase64, args.mimeType, {
    model: args.model,
    temperature: args.temperature,
    maxTokens: args.maxTokens,
  });
}

toolRegistry.register<ChatInput, ChatOutput>({
  name: "openai_chat",
  toolset: "llm",
  schema: {
    description: "Text-only LLM completion via OpenAI",
    input: { prompt: "string", model: "string?", temperature: "number?", maxTokens: "number?" },
    output: "string",
  },
  handler: textHandler,
  checkFn: () => !!process.env.OPENAI_API_KEY,
});

toolRegistry.register<ChatWithImageInput, ChatOutput>({
  name: "openai_chat_image",
  toolset: "llm",
  schema: {
    description: "Vision LLM completion (text + image) via OpenAI",
    input: { prompt: "string", imageBase64: "string", mimeType: "string" },
    output: "string",
  },
  handler: imageHandler,
  checkFn: () => !!process.env.OPENAI_API_KEY,
});
