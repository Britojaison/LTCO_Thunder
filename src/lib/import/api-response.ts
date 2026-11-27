import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/services/errors";
import { ImportParseError } from "@/lib/import/parser";
import { GoogleSheetError } from "@/lib/import/google-sheets";

export function apiErrorResponse(err: unknown) {
  if (err instanceof ServiceError) {
    const status = err.code === "validation" ? 400 : err.code === "forbidden" ? 403 : err.code === "not_found" ? 404 : 500;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  if (err instanceof ImportParseError) {
    return NextResponse.json({ error: err.message, code: "parse_error" }, { status: 400 });
  }
  if (err instanceof GoogleSheetError) {
    const status = err.code === "private_or_auth_required" ? 403 : err.code === "invalid_url" ? 400 : 502;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  return NextResponse.json({ error: "Unexpected error processing import request." }, { status: 500 });
}
