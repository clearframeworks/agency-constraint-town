import type { Metadata } from "next";
import { Laboratory } from "@/components/laboratory";

export const metadata: Metadata = {
  title: "Monte Carlo Laboratory — Agency",
  description: "Run reproducible 1,000-world experiments against the Agency constraint model.",
};

export default function LaboratoryPage() {
  return <Laboratory />;
}
