import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { COACH_SYSTEM_PROMPT } from "@/lib/coach";
import { formatPace } from "@/lib/utils";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function callGeminiText(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error("Gemini returned no content");
  }
  return data.candidates[0].content.parts[0].text;
}

/**
 * POST /api/coach/activity-analysis
 * Body: { activity_id: string }
 *
 * Generates a 1-2 sentence AI coach analysis for a specific activity,
 * caches it in the activities.coach_analysis column, and returns it.
 */
export async function POST(req: NextRequest) {
  try {
    const { activity_id } = await req.json();
    if (!activity_id) {
      return NextResponse.json(
        { error: "activity_id is required" },
        { status: 400 }
      );
    }

    const db = createServiceClient();

    // Fetch the activity
    const { data: activity, error: actErr } = await db
      .from("activities")
      .select("*")
      .eq("id", activity_id)
      .single();

    if (actErr || !activity) {
      return NextResponse.json(
        { error: "Activity not found" },
        { status: 404 }
      );
    }

    // If already cached, return it
    if (activity.coach_analysis) {
      return NextResponse.json({ analysis: activity.coach_analysis });
    }

    // Fetch feedback and planned workout for context
    const [feedbackRes, plannedRes] = await Promise.all([
      db
        .from("run_feedback")
        .select("*")
        .eq("activity_id", activity_id)
        .maybeSingle(),
      db
        .from("planned_workouts")
        .select("*")
        .eq("workout_date", activity.activity_date)
        .in("workout_type", [
          "easy",
          "long_run",
          "tempo",
          "intervals",
          "recovery",
          "strides",
        ])
        .limit(1)
        .maybeSingle(),
    ]);

    const feedback = feedbackRes.data;
    const planned = plannedRes.data;

    // Build the prompt
    const paceStr = activity.avg_pace_per_mile
      ? formatPace(activity.avg_pace_per_mile)
      : "unknown";

    let context = `Analyze this single training session for the athlete.

ACTIVITY DATA:
- Date: ${activity.activity_date}
- Type: ${activity.activity_type}
- Distance: ${activity.distance_miles?.toFixed(1) ?? "?"} miles
- Duration: ${activity.duration_seconds ? Math.floor(activity.duration_seconds / 60) + " min" : "?"}
- Avg pace: ${paceStr}/mi
- Avg HR: ${activity.avg_hr ?? "unknown"} bpm
- Max HR: ${activity.max_hr ?? "unknown"} bpm
- Perceived effort: ${activity.perceived_effort ?? "unknown"}/10
- Elevation gain: ${activity.elevation_gain_ft?.toFixed(0) ?? "unknown"} ft`;

    if (activity.splits && Array.isArray(activity.splits) && activity.splits.length > 0) {
      context += `\n- Splits: ${activity.splits.map((s: { mile: number; pace_seconds: number }) => `Mile ${s.mile}: ${formatPace(s.pace_seconds)}`).join(", ")}`;
    }

    if (planned) {
      context += `\n\nPRESCRIBED WORKOUT:
- Type: ${planned.workout_type}
- Target distance: ${planned.target_distance ?? "?"} mi
- Target pace: ${planned.target_pace_range ?? "not specified"}
- Target HR zone: ${planned.target_hr_zone ?? "not specified"}
- Description: ${planned.description ?? "none"}`;
    }

    if (feedback) {
      context += `\n\nATHLETE FEEDBACK:
- Feel rating: ${feedback.feel_rating}/10
- Energy level: ${feedback.energy_level}
- Soreness level: ${feedback.soreness_level}/10
- Soreness areas: ${feedback.soreness_areas?.length > 0 ? feedback.soreness_areas.join(", ") : "none"}
- Sleep: ${feedback.sleep_hours ?? "?"} hrs, quality ${feedback.sleep_quality ?? "?"}/10
- Notes: ${feedback.notes ?? "none"}
- Injury flag: ${feedback.injury_flag ? "YES" : "no"}`;
    }

    context += `\n\nRespond with ONLY a 1-2 sentence coach analysis of this session. Be specific — reference actual pace, HR, effort, and how it compares to the prescribed workout if available. Keep it direct and actionable. Do not use quotation marks around your response.`;

    const analysis = await callGeminiText(COACH_SYSTEM_PROMPT, context);

    // Cache it
    await db
      .from("activities")
      .update({ coach_analysis: analysis.trim() })
      .eq("id", activity_id);

    return NextResponse.json({ analysis: analysis.trim() });
  } catch (err) {
    console.error("[activity-analysis] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
