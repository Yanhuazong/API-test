import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const files = new Set([
  "API_Investigation_Lab.postman_collection.json",
  "Lab.postman_environment.json",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const filename = (await context.params).filename;
  if (!files.has(filename)) {
    return NextResponse.json({ error: { code: "RESOURCE_NOT_FOUND", message: "The requested download was not found." } }, { status: 404 });
  }
  const content = await readFile(join(process.cwd(), "postman", filename), "utf8");
  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
