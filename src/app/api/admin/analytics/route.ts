import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    proUsers,
    totalCourses,
    readyCourses,
    failedCourses,
    processingCourses,
    recentSignups,
    signupsLast7d,
    coursesLast7d,
    recentActivity,
    signupsByDay,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { plan: "PRO" } }),
    prisma.course.count(),
    prisma.course.count({ where: { status: "READY" } }),
    prisma.course.count({ where: { status: "FAILED" } }),
    prisma.course.count({ where: { status: "PROCESSING" } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.course.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.course.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
    }),
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT DATE("createdAt") as day, COUNT(*)::bigint as count
      FROM "User"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY day ASC
    `,
  ]);

  const serializedSignups = signupsByDay.map((r) => ({
    day: String(r.day).slice(0, 10),
    count: Number(r.count),
  }));

  return NextResponse.json({
    totalUsers,
    proUsers,
    freeUsers: totalUsers - proUsers,
    totalCourses,
    readyCourses,
    failedCourses,
    processingCourses,
    recentSignups,
    signupsLast7d,
    coursesLast7d,
    recentActivity,
    signupsByDay: serializedSignups,
  });
}
