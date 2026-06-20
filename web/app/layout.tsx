import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scaffold — Complete Your Writing",
  description:
    "AI-powered assignment completion system that tracks your actual writing progress",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
