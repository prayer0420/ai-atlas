import { NextRequest } from "next/server";
import { cron } from "@/lib/cron";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export function GET(req: NextRequest) {
  return cron(req, "daily");
}
