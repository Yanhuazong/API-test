import type { Metadata } from "next";
import Explorer from "@/components/Explorer";

export const metadata: Metadata = { title: "API explorer · API Investigation" };

export default function ExplorerPage() {
  return <Explorer />;
}
