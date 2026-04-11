import { createServiceClient } from "@/lib/db";
import { getWeekStart } from "@/lib/utils";

export type NotificationType =
  | "workout_reminder"
  | "feedback_needed"
  | "injury_warning"
  | "phase_transition"
  | "weekly_review"
  | "coach_insight";

export type Priority = "low" | "medium" | "high";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: Priority;
  read: boolean;
  created_at: string;
}

interface NewNotification {
  type: NotificationType;
  title: string;
  message: string;
  priority: Priority;
}

/**
 * Check various conditions and generate notifications for any that apply.
 * Avoids duplicates by checking if a notification of the same type already
 * exists from today.
 */
export async function generateNotifications(): Promise<NewNotification[]> {
  const db = createServiceClient();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const weekStart = getWeekStart(new Date());

  // Get existing today's notification types to avoid duplicates
  const { data: existing } = await db
    .from("notifications")
    .select("type")
    .gte("created_at", today + "T00:00:00");

  const existingTypes = new Set((existing ?? []).map((n) => n.type));

  const notifications: NewNotification[] = [];

  // 1. Feedback needed — runs from today/yesterday without feedback
  if (!existingTypes.has("feedback_needed")) {
    const { data: recentRuns } = await db
      .from("activities")
      .select("id")
      .in("activity_date", [today, yesterday])
      .eq("activity_type", "run");

    if (recentRuns && recentRuns.length > 0) {
      const runIds = recentRuns.map((r) => r.id);
      const { data: feedbackData } = await db
        .from("run_feedback")
        .select("activity_id")
        .in("activity_id", runIds);

      const feedbackIds = new Set(
        (feedbackData ?? []).map((f) => f.activity_id)
      );
      const missing = runIds.filter((id) => !feedbackIds.has(id));

      if (missing.length > 0) {
        notifications.push({
          type: "feedback_needed",
          title: "Post-Run Feedback",
          message: `You have ${missing.length} run${missing.length > 1 ? "s" : ""} without feedback. Logging how you feel helps the coach adjust your plan.`,
          priority: "medium",
        });
      }
    }
  }

  // 2. Injury warning — risk > 70
  if (!existingTypes.has("injury_warning")) {
    const { data: summary } = await db
      .from("weekly_summaries")
      .select("injury_risk_score")
      .order("week_start", { ascending: false })
      .limit(1)
      .single();

    if (summary && summary.injury_risk_score > 70) {
      notifications.push({
        type: "injury_warning",
        title: "Injury Risk Elevated",
        message: `Your injury risk score is ${summary.injury_risk_score}/100. Consider reducing volume and prioritizing recovery.`,
        priority: "high",
      });
    }
  }

  // 3. Phase transition ready
  if (!existingTypes.has("phase_transition")) {
    try {
      const { evaluatePhaseTransition } = await import("@/lib/phase-manager");

      // Gather minimal data for phase eval
      const [athleteRes, mileageRes, feelRes, riskRes, flagRes] =
        await Promise.all([
          db.from("athlete_profile").select("current_phase, phase_start_date").limit(1).single(),
          db.from("activities")
            .select("activity_date, distance_miles")
            .gte("activity_date", new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
            .eq("activity_type", "run"),
          db.from("run_feedback")
            .select("feel_rating")
            .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
          db.from("weekly_summaries").select("injury_risk_score").order("week_start", { ascending: false }).limit(1).single(),
          db.from("run_feedback").select("injury_flag").eq("injury_flag", true)
            .gte("created_at", new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()),
        ]);

      if (athleteRes.data) {
        const athlete = athleteRes.data;
        const activities: { activity_date: string; distance_miles: number | null }[] = mileageRes.data ?? [];
        const weekMap = new Map<string, number>();
        for (const a of activities) {
          const wk = getWeekStart(new Date(a.activity_date));
          weekMap.set(wk, (weekMap.get(wk) ?? 0) + (a.distance_miles ?? 0));
        }

        const phaseStart = athlete.phase_start_date ? new Date(athlete.phase_start_date) : new Date();
        const weeksInPhase = Math.max(1, Math.ceil((Date.now() - phaseStart.getTime()) / (7 * 24 * 60 * 60 * 1000)));

        const result = evaluatePhaseTransition({
          currentPhase: athlete.current_phase as import("@/types").TrainingPhase,
          phaseStartDate: athlete.phase_start_date,
          weeklyMileages: [...weekMap.values()],
          recentFeelRatings: (feelRes.data ?? []).map((f) => f.feel_rating),
          injuryRiskScore: riskRes.data?.injury_risk_score ?? 20,
          recentInjuryFlags: flagRes.data?.length ?? 0,
          targetRace: null,
          weeksInPhase,
        });

        if (result.ready && result.suggestedPhase) {
          notifications.push({
            type: "phase_transition",
            title: "Phase Transition Ready",
            message: `You're ready to move from ${result.currentPhase.replace("_", " ")} to ${result.suggestedPhase.replace("_", " ")}. Check the dashboard to accept.`,
            priority: "medium",
          });
        }
      }
    } catch {
      // Phase detection is best-effort
    }
  }

  // 4. Weekly review not done
  if (!existingTypes.has("weekly_review")) {
    const lastWeekStart = new Date();
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWk = getWeekStart(lastWeekStart);

    const { data: review } = await db
      .from("weekly_summaries")
      .select("id")
      .eq("week_start", lastWk)
      .limit(1)
      .single();

    // Only suggest if we're past Wednesday of current week
    const dayOfWeek = new Date().getDay();
    if (!review && dayOfWeek >= 3) {
      notifications.push({
        type: "weekly_review",
        title: "Weekly Review",
        message: "Last week's analysis hasn't been run yet. Review your training week from the dashboard.",
        priority: "low",
      });
    }
  }

  // 5. New coach insight
  if (!existingTypes.has("coach_insight")) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLearnings } = await db
      .from("coach_learnings")
      .select("insight, category")
      .gte("created_at", oneDayAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (recentLearnings) {
      notifications.push({
        type: "coach_insight",
        title: "New Coach Insight",
        message: recentLearnings.insight.length > 120
          ? recentLearnings.insight.slice(0, 117) + "..."
          : recentLearnings.insight,
        priority: "low",
      });
    }
  }

  // Insert new notifications
  if (notifications.length > 0) {
    await db.from("notifications").insert(notifications);
  }

  return notifications;
}
