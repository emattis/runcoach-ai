"use client";

import { useState } from "react";

// ---- Types ----

export type FeedbackType = "run" | "strength";

export interface WorkoutFeedbackProps {
  type: FeedbackType;
  workoutId: string;
  workoutLabel: string; // e.g. "5 mi Easy Run" or "Lower Body A"
  onClose: () => void;
  onSaved: () => void;
  onSkip?: () => void; // optional skip feedback
}

type EnergyLevel = "depleted" | "tired" | "moderate" | "strong" | "great";

const ENERGY_LEVELS: EnergyLevel[] = ["depleted", "tired", "moderate", "strong", "great"];

const SORENESS_AREAS = [
  "left calf", "right calf", "left knee", "right knee",
  "left hip", "right hip", "left hamstring", "right hamstring",
  "shins", "lower back", "foot/ankle", "IT band",
];

// ---- Component ----

export function WorkoutFeedbackModal({
  type,
  workoutId,
  workoutLabel,
  onClose,
  onSaved,
  onSkip,
}: WorkoutFeedbackProps) {
  const [feelRating, setFeelRating] = useState<number | null>(null);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | null>(null);
  const [hasSoreness, setHasSoreness] = useState(false);
  const [sorenessAreas, setSorenessAreas] = useState<string[]>([]);
  const [sorenessLevel, setSorenessLevel] = useState(0);
  const [sleepHours, setSleepHours] = useState("7.5");
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [injuryFlag, setInjuryFlag] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isRun = type === "run";
  const canSubmit = feelRating !== null && energyLevel !== null;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      if (isRun) {
        await fetch("/api/coach/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activity_id: workoutId,
            feel_rating: feelRating,
            energy_level: energyLevel,
            soreness_areas: hasSoreness ? sorenessAreas : [],
            soreness_level: hasSoreness ? sorenessLevel : 0,
            sleep_quality: sleepQuality ?? 7,
            sleep_hours: parseFloat(sleepHours) || 7,
            notes: notes || null,
            injury_flag: injuryFlag,
          }),
        });
      } else {
        await fetch("/api/strength/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strength_workout_id: workoutId,
            feel_rating: feelRating,
            energy_level: energyLevel,
            soreness_areas: hasSoreness ? sorenessAreas : [],
            soreness_level: hasSoreness ? sorenessLevel : 0,
            notes: notes || null,
            injury_flag: injuryFlag,
          }),
        });
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleArea = (area: string) =>
    setSorenessAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-t-xl md:rounded-xl border w-full md:max-w-lg max-h-[95vh] md:max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              How did it go?
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>
              {workoutLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border-0 cursor-pointer"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2L12 12M12 2L2 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Feel Rating */}
          <div>
            <div className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
              How did that feel? <span style={{ color: "var(--amber)" }}>*</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setFeelRating(n)}
                  className="w-10 h-10 md:w-8 md:h-8 rounded-lg text-sm md:text-xs font-semibold border-0 cursor-pointer transition-colors"
                  style={{
                    background: feelRating === n ? "var(--amber)" : "var(--bg-elevated)",
                    color: feelRating === n ? "#0f1117" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Energy Level */}
          <div>
            <div className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
              Energy level after <span style={{ color: "var(--amber)" }}>*</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ENERGY_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => setEnergyLevel(level)}
                  className="px-3 py-2 md:py-1.5 rounded-lg text-xs font-medium border-0 cursor-pointer capitalize transition-colors"
                  style={{
                    background: energyLevel === level ? "var(--teal)" : "var(--bg-elevated)",
                    color: energyLevel === level ? "#0f1117" : "var(--text-muted)",
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Soreness toggle */}
          <div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
                Any pain or soreness?
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setHasSoreness(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border-0 cursor-pointer"
                  style={{
                    background: !hasSoreness ? "var(--green-soft)" : "var(--bg-elevated)",
                    color: !hasSoreness ? "var(--green)" : "var(--text-dim)",
                  }}
                >
                  No
                </button>
                <button
                  onClick={() => setHasSoreness(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border-0 cursor-pointer"
                  style={{
                    background: hasSoreness ? "var(--orange-soft)" : "var(--bg-elevated)",
                    color: hasSoreness ? "var(--orange)" : "var(--text-dim)",
                  }}
                >
                  Yes
                </button>
              </div>
            </div>

            {hasSoreness && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {SORENESS_AREAS.map((area) => (
                    <button
                      key={area}
                      onClick={() => toggleArea(area)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer capitalize transition-colors"
                      style={{
                        background: sorenessAreas.includes(area) ? "var(--orange-soft)" : "transparent",
                        borderColor: sorenessAreas.includes(area) ? "var(--orange)" : "var(--border)",
                        color: sorenessAreas.includes(area) ? "var(--orange)" : "var(--text-muted)",
                      }}
                    >
                      {area}
                    </button>
                  ))}
                </div>
                <div>
                  <div className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                    Soreness level
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                      <button
                        key={n}
                        onClick={() => setSorenessLevel(n)}
                        className="w-8 h-8 rounded-lg text-xs font-semibold border-0 cursor-pointer transition-colors"
                        style={{
                          background: sorenessLevel === n
                            ? n >= 7 ? "var(--red)" : n >= 4 ? "var(--orange)" : "var(--green)"
                            : "var(--bg-elevated)",
                          color: sorenessLevel === n ? "#0f1117" : "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sleep (runs only) */}
          {isRun && (
            <div>
              <div className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
                Sleep last night
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>Hours</div>
                  <input
                    type="number"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(e.target.value)}
                    min="0" max="24" step="0.5"
                    className="w-20 rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--amber)]"
                    style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)" }}
                  />
                </div>
                <div className="flex-1">
                  <div className="text-xs mb-1" style={{ color: "var(--text-dim)" }}>Quality</div>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        onClick={() => setSleepQuality(n)}
                        className="w-7 h-7 rounded text-[10px] font-semibold border-0 cursor-pointer transition-colors"
                        style={{
                          background: sleepQuality === n ? "var(--blue)" : "var(--bg-elevated)",
                          color: sleepQuality === n ? "#fff" : "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Free text notes */}
          <div>
            <div className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
              Anything else the coach should know?
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={isRun
                ? "e.g. felt sluggish first 2 miles then loosened up, right knee tight on hills..."
                : "e.g. hip thrusts felt easy, could increase weight next time..."
              }
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {/* Injury flag */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium" style={{ color: injuryFlag ? "var(--red)" : "var(--text)" }}>
                Injury concern?
              </div>
              <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                Flag if something feels wrong
              </div>
            </div>
            <button
              onClick={() => setInjuryFlag(!injuryFlag)}
              className="w-11 h-6 rounded-full border-0 cursor-pointer transition-colors relative"
              style={{ background: injuryFlag ? "var(--red)" : "var(--bg-elevated)" }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                style={{ left: injuryFlag ? "22px" : "2px", background: injuryFlag ? "#fff" : "var(--text-dim)" }}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t flex items-center justify-between"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            {onSkip && (
              <button
                onClick={onSkip}
                className="text-xs border-0 cursor-pointer p-0"
                style={{ background: "transparent", color: "var(--text-dim)" }}
              >
                Skip feedback
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
              style={{ borderColor: "var(--border-light)", color: "var(--text-muted)", background: "transparent" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold border-0 cursor-pointer disabled:opacity-50 transition-colors"
              style={{ background: "var(--amber)", color: "#0f1117" }}
            >
              {submitting ? "Saving..." : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
