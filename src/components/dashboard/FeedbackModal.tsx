"use client";

import { useState } from "react";
import { formatPace } from "@/lib/utils";

// ---- Types ----

interface FeedbackActivity {
  id: string;
  activity_date: string;
  distance_miles: number | null;
  avg_pace_per_mile: number | null;
}

interface FeedbackModalProps {
  activity: FeedbackActivity;
  onClose: () => void;
  onSaved: () => void;
}

type EnergyLevel = "depleted" | "tired" | "moderate" | "strong" | "great";

const ENERGY_LEVELS: EnergyLevel[] = [
  "depleted",
  "tired",
  "moderate",
  "strong",
  "great",
];

const SORENESS_AREAS = [
  "left calf",
  "right calf",
  "left knee",
  "right knee",
  "left hip",
  "right hip",
  "left hamstring",
  "right hamstring",
  "left shin",
  "right shin",
  "lower back",
  "foot/ankle",
];

// ---- Component ----

export function FeedbackModal({
  activity,
  onClose,
  onSaved,
}: FeedbackModalProps) {
  const [feelRating, setFeelRating] = useState<number | null>(null);
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | null>(null);
  const [sorenessAreas, setSorenessAreas] = useState<string[]>([]);
  const [sorenessLevel, setSorenessLevel] = useState(0);
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [sleepHours, setSleepHours] = useState("7.5");
  const [notes, setNotes] = useState("");
  const [injuryFlag, setInjuryFlag] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    feelRating !== null && energyLevel !== null && sleepQuality !== null;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/coach/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_id: activity.id,
          feel_rating: feelRating,
          energy_level: energyLevel,
          soreness_areas: sorenessAreas,
          soreness_level: sorenessLevel,
          sleep_quality: sleepQuality,
          sleep_hours: parseFloat(sleepHours) || 0,
          notes: notes || null,
          injury_flag: injuryFlag,
        }),
      });

      if (res.ok) {
        onSaved();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSorenessArea = (area: string) => {
    setSorenessAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const d = new Date(activity.activity_date + "T00:00:00");
  const dateLabel = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-xl border w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-card)",
          }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              Post-Run Feedback
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>
              {dateLabel} &middot;{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {activity.distance_miles?.toFixed(1) ?? "—"} mi
              </span>
              {activity.avg_pace_per_mile && (
                <>
                  {" "}
                  @{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {formatPace(activity.avg_pace_per_mile)}/mi
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border-0 cursor-pointer"
            style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M2 2L12 12M12 2L2 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Feel Rating */}
          <FieldLabel label="How did you feel?" required>
            <div className="flex gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setFeelRating(n)}
                  className="w-8 h-8 rounded-lg text-xs font-semibold border-0 cursor-pointer transition-colors"
                  style={{
                    background:
                      feelRating === n
                        ? "var(--amber)"
                        : "var(--bg-elevated)",
                    color:
                      feelRating === n ? "#0f1117" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </FieldLabel>

          {/* Energy Level */}
          <FieldLabel label="Energy level" required>
            <div className="flex flex-wrap gap-2">
              {ENERGY_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => setEnergyLevel(level)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border-0 cursor-pointer capitalize transition-colors"
                  style={{
                    background:
                      energyLevel === level
                        ? "var(--teal)"
                        : "var(--bg-elevated)",
                    color:
                      energyLevel === level
                        ? "#0f1117"
                        : "var(--text-muted)",
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
          </FieldLabel>

          {/* Soreness Areas */}
          <FieldLabel label="Soreness areas">
            <div className="flex flex-wrap gap-2">
              {SORENESS_AREAS.map((area) => {
                const selected = sorenessAreas.includes(area);
                return (
                  <button
                    key={area}
                    onClick={() => toggleSorenessArea(area)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer capitalize transition-colors"
                    style={{
                      background: selected
                        ? "var(--orange-soft)"
                        : "transparent",
                      borderColor: selected
                        ? "var(--orange)"
                        : "var(--border)",
                      color: selected
                        ? "var(--orange)"
                        : "var(--text-muted)",
                    }}
                  >
                    {area}
                  </button>
                );
              })}
            </div>
          </FieldLabel>

          {/* Soreness Level */}
          <FieldLabel label="Soreness level">
            <div className="flex gap-1.5">
              {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                <button
                  key={n}
                  onClick={() => setSorenessLevel(n)}
                  className="w-8 h-8 rounded-lg text-xs font-semibold border-0 cursor-pointer transition-colors"
                  style={{
                    background:
                      sorenessLevel === n
                        ? n >= 7
                          ? "var(--red)"
                          : n >= 4
                            ? "var(--orange)"
                            : "var(--green)"
                        : "var(--bg-elevated)",
                    color:
                      sorenessLevel === n ? "#0f1117" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </FieldLabel>

          {/* Sleep Quality */}
          <FieldLabel label="Sleep quality" required>
            <div className="flex gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setSleepQuality(n)}
                  className="w-8 h-8 rounded-lg text-xs font-semibold border-0 cursor-pointer transition-colors"
                  style={{
                    background:
                      sleepQuality === n
                        ? "var(--blue)"
                        : "var(--bg-elevated)",
                    color:
                      sleepQuality === n ? "#fff" : "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </FieldLabel>

          {/* Sleep Hours */}
          <FieldLabel label="Sleep hours">
            <input
              type="number"
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              min="0"
              max="24"
              step="0.5"
              className="w-24 rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
              style={{
                background: "var(--bg-elevated)",
                borderColor: "var(--border)",
                color: "var(--text)",
                fontFamily: "var(--font-mono)",
              }}
            />
          </FieldLabel>

          {/* Notes */}
          <FieldLabel label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything notable about this run..."
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors resize-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
              style={{
                background: "var(--bg-elevated)",
                borderColor: "var(--border)",
                color: "var(--text)",
              }}
            />
          </FieldLabel>

          {/* Injury Flag */}
          <div className="flex items-center justify-between">
            <div>
              <div
                className="text-sm font-medium"
                style={{ color: injuryFlag ? "var(--red)" : "var(--text)" }}
              >
                Injury flag
              </div>
              <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                Flag if something feels wrong or injured
              </div>
            </div>
            <button
              onClick={() => setInjuryFlag(!injuryFlag)}
              className="w-11 h-6 rounded-full border-0 cursor-pointer transition-colors relative"
              style={{
                background: injuryFlag ? "var(--red)" : "var(--bg-elevated)",
              }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                style={{
                  left: injuryFlag ? "22px" : "2px",
                  background: injuryFlag ? "#fff" : "var(--text-dim)",
                }}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t flex items-center justify-end gap-3"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer"
            style={{
              borderColor: "var(--border-light)",
              color: "var(--text-muted)",
              background: "transparent",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="px-5 py-2 rounded-lg text-sm font-semibold border-0 cursor-pointer disabled:opacity-50 transition-colors"
            style={{ background: "var(--amber)", color: "#0f1117" }}
          >
            {submitting ? "Saving..." : "Submit Feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Field wrapper ----

function FieldLabel({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>
        {label}
        {required && (
          <span className="ml-1" style={{ color: "var(--amber)" }}>
            *
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
