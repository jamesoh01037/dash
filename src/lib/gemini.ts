import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db";
import { buildSystemInstruction } from "./persona";
import { agentTools } from "./tools/definitions";

export function getGeminiClient(customApiKey?: string) {
  const db = getDb();
  const apiKey =
    customApiKey ||
    db.settings?.apiKey ||
    process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return null;
  }

  return new GoogleGenerativeAI(apiKey);
}

export function getAgentModel(customApiKey?: string, customModel?: string) {
  const client = getGeminiClient(customApiKey);
  if (!client) return null;

  const db = getDb();
  const modelName = customModel || db.settings?.model || "gemini-3.8-flash";
  const userName = db.settings?.userName || "사용자";

  return client.getGenerativeModel({
    model: modelName,
    systemInstruction: buildSystemInstruction(userName),
    tools: agentTools,
  });
}
