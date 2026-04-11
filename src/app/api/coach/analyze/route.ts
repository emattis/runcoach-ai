import { NextResponse } from "next/server";

export async function POST() {
  // TODO: Gather week's data (activities, feedback, plan adherence)
  // TODO: Call Claude API for weekly analysis
  // TODO: Store in weekly_summaries table
  // TODO: Update coach_learnings

  return NextResponse.json({ message: "Weekly analysis not yet implemented" }, { status: 501 });
}
