/**
 * Provider-agnostic LLM client
 *
 * Supports three providers via env vars:
 *
 *   LLM_PROVIDER=groq     → Groq cloud (free tier, fast) — for Vercel
 *   LLM_PROVIDER=ollama   → Ollama local server          — for local dev
 *   LLM_PROVIDER=gemini   → Google Gemini (if you have a key)
 *
 * Groq:   set GROQ_API_KEY  (groq.com → free signup)
 * Ollama: set OLLAMA_BASE_URL (default: http://localhost:11434)
 * Gemini: set GEMINI_API_KEY
 *
 * Default model per provider:
 *   groq   → llama-3.3-70b-versatile
 *   ollama → llama3.2   (or whatever you have pulled)
 *   gemini → gemini-2.0-flash
 */

import OpenAI from "openai";

type Provider = "groq" | "ollama" | "gemini";

function getProvider(): Provider {
  const p = (process.env.LLM_PROVIDER ?? "groq").toLowerCase();
  if (p === "ollama" || p === "gemini" || p === "groq") return p;
  return "groq";
}

function getDefaultModel(provider: Provider): string {
  switch (provider) {
    case "groq":   return "llama-3.3-70b-versatile";
    case "ollama": return process.env.OLLAMA_MODEL ?? "llama3.2";
    case "gemini": return "gemini-3.5-flash";
  }
}

function buildClient(provider: Provider): OpenAI {
  switch (provider) {
    case "groq":
      if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
      return new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      });

    case "ollama":
      return new OpenAI({
        apiKey: "ollama",  // Ollama doesn't need a real key
        baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      });

    case "gemini":
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
      return new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      });
  }
}

// Lazy singleton — built once per process
let _client: OpenAI | null = null;
let _provider: Provider | null = null;

function getClient() {
  const provider = getProvider();
  if (!_client || _provider !== provider) {
    _client = buildClient(provider);
    _provider = provider;
  }
  return { client: _client, provider };
}

/** Call the LLM and return the raw text response */
export async function ask(prompt: string, model?: string, retries = 5, delayMs = 2000): Promise<string> {
  const { client, provider } = getClient();
  const m = model ?? getDefaultModel(provider);

  try {


    const response = await client.chat.completions.create({
      model: m,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.0,
    }, { timeout: 30000 });

    return response.choices[0]?.message?.content ?? "";
  } catch (error: any) {
    if (retries > 0 && (error?.status === 429 || error?.code === 'rate_limit_exceeded')) {
      console.log(`\n    [LLM] Rate limit hit. Retrying in ${delayMs / 1000}s... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return ask(prompt, model, retries - 1, delayMs * 1.5);
    }
    throw error;
  }
}

/** Call the LLM and parse the response as JSON */
export async function askJSON<T>(prompt: string, model?: string): Promise<T> {
  const raw = await ask(prompt, model);
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
