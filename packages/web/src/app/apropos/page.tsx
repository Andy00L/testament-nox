import type { Metadata } from "next";

import { AboutScreen } from "@/components/about/AboutScreen";

export const metadata: Metadata = {
  title: "Comprendre Testament",
  description:
    "Ce que Testament garde et comment s'en servir, en cinq gestes. What Testament keeps and how to use it, in five gestures.",
};

export default function AboutPage() {
  return <AboutScreen />;
}
