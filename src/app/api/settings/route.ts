import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const settings = { ...db.settings };
  // Mask the API key if present for security
  if (settings.apiKey) {
    const key = settings.apiKey;
    settings.apiKey = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "********";
  }
  return NextResponse.json({
    settings,
    hasEnvKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your_gemini_api_key_here"),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { apiKey, model, userName, theme, googleClientId, googleClientSecret } = await req.json();
    const db = getDb();

    if (apiKey !== undefined && apiKey !== "") {
      db.settings.apiKey = apiKey.trim();
    }
    if (model) db.settings.model = model;
    if (userName) db.settings.userName = userName.trim();
    if (theme) db.settings.theme = theme;
    if (googleClientId !== undefined) db.settings.googleClientId = googleClientId.trim();
    if (googleClientSecret !== undefined) db.settings.googleClientSecret = googleClientSecret.trim();

    saveDb(db);
    return NextResponse.json({ success: true, settings: db.settings });
  } catch {
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
