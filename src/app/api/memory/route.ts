import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb, MemoryItem } from "@/lib/db";
import { generateId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const memories = [...(db.memories || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return NextResponse.json(
    { memories },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { content, category = "general" } = await req.json();
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const db = getDb();
    const newMemory: MemoryItem = {
      id: generateId(),
      category,
      content: content.trim(),
      source: "user",
      createdAt: new Date().toISOString(),
    };

    db.memories = [newMemory, ...(db.memories || [])];
    saveDb(db);

    return NextResponse.json({ memory: newMemory }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create memory" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, content, category } = await req.json();
    if (!id || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Memory ID and non-empty content are required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const target = (db.memories || []).find((m) => m.id === id);
    if (!target) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

    target.content = content.trim();
    if (
      category === "personal" ||
      category === "preference" ||
      category === "work" ||
      category === "general"
    ) {
      target.category = category;
    }

    saveDb(db);
    return NextResponse.json({ memory: target });
  } catch {
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Memory ID is required" }, { status: 400 });
    }

    const db = getDb();
    db.memories = (db.memories || []).filter((m) => m.id !== id);
    saveDb(db);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete memory" }, { status: 500 });
  }
}
