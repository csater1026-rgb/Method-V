import { NextResponse, type NextRequest } from "next/server";

import { dashboardContext } from "@/lib/dashboard";
import { getAnalytics } from "@/lib/data";

// Pro: the dashboard's daily numbers as a CSV file.
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const ctx = await dashboardContext(p.get("app") ?? undefined, p.get("days") ?? undefined);
  if (!ctx.app) return new NextResponse("Not found", { status: 404 });
  if (!ctx.pro) return new NextResponse("CSV export is part of Pro.", { status: 403 });

  const analytics = await getAnalytics(ctx.app.id, ctx.days);
  if ("error" in analytics) return new NextResponse(analytics.error, { status: 403 });
  const rows = [
    "date,tries,sponsored_tries,likes,feedback",
    ...analytics.daily.map((d) => [d.day, d.tries, d.sponsored, d.likes, d.feedback].join(",")),
  ];
  return new NextResponse(`${rows.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ctx.app.slug}-${ctx.days}d.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
