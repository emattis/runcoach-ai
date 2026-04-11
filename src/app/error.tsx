"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
      <div
        className="text-4xl font-bold mb-2"
        style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}
      >
        Error
      </div>
      <p
        className="text-sm mb-6 max-w-md"
        style={{ color: "var(--text-muted)" }}
      >
        {error.message || "Something went wrong. Please try again."}
      </p>
      <button
        onClick={reset}
        className="px-5 py-2.5 rounded-lg text-sm font-semibold border-0 cursor-pointer transition-colors"
        style={{ background: "var(--amber)", color: "#0f1117" }}
      >
        Try Again
      </button>
    </div>
  );
}
