import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export default async function proxy(request: NextRequest) {
  // Fail open: an unconfigured or unreachable Supabase project must not take
  // the whole site down. Every route runs through this proxy, so a hard
  // throw here 500s pages that don't even use Supabase.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  const { response } = await updateSession(request);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
