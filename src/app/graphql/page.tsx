import type { Metadata } from "next";
import GraphqlExplorer from "@/components/GraphqlExplorer";

export const metadata: Metadata = { title: "GraphQL explorer · API Investigation" };

export default function GraphqlPage() {
  return <GraphqlExplorer />;
}
