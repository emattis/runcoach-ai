import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { analyzePatterns, type PatternInput } from "@/lib/pattern-detection";

/**
 * POST /api/coach/patterns
 * Run pattern detection and update coach_learnings accordingly.
 */
export async function POST() {
  const db = createServiceClient();

  try {
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
    const cutoff = twelveWeeksAgo.toISOString().split("T")[0];

    // Load data in parallel
    const [activitiesRes, feedbackRes, summariesRes, athleteRes, learningsRes] =
      await Promise.all([
        db
          .from("activities")
          .select("activity_date, distance_miles, avg_pace_per_mile")
          .gte("activity_date", cutoff)
          .eq("activity_type", "run")
          .order("activity_date", { ascending: true }),
        db
          .from("run_feedback")
          .select(
            "activity_id, feel_rating, soreness_level, soreness_areas, sleep_quality, sleep_hours, injury_flag, created_at"
          )
          .gte("created_at", twelveWeeksAgo.toISOString())
          .order("created_at", { ascending: true }),
        db
          .from("weekly_summaries")
          .select("week_start, total_mileage, avg_feel_rating, injury_risk_score")
          .gte("week_start", cutoff)
          .order("week_start", { ascending: true }),
        db
          .from("athlete_profile")
          .select("preferences")
          .limit(1)
          .single(),
        db
          .from("coach_learnings")
          .select("*")
          .order("confidence", { ascending: false }),
      ]);

    const input: PatternInput = {
      activities: activitiesRes.data ?? [],
      feedback: feedbackRes.data ?? [],
      weeklySummaries: summariesRes.data ?? [],
      athletePreferences: athleteRes.data?.preferences ?? undefined,
    };

    const detected = analyzePatterns(input);
    const existing = learningsRes.data ?? [];

    const newPatterns: string[] = [];
    const updatedPatterns: string[] = [];
    const removedPatterns: string[] = [];

    for (const pattern of detected) {
      // Check if a similar learning already exists (same category, similar insight)
      const match = existing.find(
        (e) =>
          e.category === pattern.category &&
          hasOverlap(e.insight, pattern.insight)
      );

      if (match) {
        // Reinforce: increase confidence (capped at 0.98)
        const newConfidence = Math.min(
          0.98,
          match.confidence + 0.05
        );
        await db
          .from("coach_learnings")
          .update({
            confidence: Math.round(newConfidence * 100) / 100,
            insight: pattern.insight, // Update with latest wording
            evidence: pattern.evidence,
            updated_at: new Date().toISOString(),
          })
          .eq("id", match.id);
        updatedPatterns.push(pattern.category);
      } else {
        // New pattern
        await db.from("coach_learnings").insert({
          category: pattern.category,
          insight: pattern.insight,
          confidence: pattern.confidence,
          evidence: pattern.evidence,
        });
        newPatterns.push(pattern.category);
      }
    }

    // Check existing learnings that weren't reinforced — decrease confidence
    const detectedCategories = new Set(detected.map((d) => d.category));
    for (const learning of existing) {
      // Only decay pattern-detection categories, not AI-generated or seed learnings
      const patternCategories = [
        "sleep_performance",
        "pacing_tendency",
        "soreness_pattern",
      ];
      if (!patternCategories.includes(learning.category)) continue;

      if (!detectedCategories.has(learning.category)) {
        const newConfidence = learning.confidence - 0.05;
        if (newConfidence < 0.3) {
          await db.from("coach_learnings").delete().eq("id", learning.id);
          removedPatterns.push(learning.category);
        } else {
          await db
            .from("coach_learnings")
            .update({
              confidence: Math.round(newConfidence * 100) / 100,
              updated_at: new Date().toISOString(),
            })
            .eq("id", learning.id);
        }
      }
    }

    return NextResponse.json({
      patterns_detected: detected.length,
      new_patterns: newPatterns,
      updated_patterns: updatedPatterns,
      removed_patterns: removedPatterns,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Pattern detection error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Check if two insight strings share enough keywords to be considered the same pattern */
function hasOverlap(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap >= 3;
}
