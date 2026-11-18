import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { registrationFormInfo } from "@/lib/services/workspaces";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Creator registration", robots: { index: false } };

export default function RegisterPage({ params }: PageProps<"/register/[token]">) {
  return (
    <main className="flex flex-1 justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
          <Form params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function Form({ params }: { params: PageProps<"/register/[token]">["params"] }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const agency = await registrationFormInfo(await createClient(), token);
  if (!agency) notFound();
  return (
    <>
      <h1 className="text-xl font-semibold">Work with {agency}</h1>
      <p className="mb-6 text-sm text-zinc-500">Share your details and we’ll get in touch when a brand campaign fits you.</p>
      <RegisterForm token={token} agency={agency} />
    </>
  );
}
