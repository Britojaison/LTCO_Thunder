export const compact = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const inr = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "–" : `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(n))}`;

export const pct = (n: number | string | null | undefined) =>
  n === null || n === undefined ? "–" : `${Number(n).toFixed(1)}%`;

export const cap = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

export const dateIN = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "–";

/** "20 Nov, 4:21 pm" in Indian time. */
export const dateTimeIN = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "–";
