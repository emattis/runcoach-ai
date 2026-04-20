"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/db";
import { formatPace, formatDuration, getWeekStart, workoutColor } from "@/lib/utils";
import type { WorkoutType } from "@/types";

// ---- Types ----

interface ActivityRow {
  id: string;
  activity_date: string;
  activity_type: string;
  distance_miles: number | null;
  duration_seconds: number | null;
  avg_pace_per_mile: number | null;
  avg_hr: number | null;
  perceived_effort: number | null;
  coach_analysis: string | null;
}

interface FeedbackRow {
  activity_id: string;
  feel_rating: number;
  energy_level: string;
  notes: string | null;
  soreness_level: number;
  soreness_areas: string[] | null;
}

interface PlannedRow {
  workout_date: string;
  workout_type: WorkoutType;
  description: string | null;
  target_distance: number | null;
  target_pace_range: string | null;
}

interface StrengthRow {
  id: string;
  workout_date: string;
  workout_name: string;
  exercises: { name: string }[];
  completed: boolean;
}

interface DayEntry {
  date: string;
  activities: ActivityRow[];
  feedback: Map<string, FeedbackRow>;
  planned: PlannedRow[];
  strength: StrengthRow[];
}

interface WeekGroup {
  weekStart: string;
  weekEnd: string;
  label: string;
  totalMileage: number;
  days: DayEntry[];
}

type FilterType = "all" | "runs" | "strength" | "mobility";

// ---- Helpers ----

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function dateToLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateRange(start: string, end: string): string {
  const s = dateToLocal(start);
  const e = dateToLocal(end);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  if (s.getMonth() === e.getMonth()) {
    return `${months[s.getMonth()]} ${s.getDate()}\u2013${e.getDate()}`;
  }
  return `${months[s.getMonth()]} ${s.getDate()} \u2013 ${months[e.getMonth()]} ${e.getDate()}`;
}

function isCurrentWeek(weekStart: string): boolean {
  const now = new Date();
  const current = getWeekStart(now);
  return weekStart === current;
}

function getSunday(mondayStr: string): string {
  const d = dateToLocal(mondayStr);
  d.setDate(d.getDate() + 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function workoutBadgeColor(type: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    easy: { bg: "var(--green-soft)", text: "var(--green)" },
    long_run: { bg: "var(--blue-soft)", text: "var(--blue)" },
    tempo: { bg: "var(--orange-soft)", text: "var(--orange)" },
    intervals: { bg: "var(--red-soft)", text: "var(--red)" },
    recovery: { bg: "var(--lime-soft)", text: "var(--lime)" },
    strides: { bg: "var(--yellow-soft)", text: "var(--yellow)" },
    strength: { bg: "var(--amber-soft)", text: "var(--amber)" },
    mobility: { bg: "var(--teal-soft)", text: "var(--teal)" },
    yoga: { bg: "var(--teal-soft)", text: "var(--teal)" },
    drills: { bg: "var(--orange-soft)", text: "var(--orange)" },
    cross_train: { bg: "var(--purple-soft)", text: "var(--purple)" },
    off: { bg: "var(--bg-elevated)", text: "var(--text-dim)" },
  };
  return map[type] ?? map.off;
}

function feelColor(rating: number): string {
  if (rating >= 7) return "var(--green)";
  if (rating >= 5) return "var(--amber)";
  return "var(--red)";
}

function workoutLabel(type: string): string {
  const labels: Record<string, string> = {
    easy: "Easy",
    long_run: "Long Run",
    tempo: "Tempo",
    intervals: "Intervals",
    recovery: "Recovery",
    strides: "Strides",
    strength: "Strength",
    mobility: "Mobility",
    yoga: "Yoga",
    drills: "Drills",
    cross_train: "Cross Train",
    off: "Rest",
  };
  return labels[type] ?? type;
}

// ---- Component ----

export default function ActivityLogPage() {
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const db = getSupabase();
    const now = new Date();
    const thirtyAgo = new Date(now);
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const startDate = thirtyAgo.toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    const [activitiesRes, feedbackRes, plannedRes, strengthRes] =
      await Promise.all([
        db
          .from("activities")
          .select(
            "id, activity_date, activity_type, distance_miles, duration_seconds, avg_pace_per_mile, avg_hr, perceived_effort, coach_analysis"
          )
          .gte("activity_date", startDate)
          .lte("activity_date", endDate)
          .order("activity_date", { ascending: false }),
        db
          .from("run_feedback")
          .select(
            "activity_id, feel_rating, energy_level, notes, soreness_level, soreness_areas"
          ),
        db
          .from("planned_workouts")
          .select(
            "workout_date, workout_type, description, target_distance, target_pace_range"
          )
          .gte("workout_date", startDate)
          .lte("workout_date", endDate),
        db
          .from("strength_workouts")
          .select("id, workout_date, workout_name, exercises, completed")
          .gte("workout_date", startDate)
          .lte("workout_date", endDate),
      ]);

    const activities = (activitiesRes.data ?? []) as ActivityRow[];
    const feedbacks = (feedbackRes.data ?? []) as FeedbackRow[];
    const planned = (plannedRes.data ?? []) as PlannedRow[];
    const strength = (strengthRes.data ?? []) as StrengthRow[];

    // Index feedback by activity_id
    const feedbackMap = new Map<string, FeedbackRow>();
    for (const f of feedbacks) {
      feedbackMap.set(f.activity_id, f);
    }

    // Collect all dates in range
    const allDates: string[] = [];
    const cursor = new Date(thirtyAgo);
    while (cursor <= now) {
      allDates.push(cursor.toISOString().split("T")[0]);
      cursor.setDate(cursor.getDate() + 1);
    }

    // Group data by date
    const dayMap = new Map<string, DayEntry>();
    for (const d of allDates) {
      dayMap.set(d, {
        date: d,
        activities: [],
        feedback: new Map(),
        planned: [],
        strength: [],
      });
    }

    for (const a of activities) {
      const entry = dayMap.get(a.activity_date);
      if (entry) {
        entry.activities.push(a);
        const fb = feedbackMap.get(a.id);
        if (fb) entry.feedback.set(a.id, fb);
      }
    }
    for (const p of planned) {
      const entry = dayMap.get(p.workout_date);
      if (entry) entry.planned.push(p);
    }
    for (const s of strength) {
      const entry = dayMap.get(s.workout_date);
      if (entry) entry.strength.push(s);
    }

    // Group by week (Mon-Sun)
    const weekMap = new Map<string, DayEntry[]>();
    for (const [dateStr, entry] of dayMap) {
      const ws = getWeekStart(dateToLocal(dateStr));
      if (!weekMap.has(ws)) weekMap.set(ws, []);
      weekMap.get(ws)!.push(entry);
    }

    // Build week groups, sorted descending
    const weekGroups: WeekGroup[] = [];
    for (const [ws, days] of weekMap) {
      const we = getSunday(ws);
      const totalMileage = days.reduce((sum, d) => {
        return (
          sum +
          d.activities
            .filter((a) => a.activity_type === "run")
            .reduce((s, a) => s + (a.distance_miles ?? 0), 0)
        );
      }, 0);

      // Sort days descending within each week
      days.sort((a, b) => b.date.localeCompare(a.date));

      weekGroups.push({
        weekStart: ws,
        weekEnd: we,
        label: isCurrentWeek(ws) ? "This week" : formatDateRange(ws, we),
        totalMileage,
        days,
      });
    }

    weekGroups.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    setWeeks(weekGroups);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generateAnalysis = async (activityId: string) => {
    setGeneratingIds((prev) => new Set(prev).add(activityId));
    try {
      const res = await fetch("/api/coach/activity-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_id: activityId }),
      });
      if (res.ok) {
        const { analysis } = await res.json();
        // Update local state
        setWeeks((prev) =>
          prev.map((w) => ({
            ...w,
            days: w.days.map((d) => ({
              ...d,
              activities: d.activities.map((a) =>
                a.id === activityId ? { ...a, coach_analysis: analysis } : a
              ),
            })),
          }))
        );
      }
    } catch (err) {
      console.error("Failed to generate analysis:", err);
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(activityId);
        return next;
      });
    }
  };

  // Filter logic
  function dayMatchesFilter(day: DayEntry): boolean {
    if (filter === "all") return true;
    if (filter === "runs") {
      return (
        day.activities.some((a) => a.activity_type === "run") ||
        day.planned.some((p) =>
          ["easy", "long_run", "tempo", "intervals", "recovery", "strides"].includes(
            p.workout_type
          )
        )
      );
    }
    if (filter === "strength") {
      return (
        day.strength.length > 0 ||
        day.planned.some((p) => p.workout_type === "strength")
      );
    }
    if (filter === "mobility") {
      return (
        day.planned.some((p) =>
          ["mobility", "yoga"].includes(p.workout_type)
        )
      );
    }
    return true;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div
          className="text-sm font-medium"
          style={{ color: "var(--text-dim)" }}
        >
          Loading activity log...
        </div>
      </div>
    );
  }

  const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "runs", label: "Runs" },
    { key: "strength", label: "Strength" },
    { key: "mobility", label: "Mobility" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight m-0">
            Activity Log
          </h1>
          <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Last 30 days of training history
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-1.5">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer"
              style={{
                background:
                  filter === f.key ? "var(--amber-soft)" : "transparent",
                borderColor:
                  filter === f.key ? "var(--amber)" : "var(--border-light)",
                color:
                  filter === f.key ? "var(--amber)" : "var(--text-muted)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Week groups */}
      <div className="space-y-8">
        {weeks.map((week) => {
          const filteredDays = week.days.filter(dayMatchesFilter);
          if (filteredDays.length === 0) return null;

          return (
            <div key={week.weekStart}>
              {/* Week header */}
              <div
                className="flex items-center justify-between mb-3 pb-2 border-b"
                style={{ borderColor: "var(--border-light)" }}
              >
                <div
                  className="text-sm font-semibold"
                  style={{ color: "var(--text)" }}
                >
                  {week.label}
                </div>
                <div
                  className="text-sm font-mono font-medium"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {week.totalMileage.toFixed(1)} mi
                </div>
              </div>

              {/* Days */}
              <div className="space-y-3">
                {filteredDays.map((day) => (
                  <DayCard
                    key={day.date}
                    day={day}
                    filter={filter}
                    generatingIds={generatingIds}
                    onGenerateAnalysis={generateAnalysis}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {weeks.length === 0 && (
        <div
          className="rounded-xl p-10 border text-center"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="text-sm" style={{ color: "var(--text-dim)" }}>
            No activities found in the last 30 days.
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Day Card ----

function DayCard({
  day,
  filter,
  generatingIds,
  onGenerateAnalysis,
}: {
  day: DayEntry;
  filter: FilterType;
  generatingIds: Set<string>;
  onGenerateAnalysis: (id: string) => void;
}) {
  const d = dateToLocal(day.date);
  const dayAbbrev = DAY_NAMES[d.getDay()];
  const dateNum = d.getDate();

  const runs = day.activities.filter((a) => a.activity_type === "run");
  const strengthSessions = day.strength;
  const mobilityPlanned = day.planned.filter((p) =>
    ["mobility", "yoga"].includes(p.workout_type)
  );
  const runPlanned = day.planned.filter((p) =>
    ["easy", "long_run", "tempo", "intervals", "recovery", "strides"].includes(
      p.workout_type
    )
  );
  const strengthPlanned = day.planned.filter(
    (p) => p.workout_type === "strength"
  );

  const hasContent =
    runs.length > 0 ||
    strengthSessions.length > 0 ||
    mobilityPlanned.length > 0 ||
    strengthPlanned.length > 0;

  // Determine the primary feel rating (from first run's feedback)
  const primaryFeedback =
    runs.length > 0 ? day.feedback.get(runs[0].id) : undefined;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex">
        {/* Left column: day + date */}
        <div
          className="flex flex-col items-center justify-start pt-4 px-3 min-w-[56px]"
          style={{ borderRight: "1px solid var(--border-light)" }}
        >
          <div
            className="text-[10px] font-semibold tracking-wider"
            style={{ color: "var(--text-dim)" }}
          >
            {dayAbbrev}
          </div>
          <div
            className="text-lg font-semibold leading-tight"
            style={{ color: "var(--text)" }}
          >
            {dateNum}
          </div>
        </div>

        {/* Middle + right content */}
        <div className="flex-1 min-w-0">
          {!hasContent ? (
            /* Rest day with no sessions */
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SessionBadge type="off" />
                <span
                  className="text-sm"
                  style={{ color: "var(--text-dim)" }}
                >
                  Rest day
                </span>
              </div>
            </div>
          ) : (
            <div>
              {/* Run sessions */}
              {(filter === "all" || filter === "runs") &&
                runs.map((run) => {
                  const fb = day.feedback.get(run.id);
                  const matchingPlanned = runPlanned.find((p) => {
                    if (runs.length === 1) return true;
                    return false;
                  });
                  const wType =
                    matchingPlanned?.workout_type ?? inferRunType(run);

                  return (
                    <div key={run.id}>
                      <div className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <SessionBadge type={wType} />
                            <span
                              className="text-sm font-medium truncate"
                              style={{ color: "var(--text)" }}
                            >
                              {matchingPlanned?.description ??
                                workoutLabel(wType)}
                            </span>
                          </div>
                          <div
                            className="flex items-center gap-3 text-xs"
                            style={{
                              fontFamily: "var(--font-mono)",
                              color: "var(--text-muted)",
                            }}
                          >
                            {run.distance_miles != null && (
                              <span>{run.distance_miles.toFixed(1)} mi</span>
                            )}
                            {run.avg_pace_per_mile != null && (
                              <span>
                                {formatPace(run.avg_pace_per_mile)}/mi
                              </span>
                            )}
                            {run.avg_hr != null && (
                              <span>{run.avg_hr} bpm</span>
                            )}
                            {run.duration_seconds != null && (
                              <span>
                                {formatDuration(run.duration_seconds)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: feel + risk */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {fb && (
                            <span
                              className="text-xs font-semibold"
                              style={{
                                fontFamily: "var(--font-mono)",
                                color: feelColor(fb.feel_rating),
                              }}
                            >
                              {fb.feel_rating}/10
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Coach analysis */}
                      <CoachAnalysisBox
                        activity={run}
                        generating={generatingIds.has(run.id)}
                        onGenerate={() => onGenerateAnalysis(run.id)}
                      />

                      {/* Athlete notes */}
                      {fb?.notes && (
                        <div
                          className="px-4 pb-3 text-xs italic"
                          style={{ color: "var(--text-dim)" }}
                        >
                          {fb.notes}
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Strength sessions (actual) */}
              {(filter === "all" || filter === "strength") &&
                strengthSessions.map((s) => (
                  <div
                    key={s.id}
                    className="px-4 py-3"
                    style={{
                      borderTop:
                        runs.length > 0 || strengthSessions.indexOf(s) > 0
                          ? "1px solid var(--border-light)"
                          : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <SessionBadge type="strength" />
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text)" }}
                      >
                        {s.workout_name}
                      </span>
                      {s.completed && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            background: "var(--green-soft)",
                            color: "var(--green)",
                          }}
                        >
                          Done
                        </span>
                      )}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {Array.isArray(s.exercises)
                        ? `${s.exercises.length} exercises`
                        : ""}
                    </div>
                  </div>
                ))}

              {/* Strength from planned (if no actual strength session) */}
              {(filter === "all" || filter === "strength") &&
                strengthSessions.length === 0 &&
                strengthPlanned.map((p, i) => (
                  <div
                    key={`sp-${i}`}
                    className="px-4 py-3"
                    style={{
                      borderTop:
                        runs.length > 0
                          ? "1px solid var(--border-light)"
                          : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <SessionBadge type="strength" />
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text)" }}
                      >
                        {p.description ?? "Strength"}
                      </span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          background: "var(--bg-elevated)",
                          color: "var(--text-dim)",
                        }}
                      >
                        Planned
                      </span>
                    </div>
                  </div>
                ))}

              {/* Mobility / Yoga */}
              {(filter === "all" || filter === "mobility") &&
                mobilityPlanned.map((p, i) => (
                  <div
                    key={`mob-${i}`}
                    className="px-4 py-3"
                    style={{
                      borderTop: "1px solid var(--border-light)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <SessionBadge type={p.workout_type} />
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text)" }}
                      >
                        {p.description ?? workoutLabel(p.workout_type)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Session Badge ----

function SessionBadge({ type }: { type: string }) {
  const colors = workoutBadgeColor(type);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
      style={{ background: colors.bg, color: colors.text }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: colors.text }}
      />
      {workoutLabel(type)}
    </span>
  );
}

// ---- Coach Analysis Box ----

function CoachAnalysisBox({
  activity,
  generating,
  onGenerate,
}: {
  activity: ActivityRow;
  generating: boolean;
  onGenerate: () => void;
}) {
  if (activity.coach_analysis) {
    return (
      <div
        className="mx-4 mb-3 px-3 py-2.5 rounded-lg text-xs leading-relaxed"
        style={{
          background: "var(--bg-elevated)",
          color: "var(--text-muted)",
        }}
      >
        <span className="font-semibold" style={{ color: "var(--text)" }}>
          Coach:
        </span>{" "}
        {activity.coach_analysis}
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3">
      <button
        onClick={onGenerate}
        disabled={generating}
        className="text-xs font-medium px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors"
        style={{
          borderColor: "var(--border-light)",
          color: generating ? "var(--text-dim)" : "var(--amber)",
          background: "transparent",
        }}
        onMouseEnter={(e) => {
          if (!generating)
            e.currentTarget.style.background = "var(--amber-soft)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {generating ? "Generating..." : "Generate analysis"}
      </button>
    </div>
  );
}

// ---- Inference helper ----

function inferRunType(run: ActivityRow): WorkoutType {
  if (!run.distance_miles) return "easy";
  if (run.distance_miles >= 10) return "long_run";
  if (
    run.avg_pace_per_mile &&
    run.avg_pace_per_mile < 420 &&
    run.distance_miles >= 4
  )
    return "tempo";
  return "easy";
}
