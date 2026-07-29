import type { Metadata } from "next";

import { AboutScreen } from "@/components/about/AboutScreen";

export const metadata: Metadata = {
  title: "Understanding Testament",
  description:
    "What Testament keeps and how to use it, in five gestures. Ce que Testament garde et comment s'en servir, en cinq gestes.",
};

export default function AboutPage() {
  return <AboutScreen />;
}
