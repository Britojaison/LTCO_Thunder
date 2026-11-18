import type { Financials } from "@/lib/services/campaigns";
import { inr } from "@/lib/format";

/** Internal money summary. Never used in client reports. */
export function MoneyCards({ fin }: { fin: Financials }) {
  const noPayouts = fin.influencer_count > 0 && fin.missing_payout === fin.influencer_count;
  const tone = noPayouts ? "text-amber-700" : fin.profit < 0 ? "text-red-700" : "text-emerald-700";
  const items = [
    { label: "Cost to client", value: inr(fin.cost_to_client) },
    { label: "Cost to agency", value: noPayouts ? "Not entered" : inr(fin.cost_to_agency), cls: noPayouts ? "text-amber-700 text-lg" : "" },
    { label: fin.missing_payout && !noPayouts ? "Profit (partial)" : "Profit", value: noPayouts ? "Payouts missing" : inr(fin.profit), cls: `${tone} ${noPayouts ? "text-lg" : ""}` },
    { label: fin.missing_payout && !noPayouts ? "Profit % (partial)" : "Profit %", value: noPayouts ? "–" : fin.profit_pct === null ? "–" : `${fin.profit_pct}%`, cls: tone },
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <dt className="text-xs text-zinc-500">{i.label}</dt>
            <dd className={`mt-1 text-2xl font-semibold tabular-nums ${i.cls ?? ""}`}>{i.value}</dd>
          </div>
        ))}
      </dl>
      {(fin.missing_client_price > 0 || fin.missing_payout > 0) && (
        <p className="mt-2 text-xs text-amber-700">
          Incomplete:{" "}
          {[
            fin.missing_client_price ? `${fin.missing_client_price} influencer${fin.missing_client_price > 1 ? "s" : ""} without a client price` : "",
            fin.missing_payout ? `${fin.missing_payout} without a payout` : "",
          ].filter(Boolean).join(", ")}. Totals count those as ₹0.
        </p>
      )}
    </div>
  );
}

export function profitText(fin: Financials) {
  return fin.profit_pct === null ? "–" : `${fin.profit_pct}%`;
}
