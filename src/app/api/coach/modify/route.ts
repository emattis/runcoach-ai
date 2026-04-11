import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { COACH_SYSTEM_PROMPT } from "@/lib/coach";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { workout_id, new_workout_type, new_distance, reason } = body;

  if (!workout_id || !reason) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const db = createServiceClient();

  try {
    // 1. Fetch the workout being modified
    const { data: workout, error: wErr } = await db
      .from("planned_workouts")
      .select("*, plan_id")
      .eq("id", workout_id)
      .single();

    if (wErr || !workout) {
      return NextResponse.json(
        { error: "Workout not found" },
        { status: 404 }
      );
    }

    // 2. Fetch rest of the week's workouts for context
    const { data: weekWorkouts } = await db
      .from("planned_workouts")
      .select("workout_date, workout_type, target_distance, description, completed")
      .eq("plan_id", workout.plan_id)
      .order("workout_date", { ascending: true });

    // 3. Fetch the plan for target mileage
    const { data: plan } = await db
      .from("training_plans")
      .select("target_mileage, phase, week_number")
      .eq("id", workout.plan_id)
      .single();

    // 4. Update the workout in DB
    const updateFields: Record<string, unknown> = {
      athlete_modification: reason,
    };
    if (new_workout_type) updateFields.workout_type = new_workout_type;
    if (new_distance != null) updateFields.target_distance = new_distance;

    const { data: updated, error: updateErr } = await db
      .from("planned_workouts")
      .update(updateFields)
      .eq("id", workout_id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update workout: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // 5. Log the adjustment in training_plans.adjustments_made
    const adjustment = {
      date: new Date().toISOString().split("T")[0],
      reason,
      original: `${workout.workout_type} ${workout.target_distance ?? 0} mi`,
      modified: `${new_workout_type ?? workout.workout_type} ${new_distance ?? workout.target_distance ?? 0} mi`,
    };

    // Append to existing adjustments array
    const { data: currentPlan } = await db
      .from("training_plans")
      .select("adjustments_made")
      .eq("id", workout.plan_id)
      .single();

    const existingAdj = Array.isArray(currentPlan?.adjustments_made)
      ? currentPlan.adjustments_made
      : [];

    await db
      .from("training_plans")
      .update({ adjustments_made: [...existingAdj, adjustment] })
      .eq("id", workout.plan_id);

    // 6. Get coach feedback via Gemini
    const weekSummary = (weekWorkouts ?? [])
      .map(
        (w) =>
          `${w.workout_date}: ${w.workout_type} ${w.target_distance ?? 0} mi${w.completed ? " (completed)" : ""}`
      )
      .join("\n");

    const prompt = `The athlete just modified a planned workout. Provide brief coach feedback.

MODIFICATION:
- Date: ${workout.workout_date}
- Original: ${workout.workout_type}, ${workout.target_distance ?? 0} miles
- Changed to: ${new_workout_type ?? workout.workout_type}, ${new_distance ?? workout.target_distance ?? 0} miles
- Reason: ${reason}

WEEK CONTEXT:
- Phase: ${plan?.phase ?? "base_building"}, Week ${plan?.week_number ?? "?"}
- Target weekly mileage: ${plan?.target_mileage ?? "?"} miles
${weekSummary}

Respond with valid JSON:
{
  "coach_response": "1-2 sentence reaction to the modification — supportive if smart, cautionary if risky",
  "suggested_adjustments": [
    {
      "workout_date": "YYYY-MM-DD",
      "suggestion": "brief suggestion for adjusting this day"
    }
  ]
}

Keep suggested_adjustments empty if no other days need changing. Be direct and specific.`;

    let coachResponse = "Modification saved.";
    let suggestedAdjustments: { workout_date: string; suggestion: string }[] = [];

    try {
      const geminiRes = await fetch(
        `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: COACH_SYSTEM_PROMPT }] },
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const text = geminiData.candidates[0].content.parts[0].text;
        const parsed = JSON.parse(text);
        coachResponse = parsed.coach_response ?? coachResponse;
        suggestedAdjustments = parsed.suggested_adjustments ?? [];
      }
    } catch {
      // Gemini call failed — proceed with default response
    }

    return NextResponse.json({
      updated_workout: updated,
      coach_response: coachResponse,
      suggested_adjustments: suggestedAdjustments,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Modify workout error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
