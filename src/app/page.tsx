import Link from "next/link";

// "/" is redirected to /influencers in next.config.ts. This static fallback is never normally shown.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Link href="/influencers" className="text-sm underline">Open Thunder</Link>
    </main>
  );
}
