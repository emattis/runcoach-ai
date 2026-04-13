"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/db";
import { getPlanWeekStart, workoutColor } from "@/lib/utils";
import type { WorkoutType } from "@/types";

// ---- Types ----

interface PlannedWorkoutRow {
  id: string;
  workout_date: string;
  workout_type: WorkoutType;
  description: string | null;
  target_distance: number | null;
  target_pace_range: string | null;
  target_hr_zone: string | null;
  warmup: string | null;
  cooldown: string | null;
  completed: boolean;
  athlete_modification: string | null;
}

interface PlanRow {
  id: string;
  week_start: string;
  week_number: number;
  phase: string;
  target_mileage: number;
  coach_notes: string | null;
}

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MODIFIABLE_TYPES: WorkoutType[] = [
  "easy",
  "long_run",
  "recovery",
  "off",
  "cross_train",
];

export default function TrainingPage() {
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [workouts, setWorkouts] = useState<PlannedWorkoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [coachBanner, setCoachBanner] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const weekStart = getPlanWeekStart();

  const load = useCallback(async () => {
    const db = getSupabase();

    const { data: planData } = await db
      .from("training_plans")
      .select("id, week_start, week_number, phase, target_mileage, coach_notes")
      .eq("week_start", weekStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (planData) {
      setPlan(planData as PlanRow);

      const { data: workoutData } = await db
        .from("planned_workouts")
        .select(
          "id, workout_date, workout_type, description, target_distance, target_pace_range, target_hr_zone, warmup, cooldown, completed, athlete_modification"
        )
        .eq("plan_id", planData.id)
        .order("workout_date", { ascending: true });

      setWorkouts((workoutData as PlannedWorkoutRow[]) ?? []);
    }

    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const handleModificationSaved = (coachResponse: string) => {
    setCoachBanner(coachResponse);
    load();
    setTimeout(() => setCoachBanner(null), 15000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>
          Loading training plan...
        </div>
      </div>
    );
  }

  const weekDays = buildWeekDays(weekStart, workouts);
  const selected = selectedIdx !== null ? weekDays[selectedIdx] : null;

  if (!plan) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight mb-8">
          Training Plan
        </h1>
        <div
          className="rounded-xl p-10 border text-center"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-lg font-medium mb-2" style={{ color: "var(--text)" }}>
            No plan for this week
          </div>
          <div className="text-sm mb-6" style={{ color: "var(--text-dim)" }}>
            Generate a training plan from the dashboard to get started.
          </div>
          <a
            href="/"
            className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold no-underline transition-colors"
            style={{ background: "var(--amber)", color: "#0f1117" }}
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Coach response banner */}
      {coachBanner && (
        <div
          className="rounded-xl px-5 py-4 mb-6 flex items-start gap-3 border"
          style={{
            background: "var(--teal-soft)",
            borderColor: "var(--teal)",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            className="mt-0.5 flex-shrink-0"
          >
            <circle cx="9" cy="9" r="8" stroke="var(--teal)" strokeWidth="1.5" />
            <path d="M9 5v4M9 12h.01" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div className="flex-1">
            <div
              className="text-xs font-semibold uppercase mb-1"
              style={{ color: "var(--teal)" }}
            >
              Coach
            </div>
            <div className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
              {coachBanner}
            </div>
          </div>
          <button
            onClick={() => setCoachBanner(null)}
            className="p-1 rounded border-0 cursor-pointer flex-shrink-0"
            style={{ background: "transparent", color: "var(--text-dim)" }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2L10 10M10 2L2 10" />
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight m-0">
            Training Plan
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              Week {plan.week_number}
            </span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: "var(--amber-soft)", color: "var(--amber)" }}
            >
              {plan.phase.replace("_", " ")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={async () => {
              if (!confirm("Reset this week's plan? Activities will be preserved.")) return;
              setResetting(true);
              await fetch("/api/coach/reset-plan", { method: "POST" });
              setPlan(null);
              setWorkouts([]);
              setResetting(false);
            }}
            disabled={resetting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer disabled:opacity-50 transition-colors"
            style={{ borderColor: "var(--border-light)", color: "var(--text-dim)", background: "transparent" }}
          >
            {resetting ? "Resetting..." : "Reset Week"}
          </button>
          <div
            className="text-right"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <div className="text-xs uppercase" style={{ color: "var(--text-dim)" }}>
              Target
            </div>
            <div className="text-xl font-semibold" style={{ color: "var(--amber)" }}>
              {plan.target_mileage} mi
            </div>
          </div>
        </div>
      </div>

      {/* 7-day calendar */}
      <div
        className="flex md:grid gap-3 mb-6 overflow-x-auto pb-2 md:pb-0 snap-x snap-mandatory"
        style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
      >
        {weekDays.map((day, i) => {
          const isToday = day.date === today;
          const isSelected = selectedIdx === i;
          const sessions = day.sessions;
          const hasRun = sessions.find((s) => !["strength", "mobility", "yoga", "drills", "off"].includes(s.workout_type));
          const totalDistance = sessions.reduce((s, w) => s + (w.target_distance ?? 0), 0);
          const allDone = sessions.length > 0 && sessions.every((s) => s.completed);

          return (
            <button
              key={day.date}
              onClick={() => setSelectedIdx(isSelected ? null : i)}
              className="rounded-xl p-4 border text-left transition-all cursor-pointer relative flex-shrink-0 snap-start min-w-[100px] md:min-w-0"
              style={{
                background: isSelected ? "var(--bg-elevated)" : "var(--bg-card)",
                borderColor: isToday ? "var(--amber)" : isSelected ? "var(--border-light)" : "var(--border)",
                boxShadow: isToday ? "0 0 0 1px var(--amber), 0 0 12px rgba(245,158,11,0.15)" : "none",
              }}
            >
              <div
                className="text-xs font-medium uppercase mb-2"
                style={{ color: isToday ? "var(--amber)" : "var(--text-dim)" }}
              >
                {DAY_ABBR[i]}
              </div>

              {/* Session type badges */}
              <div className="flex flex-wrap gap-1 mb-2">
                {sessions.length > 0 ? (
                  sessions.map((s, j) => {
                    const c = workoutColor(s.workout_type);
                    return (
                      <span
                        key={j}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase"
                        style={{ background: `${c}22`, color: c }}
                      >
                        {s.workout_type.replace("_", " ")}
                      </span>
                    );
                  })
                ) : (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-dim)" }}
                  >
                    off
                  </span>
                )}
              </div>

              {/* Distance (runs only) */}
              <div
                className="text-lg font-semibold"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: totalDistance > 0 ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {totalDistance > 0 ? totalDistance : "—"}
                <span className="text-xs font-normal ml-0.5" style={{ color: "var(--text-dim)" }}>
                  {totalDistance > 0 ? "mi" : ""}
                </span>
              </div>

              {/* Status */}
              {allDone && sessions.length > 0 && (
                <div className="absolute top-3 right-3">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="6" fill="var(--green)" opacity="0.2" />
                    <path d="M4.5 7L6 8.5L9.5 5" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Expanded detail panel — show all sessions for selected day */}
      {selected && selected.sessions.length > 0 && (
        <div className="space-y-4">
          {selected.sessions.map((session) => (
            <DetailPanel
              key={session.id}
              workout={session}
              date={selected.date}
              onClose={() => setSelectedIdx(null)}
              onModificationSaved={handleModificationSaved}
            />
          ))}
        </div>
      )}

      {/* Coach notes */}
      {plan.coach_notes && (
        <div
          className="rounded-xl p-6 border mt-6"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div
            className="text-xs font-medium uppercase tracking-wider mb-3"
            style={{ color: "var(--text-dim)" }}
          >
            Coach&apos;s Rationale
          </div>
          <p
            className="text-sm leading-relaxed m-0 italic"
            style={{ color: "var(--text-muted)" }}
          >
            &ldquo;{plan.coach_notes}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Detail Panel ----

function DetailPanel({
  workout,
  date,
  onClose,
  onModificationSaved,
}: {
  workout: PlannedWorkoutRow;
  date: string;
  onClose: () => void;
  onModificationSaved: (coachResponse: string) => void;
}) {
  const [modifying, setModifying] = useState(false);
  const [modType, setModType] = useState<WorkoutType>(workout.workout_type);
  const [modDistance, setModDistance] = useState(String(workout.target_distance ?? 0));
  const [modReason, setModReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const color = workoutColor(workout.workout_type);
  const d = new Date(date + "T00:00:00");
  const fullDate = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const handleSubmitModification = async () => {
    if (!modReason.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/coach/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workout_id: workout.id,
          new_workout_type: modType !== workout.workout_type ? modType : undefined,
          new_distance: parseFloat(modDistance) !== (workout.target_distance ?? 0) ? parseFloat(modDistance) : undefined,
          reason: modReason,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let message = data.coach_response;
        if (data.suggested_adjustments?.length > 0) {
          const adjustments = data.suggested_adjustments
            .map((a: { workout_date: string; suggestion: string }) => `${a.workout_date}: ${a.suggestion}`)
            .join(". ");
          message += ` Suggested adjustments: ${adjustments}`;
        }
        onModificationSaved(message);
        setModifying(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rounded-xl p-6 border relative"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1.5 rounded-lg border-0 cursor-pointer transition-colors"
        style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2 L12 12 M12 2 L2 12" />
        </svg>
      </button>

      {/* Date + badge */}
      <div className="mb-4">
        <div className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
          {fullDate}
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold uppercase"
            style={{ background: `${color}22`, color }}
          >
            {workout.workout_type.replace("_", " ")}
          </span>
          {!workout.completed && !modifying && (
            <button
              onClick={() => setModifying(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer transition-colors"
              style={{
                borderColor: "var(--border-light)",
                color: "var(--text-muted)",
                background: "transparent",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" />
              </svg>
              Modify
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      {workout.description && !modifying && (
        <p className="text-sm leading-relaxed mb-5 m-0" style={{ color: "var(--text)" }}>
          {workout.description}
        </p>
      )}

      {/* Modification form */}
      {modifying ? (
        <div
          className="rounded-lg p-4 mb-5 border"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
        >
          <div
            className="text-xs font-semibold uppercase mb-4"
            style={{ color: "var(--orange)" }}
          >
            Modify Workout
          </div>
          <div className="space-y-4">
            {/* Type */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                Workout Type
              </label>
              <select
                value={modType}
                onChange={(e) => setModType(e.target.value as WorkoutType)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236b7084' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  paddingRight: "36px",
                }}
              >
                {MODIFIABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            {/* Distance */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                Distance (miles)
              </label>
              <input
                type="number"
                value={modDistance}
                onChange={(e) => setModDistance(e.target.value)}
                min="0"
                step="0.5"
                className="w-32 rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                Reason <span style={{ color: "var(--amber)" }}>*</span>
              </label>
              <textarea
                value={modReason}
                onChange={(e) => setModReason(e.target.value)}
                rows={2}
                placeholder="How I'm feeling, schedule conflict, etc."
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleSubmitModification}
                disabled={!modReason.trim() || submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold border-0 cursor-pointer disabled:opacity-50 transition-colors"
                style={{ background: "var(--amber)", color: "#0f1117" }}
              >
                {submitting ? "Saving..." : "Save Modification"}
              </button>
              <button
                onClick={() => {
                  setModifying(false);
                  setModType(workout.workout_type);
                  setModDistance(String(workout.target_distance ?? 0));
                  setModReason("");
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer"
                style={{
                  borderColor: "var(--border-light)",
                  color: "var(--text-muted)",
                  background: "transparent",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats grid */}
          <div
            className="grid gap-4 mb-5"
            style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
          >
            {workout.target_distance != null && (
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: "var(--text-dim)" }}>
                  Distance
                </div>
                <div
                  className="text-lg font-semibold"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
                >
                  {workout.target_distance} mi
                </div>
              </div>
            )}
            {workout.target_pace_range && (
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: "var(--text-dim)" }}>
                  Pace Range
                </div>
                <div
                  className="text-lg font-semibold"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}
                >
                  {workout.target_pace_range}
                </div>
              </div>
            )}
            {workout.target_hr_zone && (
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: "var(--text-dim)" }}>
                  HR Zone
                </div>
                <div
                  className="text-lg font-semibold"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}
                >
                  {workout.target_hr_zone}
                </div>
              </div>
            )}
          </div>

          {/* Warmup / Cooldown */}
          {(workout.warmup || workout.cooldown) && (
            <div
              className="grid gap-4 pt-4 border-t"
              style={{ gridTemplateColumns: "1fr 1fr", borderColor: "var(--border)" }}
            >
              {workout.warmup && (
                <div>
                  <div className="text-xs uppercase mb-1" style={{ color: "var(--text-dim)" }}>Warmup</div>
                  <div className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{workout.warmup}</div>
                </div>
              )}
              {workout.cooldown && (
                <div>
                  <div className="text-xs uppercase mb-1" style={{ color: "var(--text-dim)" }}>Cooldown</div>
                  <div className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{workout.cooldown}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Athlete modification note */}
      {workout.athlete_modification && !modifying && (
        <div
          className="mt-4 pt-4 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="text-xs uppercase mb-1" style={{ color: "var(--orange)" }}>
            Modified
          </div>
          <div className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {workout.athlete_modification}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Helpers ----

interface WeekDay {
  date: string;
  sessions: PlannedWorkoutRow[];
}

function buildWeekDays(
  weekStart: string,
  workouts: PlannedWorkoutRow[]
): WeekDay[] {
  const start = new Date(weekStart + "T00:00:00");
  const byDate = new Map<string, PlannedWorkoutRow[]>();
  for (const w of workouts) {
    const existing = byDate.get(w.workout_date) ?? [];
    existing.push(w);
    byDate.set(w.workout_date, existing);
  }

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;
    return {
      date: dateStr,
      sessions: byDate.get(dateStr) ?? [],
    };
  });
}
