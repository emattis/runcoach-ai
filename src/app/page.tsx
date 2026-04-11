"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/db";
import { formatPace, formatDuration, getWeekStart, workoutColor, riskLevel } from "@/lib/utils";
import { FeedbackModal } from "@/components/dashboard/FeedbackModal";
import type { WorkoutType } from "@/types";

// ---- Types for dashboard data ----

interface DashboardState {
  loading: boolean;
  athleteName: string;
  currentPhase: string;
  // Mileage
  currentMileage: number;
  targetMileage: number;
  // Stats
  runsThisWeek: number;
  avgPace: number | null;
  injuryRiskScore: number;
  // Today's workout
  todayWorkout: {
    workout_type: WorkoutType;
    description: string | null;
    target_distance: number | null;
    target_pace_range: string | null;
    target_hr_zone: string | null;
    completed: boolean;
    id: string;
  } | null;
  // Goals
  marathonTarget: string;
  halfTarget: string;
  mileageTarget: number;
  // Coach note
  coachNote: string | null;
  // Recent runs
  recentRuns: {
    id: string;
    activity_date: string;
    distance_miles: number | null;
    avg_pace_per_mile: number | null;
    avg_hr: number | null;
    duration_seconds: number | null;
    has_feedback: boolean;
  }[];
}

const INITIAL_STATE: DashboardState = {
  loading: true,
  athleteName: "",
  currentPhase: "base_building",
  currentMileage: 0,
  targetMileage: 0,
  runsThisWeek: 0,
  avgPace: null,
  injuryRiskScore: 0,
  todayWorkout: null,
  marathonTarget: "2:40",
  halfTarget: "1:15",
  mileageTarget: 65,
  coachNote: null,
  recentRuns: [],
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardState>(INITIAL_STATE);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [feedbackActivity, setFeedbackActivity] = useState<{
    id: string;
    activity_date: string;
    distance_miles: number | null;
    avg_pace_per_mile: number | null;
  } | null>(null);

  const loadDashboard = useCallback(async () => {
    const weekStart = getWeekStart(new Date());
    const today = new Date().toISOString().split("T")[0];

    // Run all queries in parallel
    const [
      athleteRes,
      activitiesRes,
      todayWorkoutRes,
      planRes,
      summaryRes,
      learningRes,
    ] = await Promise.all([
      getSupabase().from("athlete_profile").select("*").limit(1).single(),
      getSupabase()
        .from("activities")
        .select("id, activity_date, distance_miles, avg_pace_per_mile, avg_hr, duration_seconds")
        .gte("activity_date", weekStart)
        .eq("activity_type", "run")
        .order("activity_date", { ascending: false }),
      getSupabase()
        .from("planned_workouts")
        .select("id, workout_type, description, target_distance, target_pace_range, target_hr_zone, completed")
        .eq("workout_date", today)
        .limit(1)
        .single(),
      getSupabase()
        .from("training_plans")
        .select("target_mileage")
        .gte("week_start", weekStart)
        .order("week_start", { ascending: false })
        .limit(1)
        .single(),
      getSupabase()
        .from("weekly_summaries")
        .select("injury_risk_score")
        .order("week_start", { ascending: false })
        .limit(1)
        .single(),
      getSupabase()
        .from("coach_learnings")
        .select("insight")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single(),
    ]);

    const athlete = athleteRes.data;
    const rawActivities: {
      id: string;
      activity_date: string;
      distance_miles: number | null;
      avg_pace_per_mile: number | null;
      avg_hr: number | null;
      duration_seconds: number | null;
    }[] = activitiesRes.data ?? [];
    const todayW = todayWorkoutRes.data;

    // Check which activities have feedback
    const activityIds = rawActivities.map((a) => a.id);
    let feedbackIds = new Set<string>();
    if (activityIds.length > 0) {
      const { data: feedbackData } = await getSupabase()
        .from("run_feedback")
        .select("activity_id")
        .in("activity_id", activityIds);
      feedbackIds = new Set(
        (feedbackData ?? []).map((f: { activity_id: string }) => f.activity_id)
      );
    }
    const activities = rawActivities.map((a) => ({
      ...a,
      has_feedback: feedbackIds.has(a.id),
    }));

    const currentMileage = activities.reduce(
      (sum: number, a) => sum + (a.distance_miles ?? 0),
      0
    );

    const paces = activities
      .map((a) => a.avg_pace_per_mile)
      .filter((p): p is number => p !== null);
    const avgPace =
      paces.length > 0
        ? paces.reduce((sum: number, p: number) => sum + p, 0) / paces.length
        : null;

    setData({
      loading: false,
      athleteName: athlete?.name ?? "Athlete",
      currentPhase: athlete?.current_phase ?? "base_building",
      currentMileage: Math.round(currentMileage * 10) / 10,
      targetMileage: planRes.data?.target_mileage ?? 0,
      runsThisWeek: activities.length,
      avgPace,
      injuryRiskScore: summaryRes.data?.injury_risk_score ?? 20,
      todayWorkout: todayW
        ? {
            ...todayW,
            workout_type: todayW.workout_type as WorkoutType,
          }
        : null,
      marathonTarget: athlete?.goals?.marathon_target ?? "2:40",
      halfTarget: athlete?.goals?.half_target ?? "1:15",
      mileageTarget: athlete?.goals?.weekly_mileage_target ?? 65,
      coachNote: learningRes.data?.insight ?? null,
      recentRuns: activities,
    });
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/strava/sync", { method: "POST" });
      const result = await res.json();
      if (result.synced > 0) await loadDashboard();
    } finally {
      setSyncing(false);
    }
  };

  const handleGeneratePlan = async () => {
    setGenerating(true);
    try {
      await fetch("/api/coach/plan", { method: "POST" });
      await loadDashboard();
    } finally {
      setGenerating(false);
    }
  };

  if (data.loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div
          className="text-sm font-medium"
          style={{ color: "var(--text-dim)" }}
        >
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight m-0">
            Dashboard
          </h1>
          <div
            className="flex items-center gap-2 mt-1 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                background: "var(--teal-soft)",
                color: "var(--teal)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--teal)" }}
              />
              {data.currentPhase.replace("_", " ")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer disabled:opacity-50"
            style={{
              borderColor: "var(--border-light)",
              color: "var(--text-muted)",
              background: "transparent",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--bg-elevated)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            {syncing ? "Syncing..." : "Sync Strava"}
          </button>
          <button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="px-4 py-2 rounded-lg text-sm font-semibold border-0 transition-colors cursor-pointer disabled:opacity-50"
            style={{
              background: "var(--amber)",
              color: "#0f1117",
            }}
          >
            {generating ? "Generating..." : "Generate Plan"}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {/* Row 1 */}
        <MileageProgress
          current={data.currentMileage}
          target={data.targetMileage}
        />
        <StatCard
          label="Runs"
          value={String(data.runsThisWeek)}
          sub="this week"
          accent="var(--blue)"
          accentBg="var(--blue-soft)"
        />
        <StatCard
          label="Avg Pace"
          value={data.avgPace ? formatPace(data.avgPace) : "--:--"}
          sub="/mi"
          accent="var(--teal)"
          accentBg="var(--teal-soft)"
        />
        <RiskGauge score={data.injuryRiskScore} />

        {/* Row 2 */}
        <div style={{ gridColumn: "span 2" }}>
          <TodayWorkoutCard workout={data.todayWorkout} />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <GoalCard
            marathonTarget={data.marathonTarget}
            halfTarget={data.halfTarget}
            mileageTarget={data.mileageTarget}
            currentWeeklyMileage={data.currentMileage}
          />
        </div>

        {/* Row 3 */}
        <div style={{ gridColumn: "span 2" }}>
          <CoachNoteCard note={data.coachNote} />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <RecentRuns
            runs={data.recentRuns}
            onAddFeedback={(run) => setFeedbackActivity(run)}
          />
        </div>
      </div>

      {/* Feedback Modal */}
      {feedbackActivity && (
        <FeedbackModal
          activity={feedbackActivity}
          onClose={() => setFeedbackActivity(null)}
          onSaved={() => {
            setFeedbackActivity(null);
            loadDashboard();
          }}
        />
      )}
    </div>
  );
}

// ---- Component: MileageProgress ----

function MileageProgress({
  current,
  target,
}: {
  current: number;
  target: number;
}) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  return (
    <div
      className="rounded-xl p-5 border"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wider mb-3"
        style={{ color: "var(--text-dim)" }}
      >
        Weekly Mileage
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span
          className="text-3xl font-semibold"
          style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}
        >
          {current.toFixed(1)}
        </span>
        <span className="text-sm" style={{ color: "var(--text-dim)" }}>
          / {target > 0 ? target : "—"} mi
        </span>
      </div>
      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: pct >= 100 ? "var(--green)" : "var(--amber)",
          }}
        />
      </div>
      <div
        className="text-xs mt-2"
        style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
      >
        {Math.round(pct)}% complete
      </div>
    </div>
  );
}

// ---- Component: StatCard ----

function StatCard({
  label,
  value,
  sub,
  accent,
  accentBg,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  accentBg: string;
}) {
  return (
    <div
      className="rounded-xl p-5 border"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wider mb-3"
        style={{ color: "var(--text-dim)" }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-3xl font-semibold"
          style={{ fontFamily: "var(--font-mono)", color: accent }}
        >
          {value}
        </span>
        <span className="text-sm" style={{ color: "var(--text-dim)" }}>
          {sub}
        </span>
      </div>
      <div
        className="mt-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
        style={{ background: accentBg, color: accent }}
      >
        {label}
      </div>
    </div>
  );
}

// ---- Component: RiskGauge ----

function RiskGauge({ score }: { score: number }) {
  const risk = riskLevel(score);
  // Semicircle gauge: angle from -90 to 90 degrees
  const angle = -90 + (score / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  // Needle endpoint (radius 35, centered at 50,50)
  const nx = 50 + 35 * Math.cos(rad);
  const ny = 50 + 35 * Math.sin(rad);

  return (
    <div
      className="rounded-xl p-5 border"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wider mb-2"
        style={{ color: "var(--text-dim)" }}
      >
        Injury Risk
      </div>
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 100 58" width="120" height="70">
          {/* Background arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="var(--bg-elevated)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          {/* Green zone 0-30 */}
          <path
            d="M 10 50 A 40 40 0 0 1 23.18 18.04"
            fill="none"
            stroke="var(--green)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.4"
          />
          {/* Yellow zone 30-50 */}
          <path
            d="M 23.18 18.04 A 40 40 0 0 1 40.6 11.34"
            fill="none"
            stroke="var(--yellow)"
            strokeWidth="6"
            opacity="0.4"
          />
          {/* Orange zone 50-70 */}
          <path
            d="M 40.6 11.34 A 40 40 0 0 1 59.4 11.34"
            fill="none"
            stroke="var(--orange)"
            strokeWidth="6"
            opacity="0.4"
          />
          {/* Red zone 70-100 */}
          <path
            d="M 59.4 11.34 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="var(--red)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.4"
          />
          {/* Needle */}
          <line
            x1="50"
            y1="50"
            x2={nx}
            y2={ny}
            stroke={risk.color}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="50" cy="50" r="3" fill={risk.color} />
        </svg>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-mono)", color: risk.color }}
          >
            {score}
          </span>
          <span
            className="text-xs font-medium uppercase"
            style={{ color: risk.color }}
          >
            {risk.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---- Component: TodayWorkoutCard ----

function TodayWorkoutCard({
  workout,
}: {
  workout: DashboardState["todayWorkout"];
}) {
  const [marking, setMarking] = useState(false);

  const handleComplete = async () => {
    if (!workout) return;
    setMarking(true);
    await getSupabase()
      .from("planned_workouts")
      .update({ completed: true })
      .eq("id", workout.id);
    setMarking(false);
  };

  if (!workout) {
    return (
      <div
        className="rounded-xl p-6 border h-full flex flex-col justify-center items-center"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-sm" style={{ color: "var(--text-dim)" }}>
          No workout planned for today
        </div>
        <div
          className="text-xs mt-1"
          style={{ color: "var(--text-dim)" }}
        >
          Generate a plan to get started
        </div>
      </div>
    );
  }

  const color = workoutColor(workout.workout_type);

  return (
    <div
      className="rounded-xl p-6 border h-full"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-dim)" }}
        >
          Today&apos;s Workout
        </div>
        {!workout.completed && (
          <button
            onClick={handleComplete}
            disabled={marking}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border-0 cursor-pointer disabled:opacity-50 transition-colors"
            style={{ background: "var(--green-soft)", color: "var(--green)" }}
          >
            {marking ? "Saving..." : "Mark Complete"}
          </button>
        )}
        {workout.completed && (
          <span
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--green-soft)", color: "var(--green)" }}
          >
            Completed
          </span>
        )}
      </div>

      <div className="flex items-start gap-4">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold uppercase"
          style={{ background: `${color}22`, color }}
        >
          {workout.workout_type.replace("_", " ")}
        </span>
        <div className="flex-1">
          <p className="text-sm m-0 leading-relaxed" style={{ color: "var(--text)" }}>
            {workout.description ?? "No description"}
          </p>
          <div className="flex gap-5 mt-3">
            {workout.target_distance && (
              <div>
                <div
                  className="text-xs uppercase"
                  style={{ color: "var(--text-dim)" }}
                >
                  Distance
                </div>
                <div
                  className="text-sm font-medium mt-0.5"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
                >
                  {workout.target_distance} mi
                </div>
              </div>
            )}
            {workout.target_pace_range && (
              <div>
                <div
                  className="text-xs uppercase"
                  style={{ color: "var(--text-dim)" }}
                >
                  Pace
                </div>
                <div
                  className="text-sm font-medium mt-0.5"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
                >
                  {workout.target_pace_range}
                </div>
              </div>
            )}
            {workout.target_hr_zone && (
              <div>
                <div
                  className="text-xs uppercase"
                  style={{ color: "var(--text-dim)" }}
                >
                  HR Zone
                </div>
                <div
                  className="text-sm font-medium mt-0.5"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
                >
                  {workout.target_hr_zone}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Component: GoalCard ----

function GoalCard({
  marathonTarget,
  halfTarget,
  mileageTarget,
  currentWeeklyMileage,
}: {
  marathonTarget: string;
  halfTarget: string;
  mileageTarget: number;
  currentWeeklyMileage: number;
}) {
  const mileagePct = mileageTarget > 0
    ? Math.min(Math.round((currentWeeklyMileage / mileageTarget) * 100), 100)
    : 0;

  return (
    <div
      className="rounded-xl p-6 border h-full"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wider mb-4"
        style={{ color: "var(--text-dim)" }}
      >
        Goals
      </div>
      <div className="space-y-4">
        <GoalRow label="Marathon" target={marathonTarget} accent="var(--amber)" />
        <GoalRow label="Half Marathon" target={halfTarget} accent="var(--orange)" />
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              Weekly Mileage
            </span>
            <span
              className="text-sm font-medium"
              style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}
            >
              {currentWeeklyMileage} / {mileageTarget} mi
            </span>
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${mileagePct}%`, background: "var(--teal)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalRow({
  label,
  target,
  accent,
}: {
  label: string;
  target: string;
  accent: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span
        className="text-sm font-semibold"
        style={{ fontFamily: "var(--font-mono)", color: accent }}
      >
        {target}
      </span>
    </div>
  );
}

// ---- Component: CoachNoteCard ----

function CoachNoteCard({ note }: { note: string | null }) {
  return (
    <div
      className="rounded-xl p-6 border h-full flex flex-col"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wider mb-4"
        style={{ color: "var(--text-dim)" }}
      >
        Coach&apos;s Note
      </div>
      {note ? (
        <div className="flex-1 flex items-center">
          <p
            className="text-sm leading-relaxed italic m-0"
            style={{ color: "var(--text-muted)" }}
          >
            &ldquo;{note}&rdquo;
          </p>
        </div>
      ) : (
        <div
          className="flex-1 flex items-center text-sm"
          style={{ color: "var(--text-dim)" }}
        >
          No coach insights yet. Generate a plan to get started.
        </div>
      )}
    </div>
  );
}

// ---- Component: RecentRuns ----

function RecentRuns({
  runs,
  onAddFeedback,
}: {
  runs: DashboardState["recentRuns"];
  onAddFeedback: (run: {
    id: string;
    activity_date: string;
    distance_miles: number | null;
    avg_pace_per_mile: number | null;
  }) => void;
}) {
  return (
    <div
      className="rounded-xl p-6 border h-full"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wider mb-4"
        style={{ color: "var(--text-dim)" }}
      >
        Recent Runs
      </div>
      {runs.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--text-dim)" }}>
          No runs this week yet
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 border-b last:border-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
                    {formatRunDate(run.activity_date)}
                  </div>
                  {run.duration_seconds && (
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {formatDuration(run.duration_seconds)}
                    </div>
                  )}
                </div>
                {!run.has_feedback && (
                  <button
                    onClick={() => onAddFeedback(run)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border-0 cursor-pointer transition-colors"
                    style={{
                      background: "var(--amber-soft)",
                      color: "var(--amber)",
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--amber)" }}
                    />
                    Add feedback
                  </button>
                )}
                {run.has_feedback && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{
                      background: "var(--green-soft)",
                      color: "var(--green)",
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      className="mr-1"
                    >
                      <path
                        d="M2 5L4 7L8 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Logged
                  </span>
                )}
              </div>
              <div className="flex items-center gap-5 text-right">
                <div>
                  <div
                    className="text-sm font-medium"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
                  >
                    {run.distance_miles?.toFixed(1) ?? "—"} mi
                  </div>
                </div>
                <div>
                  <div
                    className="text-sm font-medium"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}
                  >
                    {run.avg_pace_per_mile
                      ? formatPace(run.avg_pace_per_mile)
                      : "—"}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-dim)" }}
                  >
                    /mi
                  </div>
                </div>
                <div>
                  <div
                    className="text-sm font-medium"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}
                  >
                    {run.avg_hr ?? "—"}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-dim)" }}
                  >
                    bpm
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Helpers ----

function formatRunDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
