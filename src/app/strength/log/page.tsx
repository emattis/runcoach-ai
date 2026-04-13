"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/db";
import { WorkoutFeedbackModal } from "@/components/ui/WorkoutFeedbackModal";

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
  workout_name: string;
  exercises: Exercise[];
}

interface LoggedSet {
  exercise_name: string;
  set_number: number;
  reps_completed: number;
  weight_lbs: number | null;
  rpe: number;
}

export default function StrengthLogPage() {
  return (
    <Suspense>
      <StrengthLogContent />
    </Suspense>
  );
}

function StrengthLogContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const workoutId = searchParams.get("id");

  const [workout, setWorkout] = useState<StrengthWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Current set input state
  const [activeExIdx, setActiveExIdx] = useState(0);
  const [activeSetNum, setActiveSetNum] = useState(1);
  const [repsInput, setRepsInput] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [rpeInput, setRpeInput] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!workoutId) {
      setLoading(false);
      return;
    }
    const { data } = await getSupabase()
      .from("strength_workouts")
      .select("id, workout_name, exercises")
      .eq("id", workoutId)
      .single();

    if (data) {
      setWorkout(data as StrengthWorkout);
      // Pre-fill weight from template
      const ex = (data as StrengthWorkout).exercises[0];
      if (ex?.weight) setWeightInput(String(ex.weight));
    }
    setLoading(false);
  }, [workoutId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>
          Loading workout...
        </div>
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="text-sm" style={{ color: "var(--text-dim)" }}>
        Workout not found. <a href="/strength" style={{ color: "var(--amber)" }}>Back to Strength</a>
      </div>
    );
  }

  const currentEx = workout.exercises[activeExIdx];
  const setsForCurrentEx = loggedSets.filter(
    (s) => s.exercise_name === currentEx?.name
  );
  const totalSetsLogged = loggedSets.length;
  const totalSetsTarget = workout.exercises.reduce((s, e) => s + e.sets, 0);
  const allDone = totalSetsLogged >= totalSetsTarget;

  const handleLogSet = async () => {
    if (!currentEx || rpeInput === null) return;
    setSaving(true);

    const setData = {
      strength_workout_id: workout.id,
      exercise_name: currentEx.name,
      set_number: activeSetNum,
      reps_completed: parseInt(repsInput) || 0,
      weight_lbs: weightInput ? parseFloat(weightInput) : null,
      rpe: rpeInput,
    };

    const res = await fetch("/api/strength/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setData),
    });

    if (res.ok) {
      setLoggedSets((prev) => [...prev, setData]);

      // Advance to next set or next exercise
      if (activeSetNum < currentEx.sets) {
        setActiveSetNum(activeSetNum + 1);
      } else if (activeExIdx < workout.exercises.length - 1) {
        const nextIdx = activeExIdx + 1;
        setActiveExIdx(nextIdx);
        setActiveSetNum(1);
        const nextEx = workout.exercises[nextIdx];
        setWeightInput(nextEx.weight ? String(nextEx.weight) : "");
      }

      setRepsInput("");
      setRpeInput(null);
    }

    setSaving(false);
  };

  const handleFinish = () => {
    setShowFeedback(true);
  };

  const completeAndNavigate = async () => {
    setFinishing(true);
    await fetch("/api/strength/log", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workout_id: workout.id }),
    });
    router.push("/strength");
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight m-0">
            {workout.workout_name}
          </h1>
          <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {totalSetsLogged}/{totalSetsTarget}
            </span>{" "}
            sets completed
          </div>
        </div>
        <a
          href="/strength"
          className="text-sm no-underline"
          style={{ color: "var(--text-dim)" }}
        >
          Cancel
        </a>
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-2 rounded-full overflow-hidden mb-8"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${totalSetsTarget > 0 ? (totalSetsLogged / totalSetsTarget) * 100 : 0}%`,
            background: "var(--amber)",
          }}
        />
      </div>

      {/* Exercise list / navigator */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {workout.exercises.map((ex, i) => {
          const exSets = loggedSets.filter((s) => s.exercise_name === ex.name);
          const done = exSets.length >= ex.sets;
          const active = i === activeExIdx;

          return (
            <button
              key={i}
              onClick={() => {
                setActiveExIdx(i);
                const logged = loggedSets.filter((s) => s.exercise_name === ex.name).length;
                setActiveSetNum(Math.min(logged + 1, ex.sets));
                setWeightInput(ex.weight ? String(ex.weight) : "");
                setRepsInput("");
                setRpeInput(null);
              }}
              className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium border-0 cursor-pointer transition-colors"
              style={{
                background: active
                  ? "var(--amber)"
                  : done
                    ? "var(--green-soft)"
                    : "var(--bg-elevated)",
                color: active
                  ? "#0f1117"
                  : done
                    ? "var(--green)"
                    : "var(--text-muted)",
              }}
            >
              {ex.name.length > 18 ? ex.name.slice(0, 16) + "..." : ex.name}
            </button>
          );
        })}
      </div>

      {/* Current exercise card */}
      {currentEx && !allDone && (
        <div
          className="rounded-xl border p-6 mb-6"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold m-0" style={{ color: "var(--text)" }}>
              {currentEx.name}
            </h2>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{
                background: "var(--amber-soft)",
                color: "var(--amber)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Set {activeSetNum}/{currentEx.sets}
            </span>
          </div>
          <div className="text-sm mb-4" style={{ color: "var(--text-dim)" }}>
            Target: {currentEx.sets} &times; {currentEx.reps}
            {currentEx.weight && ` @ ${currentEx.weight} lbs`}
            {currentEx.notes && ` — ${currentEx.notes}`}
          </div>

          {/* Inputs */}
          <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                Reps Completed
              </label>
              <input
                type="number"
                value={repsInput}
                onChange={(e) => setRepsInput(e.target.value)}
                placeholder={currentEx.reps.replace(/\/.*/, "")}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                style={{
                  background: "var(--bg-elevated)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                Weight (lbs)
              </label>
              <input
                type="number"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                placeholder="BW"
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
                style={{
                  background: "var(--bg-elevated)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>
          </div>

          {/* RPE */}
          <div className="mb-5">
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
              RPE <span style={{ color: "var(--amber)" }}>*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setRpeInput(n)}
                  className="w-10 h-10 md:w-8 md:h-8 rounded-lg text-sm md:text-xs font-semibold border-0 cursor-pointer transition-colors"
                  style={{
                    background:
                      rpeInput === n
                        ? n >= 9
                          ? "var(--red)"
                          : n >= 7
                            ? "var(--orange)"
                            : "var(--amber)"
                        : "var(--bg-elevated)",
                    color: rpeInput === n ? "#0f1117" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Log button */}
          <button
            onClick={handleLogSet}
            disabled={!repsInput || rpeInput === null || saving}
            className="w-full px-4 py-4 md:py-3 rounded-lg text-base md:text-sm font-semibold border-0 cursor-pointer disabled:opacity-50 transition-colors"
            style={{ background: "var(--amber)", color: "#0f1117" }}
          >
            {saving ? "Saving..." : `Complete Set ${activeSetNum}`}
          </button>
        </div>
      )}

      {/* Completed sets summary */}
      {loggedSets.length > 0 && (
        <div
          className="rounded-xl border p-6 mb-6"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div
            className="text-xs font-medium uppercase tracking-wider mb-3"
            style={{ color: "var(--text-dim)" }}
          >
            Completed Sets
          </div>
          <div className="space-y-1.5">
            {loggedSets.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm py-1"
              >
                <span style={{ color: "var(--text-muted)" }}>
                  {s.exercise_name} — Set {s.set_number}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                  {s.reps_completed} reps
                  {s.weight_lbs ? ` @ ${s.weight_lbs} lbs` : ""}
                  <span
                    className="ml-2 text-xs"
                    style={{
                      color:
                        s.rpe >= 9
                          ? "var(--red)"
                          : s.rpe >= 7
                            ? "var(--orange)"
                            : "var(--text-dim)",
                    }}
                  >
                    RPE {s.rpe}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Finish button */}
      {allDone && (
        <button
          onClick={handleFinish}
          disabled={finishing}
          className="w-full px-4 py-3 rounded-lg text-sm font-semibold border-0 cursor-pointer disabled:opacity-50 transition-colors"
          style={{ background: "var(--green)", color: "#fff" }}
        >
          {finishing ? "Finishing..." : "Finish Workout"}
        </button>
      )}

      {/* Feedback modal after finishing */}
      {showFeedback && workout && (
        <WorkoutFeedbackModal
          type="strength"
          workoutId={workout.id}
          workoutLabel={workout.workout_name}
          onClose={() => {
            setShowFeedback(false);
            completeAndNavigate();
          }}
          onSaved={() => {
            setShowFeedback(false);
            completeAndNavigate();
          }}
          onSkip={() => {
            setShowFeedback(false);
            completeAndNavigate();
          }}
        />
      )}
    </div>
  );
}
