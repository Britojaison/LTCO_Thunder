/**
 * Secure Google Sheets CSV & authorized API helper with SSRF protection.
 *
 * Security rules:
 * - Only allows HTTPS URLs on `docs.google.com` with `/spreadsheets/d/{id}` path.
 * - Rejects arbitrary domains, IP literals, localhost, custom ports, and non-HTTPS schemes.
 * - Uses `redirect: "error"` (or validates redirect target host) to prevent SSRF via open redirects.
 * - Does NOT bypass private spreadsheet permissions: if Google returns 401/403 or HTML login page,
 *   returns a clear setup / publish-to-web message and suggests CSV upload.
 */

const ALLOWED_SHEET_HOSTS = new Set(["docs.google.com"]);
const SPREADSHEET_ID_RX = /^[a-zA-Z0-9_-]{15,100}$/;
const GID_RX = /^\d{1,20}$/;

export interface ParsedGoogleSheetRef {
  spreadsheetId: string;
  gid: string;
  csvExportUrl: string;
}

export class GoogleSheetError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_url" | "private_or_auth_required" | "fetch_failed",
  ) {
    super(message);
    this.name = "GoogleSheetError";
  }
}

export function isGoogleSheetsApiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SHEETS_API_KEY || (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET));
}

export function parseGoogleSheetUrl(rawUrl: string): ParsedGoogleSheetRef {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new GoogleSheetError("Enter a Google Sheets URL.", "invalid_url");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new GoogleSheetError("Invalid Google Sheets URL format.", "invalid_url");
  }

  if (url.protocol !== "https:") {
    throw new GoogleSheetError("Google Sheets URL must use HTTPS.", "invalid_url");
  }
  if (url.port && url.port !== "443") {
    throw new GoogleSheetError("Custom ports are not permitted in Google Sheets URLs.", "invalid_url");
  }
  if (!ALLOWED_SHEET_HOSTS.has(url.hostname.toLowerCase())) {
    throw new GoogleSheetError("URL must be a docs.google.com spreadsheet link.", "invalid_url");
  }

  // Support both /spreadsheets/d/{id}/... and /spreadsheets/d/e/{publishedId}/pub...
  const idMatch = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (!idMatch) {
    throw new GoogleSheetError("Could not find a valid Google Spreadsheet ID in that URL.", "invalid_url");
  }
  const spreadsheetId = idMatch[1];
  if (spreadsheetId === "e") {
    // Published-to-web URL: /spreadsheets/d/e/{pubId}/pub?output=csv
    const pubMatch = url.pathname.match(/^\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)(?:\/|$)/);
    if (!pubMatch || !SPREADSHEET_ID_RX.test(pubMatch[1])) {
      throw new GoogleSheetError("Invalid published Google Sheet URL.", "invalid_url");
    }
    const gidParam = url.searchParams.get("gid");
    const gid = gidParam && GID_RX.test(gidParam) ? gidParam : "0";
    return {
      spreadsheetId: pubMatch[1],
      gid,
      csvExportUrl: `https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pub?gid=${gid}&single=true&output=csv`,
    };
  }

  if (!SPREADSHEET_ID_RX.test(spreadsheetId)) {
    throw new GoogleSheetError("Invalid Google Spreadsheet ID.", "invalid_url");
  }

  const hashGid = url.hash.match(/gid=(\d+)/)?.[1];
  const queryGid = url.searchParams.get("gid");
  const gid = (queryGid && GID_RX.test(queryGid) ? queryGid : hashGid && GID_RX.test(hashGid) ? hashGid : "0");

  return {
    spreadsheetId,
    gid,
    csvExportUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
  };
}

export async function fetchGoogleSheetCsv(rawUrl: string, maxBytes: number): Promise<{ csvText: string; ref: ParsedGoogleSheetRef }> {
  const ref = parseGoogleSheetUrl(rawUrl);

  let res: Response;
  try {
    res = await fetch(ref.csvExportUrl, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "text/csv,text/plain;q=0.9" },
    });
  } catch {
    throw new GoogleSheetError("Could not reach Google Sheets. Check your network or upload a CSV export instead.", "fetch_failed");
  }

  // Handle Google's CDN redirect safely only if it points to a trusted googleusercontent.com / docs.google.com host
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location) {
      throw new GoogleSheetError("Spreadsheet appears to be private. Publish it to the web as CSV or upload a CSV file.", "private_or_auth_required");
    }
    let redir: URL;
    try {
      redir = new URL(location, ref.csvExportUrl);
    } catch {
      throw new GoogleSheetError("Invalid redirect from Google Sheets.", "fetch_failed");
    }
    const host = redir.hostname.toLowerCase();
    const isGoogleHost = host === "docs.google.com" || host.endsWith(".googleusercontent.com");
    if (redir.protocol !== "https:" || !isGoogleHost || host.includes("accounts.google.com")) {
      throw new GoogleSheetError(
        "This Google Sheet is private or requires Google sign-in. Share it as 'Anyone with the link' or 'Publish to web (CSV)', configure Google Sheets API credentials, or download and upload it as a CSV file.",
        "private_or_auth_required",
      );
    }

    res = await fetch(redir.toString(), {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "text/csv,text/plain;q=0.9" },
    });
  }

  if (res.status === 401 || res.status === 403) {
    throw new GoogleSheetError(
      "Access denied by Google Sheets. Thunder never bypasses private spreadsheet permissions—publish the sheet as CSV, adjust link sharing, or upload a CSV file.",
      "private_or_auth_required",
    );
  }
  if (!res.ok) {
    throw new GoogleSheetError(`Google Sheets returned HTTP ${res.status}. Ensure the sheet URL and gid are valid.`, "fetch_failed");
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("text/html")) {
    throw new GoogleSheetError(
      "Google returned a sign-in/HTML page instead of CSV data. Please publish the sheet to the web (File → Share → Publish to web → CSV) or upload a CSV file directly.",
      "private_or_auth_required",
    );
  }

  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new GoogleSheetError("Google Sheet CSV exceeds the maximum allowed import file size.", "fetch_failed");
  }

  const csvText = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  return { csvText, ref };
}
