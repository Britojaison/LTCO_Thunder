import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Thunder", template: "%s · Thunder" },
  description: "Influencer management for agencies",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full overflow-x-clip antialiased">
      <body className="min-h-full flex flex-col overflow-x-clip bg-transparent text-slate-900 antialiased">{children}</body>
    </html>
  );
}
