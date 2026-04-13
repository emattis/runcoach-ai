"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/db";
import { formatPace, formatDuration, getWeekStart, workoutColor, riskLevel } from "@/lib/utils";
import { FeedbackModal } from "@/components/dashboard/FeedbackModal";
import { WorkoutFeedbackModal } from "@/components/ui/WorkoutFeedbackModal";
import { QuickNoteModal } from "@/components/ui/QuickNoteModal";
import { estimateCurrentFitness, formatRaceTime, parseTargetTime } from "@/lib/race-predictor";
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
  riskFactors: string[];
  riskRecommendation: string;
  // Today's sessions
  todaySessions: {
    workout_type: WorkoutType;
    description: string | null;
    target_distance: number | null;
    target_pace_range: string | null;
    target_hr_zone: string | null;
    completed: boolean;
    id: string;
  }[];
  // Goals
  marathonTarget: string;
  halfTarget: string;
  mileageTarget: number;
  // Predictions
  predictedMarathon: number | null;
  predictedHalf: number | null;
  // Coach note
  coachNote: string | null;
  // Phase transition
  phaseTransition: {
    ready: boolean;
    suggestedPhase: string | null;
    reasons: string[];
    blockers: string[];
  } | null;
  // Coach insights (top learnings)
  coachInsights: {
    category: string;
    insight: string;
    confidence: number;
  }[];
  // Weekly review
  weeklyReview: {
    analysis: string;
    planAdherence: number;
    recommendations: string[];
    weekStart: string;
  } | null;
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
  riskFactors: [],
  riskRecommendation: "",
  todaySessions: [],
  marathonTarget: "2:40",
  halfTarget: "1:15",
  mileageTarget: 65,
  predictedMarathon: null,
  predictedHalf: null,
  coachNote: null,
  phaseTransition: null,
  coachInsights: [],
  weeklyReview: null,
  recentRuns: [],
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardState>(INITIAL_STATE);
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [completingWorkout, setCompletingWorkout] = useState<{
    id: string;
    label: string;
  } | null>(null);
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
      riskRes,
      learningRes,
      summaryRes,
      insightsRes,
      phaseRes,
    ] = await Promise.all([
      getSupabase().from("athlete_profile").select("*").limit(1).single(),
      getSupabase()
        .from("activities")
        .select("id, activity_date, distance_miles, avg_pace_per_mile, avg_hr, duration_seconds, perceived_effort")
        .gte("activity_date", weekStart)
        .eq("activity_type", "run")
        .order("activity_date", { ascending: false }),
      getSupabase()
        .from("planned_workouts")
        .select("id, workout_type, description, target_distance, target_pace_range, target_hr_zone, completed")
        .eq("workout_date", today)
        .order("created_at", { ascending: true }),
      getSupabase()
        .from("training_plans")
        .select("target_mileage")
        .gte("week_start", weekStart)
        .order("week_start", { ascending: false })
        .limit(1)
        .single(),
      fetch("/api/coach/risk").then((r) => r.json()).catch(() => ({ score: 0, factors: [], recommendation: "" })),
      getSupabase()
        .from("coach_learnings")
        .select("insight")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single(),
      getSupabase()
        .from("weekly_summaries")
        .select("week_start, coach_analysis, plan_adherence_pct, recommendations")
        .order("week_start", { ascending: false })
        .limit(1)
        .single(),
      getSupabase()
        .from("coach_learnings")
        .select("category, insight, confidence")
        .order("confidence", { ascending: false })
        .limit(5),
      fetch("/api/coach/phase").then((r) => r.json()).catch(() => null),
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
    const todaySessions: {
      id: string;
      workout_type: string;
      description: string | null;
      target_distance: number | null;
      target_pace_range: string | null;
      target_hr_zone: string | null;
      completed: boolean;
    }[] = todayWorkoutRes.data ?? [];

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
      injuryRiskScore: riskRes.score ?? 0,
      riskFactors: riskRes.factors ?? [],
      riskRecommendation: riskRes.recommendation ?? "",
      todaySessions: todaySessions.map((s) => ({
        ...s,
        workout_type: s.workout_type as WorkoutType,
      })),
      marathonTarget: athlete?.goals?.marathon_target ?? "2:40",
      halfTarget: athlete?.goals?.half_target ?? "1:15",
      mileageTarget: athlete?.goals?.weekly_mileage_target ?? 65,
      coachNote: learningRes.data?.insight ?? null,
      phaseTransition: phaseRes?.ready != null
        ? {
            ready: phaseRes.ready,
            suggestedPhase: phaseRes.suggestedPhase ?? null,
            reasons: phaseRes.reasons ?? [],
            blockers: phaseRes.blockers ?? [],
          }
        : null,
      coachInsights: (insightsRes.data ?? []).map(
        (l: { category: string; insight: string; confidence: number }) => ({
          category: l.category,
          insight: l.insight,
          confidence: l.confidence,
        })
      ),
      weeklyReview: summaryRes.data
        ? {
            analysis: summaryRes.data.coach_analysis ?? "",
            planAdherence: summaryRes.data.plan_adherence_pct ?? 0,
            recommendations: Array.isArray(summaryRes.data.recommendations)
              ? summaryRes.data.recommendations
              : [],
            weekStart: summaryRes.data.week_start,
          }
        : null,
      recentRuns: activities,
      predictedMarathon: (() => {
        const fit = estimateCurrentFitness(activities);
        return fit?.predictions.marathon ?? null;
      })(),
      predictedHalf: (() => {
        const fit = estimateCurrentFitness(activities);
        return fit?.predictions.half ?? null;
      })(),
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight m-0">
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
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <button
            onClick={() => setShowQuickNote(true)}
            className="px-3 py-2.5 md:py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer"
            style={{ borderColor: "var(--border-light)", color: "var(--teal)", background: "transparent" }}
          >
            Note to Coach
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2.5 md:py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer disabled:opacity-50"
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
            {generating ? "Generating..." : data.todaySessions.length > 0 ? "Regenerate Plan" : "Generate Plan"}
          </button>
        </div>
      </div>

      {/* Phase Transition Banner */}
      {data.phaseTransition?.ready && data.phaseTransition.suggestedPhase && (
        <PhaseTransitionBanner
          currentPhase={data.currentPhase}
          suggestedPhase={data.phaseTransition.suggestedPhase}
          reasons={data.phaseTransition.reasons}
          onAccept={async () => {
            await fetch("/api/coach/phase", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ new_phase: data.phaseTransition!.suggestedPhase }),
            });
            await loadDashboard();
          }}
        />
      )}

      {/* Phase Blockers (subtle) */}
      {data.phaseTransition && !data.phaseTransition.ready && data.phaseTransition.blockers.length > 0 && (
        <PhaseBlockersInfo blockers={data.phaseTransition.blockers} />
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
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
        <RiskGauge
          score={data.injuryRiskScore}
          factors={data.riskFactors}
          recommendation={data.riskRecommendation}
        />

        {/* Row 2 */}
        <div className="sm:col-span-2">
          <TodaySessionsCard
            sessions={data.todaySessions}
            onMarkComplete={(session) => {
              const label = session.target_distance
                ? `${session.target_distance} mi ${session.workout_type.replace("_", " ")}`
                : session.workout_type.replace("_", " ");
              setCompletingWorkout({ id: session.id, label });
            }}
          />
        </div>
        <div className="sm:col-span-2">
          <GoalCard
            marathonTarget={data.marathonTarget}
            halfTarget={data.halfTarget}
            mileageTarget={data.mileageTarget}
            currentWeeklyMileage={data.currentMileage}
            predictedMarathon={data.predictedMarathon}
            predictedHalf={data.predictedHalf}
          />
        </div>

        {/* Row 3 */}
        <div className="sm:col-span-2">
          <CoachNoteCard note={data.coachNote} />
        </div>
        <div className="sm:col-span-2">
          <RecentRuns
            runs={data.recentRuns}
            onAddFeedback={(run) => setFeedbackActivity(run)}
          />
        </div>
      </div>

      {/* Weekly Review */}
      <WeeklyReviewSection
        review={data.weeklyReview}
        analyzing={analyzing}
        onAnalyze={async () => {
          setAnalyzing(true);
          try {
            await fetch("/api/coach/analyze", { method: "POST" });
            await loadDashboard();
          } finally {
            setAnalyzing(false);
          }
        }}
      />

      {/* Coach Insights */}
      {data.coachInsights.length > 0 && (
        <CoachInsightsSection insights={data.coachInsights} />
      )}

      {/* Run Feedback Modal (from Recent Runs) */}
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

      {/* Workout Completion Feedback Modal */}
      {completingWorkout && (
        <WorkoutFeedbackModal
          type="run"
          workoutId={completingWorkout.id}
          workoutLabel={completingWorkout.label}
          onClose={() => setCompletingWorkout(null)}
          onSaved={async () => {
            // Mark the workout complete after feedback
            await getSupabase()
              .from("planned_workouts")
              .update({ completed: true })
              .eq("id", completingWorkout.id);
            setCompletingWorkout(null);
            loadDashboard();
          }}
          onSkip={async () => {
            // Skip feedback, just mark complete
            await getSupabase()
              .from("planned_workouts")
              .update({ completed: true })
              .eq("id", completingWorkout.id);
            setCompletingWorkout(null);
            loadDashboard();
          }}
        />
      )}

      {/* Quick Note Modal */}
      {showQuickNote && (
        <QuickNoteModal
          onClose={() => setShowQuickNote(false)}
          onSaved={() => {
            setShowQuickNote(false);
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

function RiskGauge({
  score,
  factors,
  recommendation,
}: {
  score: number;
  factors: string[];
  recommendation: string;
}) {
  const [expanded, setExpanded] = useState(false);
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

      {/* Expandable factors */}
      {factors.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-[10px] font-medium border-0 cursor-pointer p-0"
            style={{ background: "transparent", color: "var(--text-dim)" }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
              }}
            >
              <path d="M3 1.5L7 5L3 8.5" />
            </svg>
            {factors.length} factor{factors.length !== 1 ? "s" : ""}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5">
              {factors.map((f, i) => (
                <div
                  key={i}
                  className="text-[10px] leading-tight"
                  style={{ color: "var(--text-muted)" }}
                >
                  &bull; {f}
                </div>
              ))}
              {recommendation && (
                <div
                  className="text-[10px] leading-tight mt-2 pt-2 border-t"
                  style={{
                    color: score > 70 ? "var(--red)" : "var(--text-muted)",
                    borderColor: "var(--border)",
                    fontStyle: "italic",
                  }}
                >
                  {recommendation}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Component: TodayWorkoutCard ----

type SessionItem = DashboardState["todaySessions"][number];

function TodaySessionsCard({
  sessions,
  onMarkComplete,
}: {
  sessions: DashboardState["todaySessions"];
  onMarkComplete: (session: SessionItem) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div
        className="rounded-xl p-6 border h-full flex flex-col justify-center items-center"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div className="text-sm" style={{ color: "var(--text-dim)" }}>
          No sessions planned for today
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
          Generate a plan to get started
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-6 border h-full"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wider mb-4"
        style={{ color: "var(--text-dim)" }}
      >
        Today&apos;s Sessions
      </div>
      <div className="space-y-3">
        {sessions.map((s) => {
          const color = workoutColor(s.workout_type);
          return (
            <div
              key={s.id}
              className="flex items-start gap-3 py-2 border-b last:border-0"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase flex-shrink-0 mt-0.5"
                style={{ background: `${color}22`, color }}
              >
                {s.workout_type.replace("_", " ")}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm m-0 leading-relaxed" style={{ color: "var(--text)" }}>
                  {s.description ?? s.workout_type.replace("_", " ")}
                </p>
                <div className="flex gap-4 mt-1">
                  {s.target_distance ? (
                    <span className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                      {s.target_distance} mi
                    </span>
                  ) : null}
                  {s.target_pace_range ? (
                    <span className="text-xs" style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                      {s.target_pace_range}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex-shrink-0">
                {s.completed ? (
                  <span
                    className="px-2 py-1 rounded text-[10px] font-medium"
                    style={{ background: "var(--green-soft)", color: "var(--green)" }}
                  >
                    Done
                  </span>
                ) : (
                  <button
                    onClick={() => onMarkComplete(s)}
                    className="px-2 py-1 rounded text-[10px] font-medium border-0 cursor-pointer transition-colors"
                    style={{ background: "var(--green-soft)", color: "var(--green)" }}
                  >
                    Complete
                  </button>
                )}
              </div>
            </div>
          );
        })}
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
  predictedMarathon,
  predictedHalf,
}: {
  marathonTarget: string;
  halfTarget: string;
  mileageTarget: number;
  currentWeeklyMileage: number;
  predictedMarathon: number | null;
  predictedHalf: number | null;
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
        <GoalRowWithPrediction
          label="Marathon"
          target={marathonTarget}
          predicted={predictedMarathon}
          accent="var(--amber)"
        />
        <GoalRowWithPrediction
          label="Half Marathon"
          target={halfTarget}
          predicted={predictedHalf}
          accent="var(--orange)"
        />
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

function GoalRowWithPrediction({
  label,
  target,
  predicted,
  accent,
}: {
  label: string;
  target: string;
  predicted: number | null;
  accent: string;
}) {
  const targetSec = parseTargetTime(target);

  let predColor = "var(--text-dim)";
  if (predicted !== null && targetSec > 0) {
    const pctDiff = ((predicted - targetSec) / targetSec) * 100;
    if (pctDiff <= 0) predColor = "var(--green)";
    else if (pctDiff <= 3) predColor = "var(--amber)";
    else predColor = "var(--red)";
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="flex items-center gap-3">
        {predicted !== null && (
          <span
            className="text-xs font-medium"
            style={{ fontFamily: "var(--font-mono)", color: predColor }}
          >
            Est: {formatRaceTime(predicted)}
          </span>
        )}
        <span
          className="text-sm font-semibold"
          style={{ fontFamily: "var(--font-mono)", color: accent }}
        >
          {target}
        </span>
      </div>
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

// ---- Component: PhaseTransitionBanner ----

function PhaseTransitionBanner({
  currentPhase,
  suggestedPhase,
  reasons,
  onAccept,
}: {
  currentPhase: string;
  suggestedPhase: string;
  reasons: string[];
  onAccept: () => void;
}) {
  const [accepting, setAccepting] = useState(false);

  return (
    <div
      className="rounded-xl px-5 py-4 mb-6 border"
      style={{
        background: "var(--amber-soft)",
        borderColor: "var(--amber)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--amber)" }}
          >
            Phase Transition Ready
          </div>
          <div className="text-sm mb-3" style={{ color: "var(--text)" }}>
            Coach suggests transitioning from{" "}
            <strong>{currentPhase.replace("_", " ")}</strong> to{" "}
            <strong>{suggestedPhase.replace("_", " ")}</strong>
          </div>
          <ul className="m-0 pl-4 space-y-0.5">
            {reasons.map((r, i) => (
              <li
                key={i}
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={async () => {
            setAccepting(true);
            await onAccept();
            setAccepting(false);
          }}
          disabled={accepting}
          className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold border-0 cursor-pointer disabled:opacity-50"
          style={{ background: "var(--amber)", color: "#0f1117" }}
        >
          {accepting ? "Transitioning..." : "Accept Transition"}
        </button>
      </div>
    </div>
  );
}

// ---- Component: PhaseBlockersInfo ----

function PhaseBlockersInfo({ blockers }: { blockers: string[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium border-0 cursor-pointer p-0"
        style={{ background: "transparent", color: "var(--text-dim)" }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="6" cy="6" r="5" />
          <path d="M6 4v2.5M6 8h.01" />
        </svg>
        {blockers.length} item{blockers.length !== 1 ? "s" : ""} before next
        phase transition
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          <path d="M3 1.5L7 5L3 8.5" />
        </svg>
      </button>
      {expanded && (
        <ul
          className="mt-2 pl-4 space-y-1 m-0"
          style={{ listStyle: "none" }}
        >
          {blockers.map((b, i) => (
            <li
              key={i}
              className="text-xs flex items-start gap-1.5"
              style={{ color: "var(--text-dim)" }}
            >
              <span style={{ color: "var(--orange)" }}>&bull;</span>
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Component: CoachInsightsSection ----

const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  injury_pattern: { color: "var(--red)", bg: "var(--red-soft)" },
  optimal_volume: { color: "var(--amber)", bg: "var(--amber-soft)" },
  recovery_needs: { color: "var(--teal)", bg: "var(--teal-soft)" },
  race_readiness: { color: "var(--green)", bg: "var(--green-soft)" },
  pacing_tendency: { color: "var(--blue)", bg: "var(--blue-soft)" },
  sleep_performance: { color: "var(--purple)", bg: "var(--purple-soft)" },
  soreness_pattern: { color: "var(--orange)", bg: "var(--orange-soft)" },
};

function CoachInsightsSection({
  insights,
}: {
  insights: DashboardState["coachInsights"];
}) {
  return (
    <div
      className="rounded-xl border p-6 mt-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wider mb-4"
        style={{ color: "var(--text-dim)" }}
      >
        Coach Insights
      </div>
      <div className="space-y-4">
        {insights.map((insight, i) => {
          const cat =
            CATEGORY_COLORS[insight.category] ?? CATEGORY_COLORS.optimal_volume;
          const pct = Math.round(insight.confidence * 100);

          return (
            <div key={i} className="flex gap-4">
              {/* Confidence bar */}
              <div className="flex flex-col items-center pt-1" style={{ width: 40 }}>
                <div
                  className="text-xs font-semibold"
                  style={{ fontFamily: "var(--font-mono)", color: cat.color }}
                >
                  {pct}%
                </div>
                <div
                  className="w-1.5 flex-1 rounded-full mt-1 overflow-hidden"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  <div
                    className="w-full rounded-full transition-all"
                    style={{
                      height: `${pct}%`,
                      background: cat.color,
                    }}
                  />
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase mb-1.5"
                  style={{ background: cat.bg, color: cat.color }}
                >
                  {insight.category.replace(/_/g, " ")}
                </span>
                <p
                  className="text-sm leading-relaxed m-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  {insight.insight}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Component: WeeklyReviewSection ----

function WeeklyReviewSection({
  review,
  analyzing,
  onAnalyze,
}: {
  review: DashboardState["weeklyReview"];
  analyzing: boolean;
  onAnalyze: () => void;
}) {
  return (
    <div
      className="rounded-xl border p-6 mt-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-dim)" }}
        >
          Weekly Review
        </div>
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold border-0 cursor-pointer disabled:opacity-50 transition-colors"
          style={{ background: "var(--teal)", color: "#0f1117" }}
        >
          {analyzing ? "Analyzing..." : "Run Weekly Analysis"}
        </button>
      </div>

      {analyzing && (
        <div className="py-8 text-center">
          <div className="text-sm" style={{ color: "var(--text-dim)" }}>
            AI coach is analyzing your week...
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
            This may take a moment
          </div>
        </div>
      )}

      {!analyzing && !review && (
        <div className="text-sm" style={{ color: "var(--text-dim)" }}>
          No weekly analysis yet. Run one at the end of your training week.
        </div>
      )}

      {!analyzing && review && (
        <div>
          {/* Adherence badge */}
          <div className="flex items-center gap-3 mb-4">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold"
              style={{
                fontFamily: "var(--font-mono)",
                background:
                  review.planAdherence >= 80
                    ? "var(--green-soft)"
                    : review.planAdherence >= 60
                      ? "var(--amber-soft)"
                      : "var(--red-soft)",
                color:
                  review.planAdherence >= 80
                    ? "var(--green)"
                    : review.planAdherence >= 60
                      ? "var(--amber)"
                      : "var(--red)",
              }}
            >
              {review.planAdherence}% adherence
            </span>
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>
              Week of {new Date(review.weekStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>

          {/* Analysis text */}
          <p
            className="text-sm leading-relaxed m-0 mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            {review.analysis}
          </p>

          {/* Recommendations */}
          {review.recommendations.length > 0 && (
            <div>
              <div
                className="text-xs font-medium uppercase mb-2"
                style={{ color: "var(--text-dim)" }}
              >
                Recommendations
              </div>
              <ul className="m-0 pl-4 space-y-1">
                {review.recommendations.map((rec, i) => (
                  <li
                    key={i}
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {String(rec)}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
