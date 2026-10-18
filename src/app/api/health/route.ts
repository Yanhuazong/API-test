import { api } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return api(request, async () => ({ status: "ok" }));
}
