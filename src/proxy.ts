import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default async function proxy(req: NextRequest) {
  const session = await auth();

  if (!session?.user) {
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
