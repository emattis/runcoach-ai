import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { generateNotifications } from "@/lib/notifications";

/**
 * GET /api/notifications
 * Returns unread notifications, most recent first.
 */
export async function GET() {
  const db = createServiceClient();

  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: data ?? [] });
}

/**
 * POST /api/notifications
 * Run notification generation and return any new notifications created.
 */
export async function POST() {
  try {
    const newNotifications = await generateNotifications();
    return NextResponse.json({
      created: newNotifications.length,
      notifications: newNotifications,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Notification generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications
 * Mark a notification as read.
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const db = createServiceClient();

  const { error } = await db
    .from("notifications")
    .update({ read: true })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
