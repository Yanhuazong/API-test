import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import Link from "next/link";

const documents: Record<string, string> = {
  "student-api-guide": "student-api-guide.md",
  "student-investigation": "student-investigation.md",
};

export default async function StudentDocument({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const filename = documents[slug];
  if (!filename) notFound();
  const markdown = await readFile(join(process.cwd(), "docs", filename), "utf8");
  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 24px 60px" }}>
      <Link href="/" style={{ color: "#075985" }}>← API Investigation</Link>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit", lineHeight: 1.65 }}>
        {markdown}
      </pre>
    </main>
  );
}
