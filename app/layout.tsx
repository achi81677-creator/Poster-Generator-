import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Posterlab — Album-Poster-Generator",
  description:
    "Erzeugt aus einem Album ein druckfertiges Poster (PNG/PDF, 150–600 DPI).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
