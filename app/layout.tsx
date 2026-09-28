import type { Metadata } from "next";
import "./globals.css";
import "./agency-experience.css";

export const metadata: Metadata = {
  title: "Agency — The Constraint Town",
  description:
    "A living, reproducible simulation of poverty, pressure, buffer, and structural failure.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
