import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Thunder</h1>
        <p className="mb-6 text-sm text-zinc-500">Influencer management for your agency</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
