import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
      <div
        className="text-6xl font-bold mb-2"
        style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
      >
        404
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Page not found
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-lg text-sm font-semibold no-underline transition-colors"
        style={{ background: "var(--amber)", color: "#0f1117" }}
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
