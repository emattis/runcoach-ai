import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();

  // TODO: Validate strength log data
  // TODO: Store in strength_logs table

  return NextResponse.json({ message: "Strength logging not yet implemented" }, { status: 501 });
}
