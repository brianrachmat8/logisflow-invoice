import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LogisFlow — Invoice Logistik",
  description: "Sistem otomasi dan pemisah invoice logistik terpadu.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
