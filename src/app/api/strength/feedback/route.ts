import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { strength_workout_id, feel_rating, energy_level, soreness_areas, soreness_level, notes, injury_flag } = body;

  if (!strength_workout_id || feel_rating == null || !energy_level) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = createServiceClient();

  const { data, error } = await db
    .from("strength_feedback")
    .insert({
      strength_workout_id,
      feel_rating,
      energy_level,
      soreness_areas: soreness_areas ?? [],
      soreness_level: soreness_level ?? 0,
      notes: notes || null,
      injury_flag: injury_flag ?? false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
