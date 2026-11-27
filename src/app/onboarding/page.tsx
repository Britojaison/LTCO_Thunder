import { Suspense } from "react";
import { OnboardingForm } from "./onboarding-form";
import { SignedInAs } from "./signed-in-as";
import { PendingInvites } from "./pending-invites";

export const metadata = { title: "Set up your workspace" };

export default function OnboardingPage() {
  return (
    <main className="bg-thunder-mesh flex flex-1 items-center justify-center p-6">
      <div className="glass-card w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">Set up your agency</h1>
        <p className="mb-6 text-sm text-zinc-500">
          Everything in Thunder lives inside a workspace. Only its members can see its data.
        </p>
        <Suspense fallback={<div className="mb-4 h-8" />}>
          <SignedInAs />
        </Suspense>
        <Suspense fallback={null}>
          <PendingInvites />
        </Suspense>
        <OnboardingForm />
      </div>
    </main>
  );
}
