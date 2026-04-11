import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const envCheck = {
    NEXT_PUBLIC_SUPABASE_URL: {
      exists: !!url,
      length: url?.length ?? 0,
      prefix: url?.slice(0, 20),
    },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: {
      exists: !!anonKey,
      length: anonKey?.length ?? 0,
      prefix: anonKey?.slice(0, 15),
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      exists: !!serviceKey,
      length: serviceKey?.length ?? 0,
      prefix: serviceKey?.slice(0, 10),
    },
  };

  console.log("[debug] Env check:", JSON.stringify(envCheck, null, 2));

  // Test with service role key
  let serviceResult: Record<string, unknown> = { attempted: false };
  if (url && serviceKey) {
    try {
      const db = createClient(url, serviceKey);
      const { data, error, status, statusText } = await db
        .from("athlete_profile")
        .select("id")
        .limit(1);

      serviceResult = {
        attempted: true,
        status,
        statusText,
        error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null,
        rowCount: data?.length ?? 0,
      };
      console.log("[debug] Service client result:", JSON.stringify(serviceResult, null, 2));
    } catch (err) {
      serviceResult = {
        attempted: true,
        exception: err instanceof Error ? err.message : String(err),
      };
      console.error("[debug] Service client exception:", err);
    }
  }

  // Test with anon key
  let anonResult: Record<string, unknown> = { attempted: false };
  if (url && anonKey) {
    try {
      const db = createClient(url, anonKey);
      const { data, error, status, statusText } = await db
        .from("athlete_profile")
        .select("id")
        .limit(1);

      anonResult = {
        attempted: true,
        status,
        statusText,
        error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null,
        rowCount: data?.length ?? 0,
      };
      console.log("[debug] Anon client result:", JSON.stringify(anonResult, null, 2));
    } catch (err) {
      anonResult = {
        attempted: true,
        exception: err instanceof Error ? err.message : String(err),
      };
      console.error("[debug] Anon client exception:", err);
    }
  }

  return NextResponse.json({
    env: envCheck,
    serviceClient: serviceResult,
    anonClient: anonResult,
  });
}
