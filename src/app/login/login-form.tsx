"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signUp, signInWithGoogle, type AuthState } from "./actions";

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const next = useSearchParams().get("next") ?? "/";
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "signin" ? signIn : signUp,
    {},
  );

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="text-sm text-zinc-600">Email</span>
          <input name="email" type="email" required autoComplete="email"
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-zinc-900" />
        </label>
        <label className="block">
          <span className="text-sm text-zinc-600">Password</span>
          <input name="password" type="password" required minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-zinc-900" />
        </label>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.message && <p className="text-sm text-emerald-700">{state.message}</p>}
        <button disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 font-medium text-white disabled:opacity-50">
          {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-medium">
          Continue with Google
        </button>
      </form>

      <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="w-full text-sm text-zinc-600 underline">
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
