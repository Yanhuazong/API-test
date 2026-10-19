import type { Metadata } from "next";
import AdvisingApp from "@/components/AdvisingApp";

export const metadata: Metadata = { title: "Campus advising · API Investigation" };

export default function AdvisingPage() {
  return <AdvisingApp />;
}
