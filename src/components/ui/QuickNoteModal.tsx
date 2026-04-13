"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "sleep", label: "Sleep" },
  { value: "soreness", label: "Soreness" },
  { value: "energy", label: "Energy" },
  { value: "life_stress", label: "Life Stress" },
  { value: "other", label: "Other" },
];

export function QuickNoteModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState("other");
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/coach/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, note_text: noteText }),
      });
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-t-xl md:rounded-xl border w-full md:max-w-md"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            Quick Note to Coach
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

        <div className="px-6 py-5 space-y-4">
          {/* Category */}
          <div>
            <div className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
              Category
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border-0 cursor-pointer transition-colors"
                  style={{
                    background: category === c.value ? "var(--teal)" : "var(--bg-elevated)",
                    color: category === c.value ? "#0f1117" : "var(--text-muted)",
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note text */}
          <div>
            <div className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
              What should the coach know?
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="e.g. didn't sleep well last night, feeling run down, tweaked my ankle walking..."
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none resize-none focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--amber)]"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text)" }}
              autoFocus
            />
          </div>
        </div>

        <div
          className="px-6 py-4 border-t flex items-center justify-end gap-3"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
            style={{ borderColor: "var(--border-light)", color: "var(--text-muted)", background: "transparent" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!noteText.trim() || submitting}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold border-0 cursor-pointer disabled:opacity-50 transition-colors"
            style={{ background: "var(--amber)", color: "#0f1117" }}
          >
            {submitting ? "Sending..." : "Send Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
