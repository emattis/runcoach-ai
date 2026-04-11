import { NextResponse } from "next/server";

export async function POST() {
  // TODO: Gather athlete context from DB
  // TODO: Build prompt with coaching logic
  // TODO: Call Claude API for plan generation
  // TODO: Store plan in training_plans table

  return NextResponse.json({ message: "Plan generation not yet implemented" }, { status: 501 });
}
