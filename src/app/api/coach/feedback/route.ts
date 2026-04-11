import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    activity_id,
    feel_rating,
    energy_level,
    soreness_areas,
    soreness_level,
    sleep_quality,
    sleep_hours,
    notes,
    injury_flag,
  } = body;

  // Validate required fields
  if (!activity_id || feel_rating == null || !energy_level || soreness_level == null || sleep_quality == null || sleep_hours == null) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const db = createServiceClient();

  try {
    const { data, error } = await db
      .from("run_feedback")
      .insert({
        activity_id,
        feel_rating,
        energy_level,
        soreness_areas: soreness_areas ?? [],
        soreness_level,
        sleep_quality,
        sleep_hours,
        notes: notes || null,
        injury_flag: injury_flag ?? false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to save feedback: ${error.message}` },
        { status: 500 }
      );
    }

    // If injury flagged, log a coach learning
    if (injury_flag) {
      await db.from("coach_learnings").insert({
        category: "injury_pattern",
        insight: `Athlete flagged injury on ${new Date().toISOString().split("T")[0]}. Soreness areas: ${(soreness_areas ?? []).join(", ") || "not specified"}. Soreness level: ${soreness_level}/10. Feel rating: ${feel_rating}/10.`,
        confidence: 0.8,
        evidence: [
          {
            source: "run_feedback",
            activity_id,
            date: new Date().toISOString().split("T")[0],
          },
        ],
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Feedback error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
