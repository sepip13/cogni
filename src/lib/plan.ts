import { prisma } from "@/lib/prisma";
import { isUserPro } from "@/lib/access-codes";

/**
 * Resolves whether a user currently has PRO access (plan = PRO, or an
 * unexpired pro-access window). Reuses the canonical `isUserPro` check so plan
 * semantics stay consistent across the app.
 */
export async function isProUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, proAccessEndsAt: true },
  });
  return isUserPro(user ?? { plan: "FREE", proAccessEndsAt: null });
}
