import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(
  req: NextRequest & { auth: { user?: { id: string } } | null }
) {
  if (!req.auth?.user) {
    const callbackUrl = encodeURIComponent(
      req.nextUrl.pathname + req.nextUrl.search
    );
    return NextResponse.redirect(
      new URL(`/auth/signin?callbackUrl=${callbackUrl}`, req.url)
    );
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/courses/:path*",
    "/settings/:path*",
  ],
};

export default auth(proxy as Parameters<typeof auth>[0]);
