import { api } from "@/lib/api";
import { authenticate } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return api(request, async () => {
    const { user } = await authenticate(request, true);
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
    };
  });
}
