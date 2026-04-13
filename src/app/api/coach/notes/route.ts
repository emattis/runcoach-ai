import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";

/** POST /api/coach/notes — save a quick note from athlete to coach */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { category, note_text } = body;

  if (!note_text?.trim()) {
    return NextResponse.json({ error: "Missing note_text" }, { status: 400 });
  }

  const db = createServiceClient();

  const { data, error } = await db
    .from("coach_notes")
    .insert({
      category: category || "other",
      note_text: note_text.trim(),
      note_date: new Date().toISOString().split("T")[0],
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/** GET /api/coach/notes — get recent notes */
export async function GET() {
  const db = createServiceClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const { data, error } = await db
    .from("coach_notes")
    .select("*")
    .gte("note_date", sevenDaysAgo)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: data ?? [] });
}
