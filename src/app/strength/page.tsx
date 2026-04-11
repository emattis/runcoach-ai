"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Exercise {
  name: string;
  sets: number;
  reps: string;
  weight: number | null;
  rest_seconds: number;
  notes: string | null;
}

interface StrengthWorkout {
  id: string;
  workout_date: string;
  workout_name: string;
  exercises: Exercise[];
  phase: string;
  completed: boolean;
}

export default function StrengthPage() {
  const [workouts, setWorkouts] = useState<StrengthWorkout[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/strength/program");
      const data = await res.json();
      setWorkouts(data.workouts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>
          Loading strength program...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight m-0">
          Strength Training
        </h1>
        <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          {workouts.length} session{workouts.length !== 1 ? "s" : ""} this week
        </div>
      </div>

      {workouts.length === 0 ? (
        <div
          className="rounded-xl p-10 border text-center"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-sm" style={{ color: "var(--text-dim)" }}>
            No strength workouts scheduled for this week.
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {workouts.map((w) => (
            <WorkoutCard key={w.id} workout={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkoutCard({ workout }: { workout: StrengthWorkout }) {
  const d = new Date(workout.workout_date + "T00:00:00");
  const dateLabel = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold m-0" style={{ color: "var(--text)" }}>
              {workout.workout_name}
            </h2>
            {workout.completed && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ background: "var(--green-soft)", color: "var(--green)" }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Done
              </span>
            )}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
            {dateLabel} &middot; {workout.exercises.length} exercises
          </div>
        </div>
        {!workout.completed && (
          <Link
            href={`/strength/log?id=${workout.id}`}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold no-underline transition-colors"
            style={{ background: "var(--amber)", color: "#0f1117" }}
          >
            Start Workout
          </Link>
        )}
      </div>

      {/* Exercise list */}
      <div className="px-6 py-3">
        {workout.exercises.map((ex, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2.5 border-b last:border-0"
            style={{ borderColor: "var(--border)" }}
          >
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
                {ex.name}
              </div>
              {ex.notes && (
                <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>
                  {ex.notes}
                </div>
              )}
            </div>
            <div
              className="text-sm font-medium text-right whitespace-nowrap ml-4"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
            >
              {ex.sets} &times; {ex.reps}
              {ex.weight && (
                <span style={{ color: "var(--amber)" }}> @ {ex.weight} lbs</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
