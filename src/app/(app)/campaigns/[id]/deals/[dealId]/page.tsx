import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getDeal, listContacts, listMembers, listStages, brandProducts } from "@/lib/services/deals";
import { listPosts } from "@/lib/services/posts";
import { signedUrls } from "@/lib/services/storage";
import { ServiceError } from "@/lib/services/errors";
import { Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { compact, dateIN } from "@/lib/format";
import { removeDealAction } from "../../../deal-actions";
import { DealForm } from "./deal-form";
import { PaymentForm } from "./payment-form";
import { FileField } from "./file-field";
import { ContactForm } from "./contact-form";
import { PostsSection } from "./posts-section";

export const metadata = { title: "Deal" };

const CHANNEL: Record<string, string> = { call: "Call", whatsapp: "WhatsApp", email: "Email", instagram_dm: "Instagram DM", other: "Other" };

export default function DealPage({ params }: PageProps<"/campaigns/[id]/deals/[dealId]">) {
  return <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}><Deal params={params} /></Suspense>;
}

async function Deal({ params }: { params: PageProps<"/campaigns/[id]/deals/[dealId]">["params"] }) {
  const { id, dealId } = await params;
  const { db, workspace } = await requireWorkspace();
  const deal = await getDeal(db, workspace.id, dealId).catch((e) => {
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  });
  if (deal.campaign_id !== id) notFound();
  const [stages, members, contacts, urls, posts] = await Promise.all([
    listStages(db, workspace.id),
    listMembers(db, workspace.id),
    listContacts(db, workspace.id, dealId),
    signedUrls(db, [deal.contract_path, deal.invoice_path]),
    listPosts(db, workspace.id, dealId),
  ]);
  const products = deal.campaign ? await brandProducts(db, workspace.id, deal.campaign.brand_id) : [];
  const shotUrls = await signedUrls(db, posts.flatMap((p) => p.snapshots.flatMap((s) => s.screenshot_paths ?? [])));
  const memberName = new Map(members.map((m) => [m.user_id, m.full_name || m.email]));
  const inf = deal.influencer;

  return (
    <section className="space-y-4">
      <Link href={`/campaigns/${id}/pipeline`} className="text-sm text-zinc-500 hover:underline">
        ← {deal.campaign?.brand} · {deal.campaign?.name} pipeline
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">{deal.campaign?.brand} · {deal.campaign?.name}</p>
          <h1 className="text-2xl font-semibold">{inf.name} <span className="text-base font-normal text-zinc-400">in this campaign</span></h1>
          <p className="text-sm text-zinc-500">
            <Link href={`/influencers/${inf.id}`} className="hover:underline">@{inf.handle}</Link> · {compact(inf.followers)} followers{inf.city ? ` · ${inf.city}` : ""}
          </p>
          <p className="text-sm text-zinc-500">{[inf.phone && `Phone ${inf.phone}`, inf.whatsapp && `WhatsApp ${inf.whatsapp}`, inf.email].filter(Boolean).join(" · ")}</p>
        </div>
        <ConfirmButton label="Remove" confirmText="Remove this influencer from the campaign?" action={removeDealAction.bind(null, id, dealId)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <DealForm
            dealId={dealId}
            stages={stages}
            members={members}
            required={deal.campaign?.deliverables ?? []}
            rates={{ reel: inf.rate_reel, story: inf.rate_story, carousel: inf.rate_carousel, collab: inf.rate_collab }}
            stats={inf.rate_stats ?? {}}
            products={products}
            initial={deal}
          />
          <PostsSection dealId={dealId} posts={posts} clientPrice={deal.client_price} payout={deal.payout} shotUrls={shotUrls} />
          <Card title="Contract">
            <FileField dealId={dealId} kind="contract" label="Agreement" url={deal.contract_path ? urls[deal.contract_path] : undefined} />
          </Card>
          <Card title="Contact log">
            <ContactForm dealId={dealId} />
            <ul className="mt-3 divide-y divide-zinc-100">
              {contacts.length === 0 && <li className="py-2 text-sm text-zinc-400">No contact logged yet.</li>}
              {contacts.map((c) => (
                <li key={c.id} className="py-2 text-sm">
                  <span className="font-medium">{CHANNEL[c.channel] ?? c.channel}</span>
                  <span className="text-zinc-400"> · {dateIN(c.contacted_at)} · {memberName.get(c.member_id) ?? "Former member"}</span>
                  {c.note && <p className="whitespace-pre-line text-zinc-700">{c.note}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <PaymentForm dealId={dealId} initial={{ ...deal, amount_paid: Number(deal.amount_paid ?? 0) }} payout={deal.payout}>
            <div className="mt-3">
              <FileField dealId={dealId} kind="invoice" label="Invoice" url={deal.invoice_path ? urls[deal.invoice_path] : undefined} />
            </div>
          </PaymentForm>

        </div>
      </div>
    </section>
  );
}
