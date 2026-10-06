import { NextResponse } from "next/server";

import { getAuthDestination } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const trustedOrigin = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const destination = getAuthDestination(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const response = NextResponse.redirect(new URL(destination, trustedOrigin));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }

  const response = NextResponse.redirect(new URL("/login?auth_error=callback", trustedOrigin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
