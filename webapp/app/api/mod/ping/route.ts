import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/server/db";
import { requireModUser } from "@/lib/server/modTokens";
import { MAX_SIZE } from "@/lib/structureAi";

/** Companion mod: "/mmb status" — checks the token and lists the user's projects. */
export async function GET(request: Request) {
  const user = await requireModUser(request);
  if (user instanceof Response) return user;
  const [rows] = await (await db()).execute<RowDataPacket[]>(
    "SELECT project_key FROM mmb_projects WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50", [user.id]);
  return Response.json({
    username: user.username,
    projects: rows.map((r) => String(r.project_key)),
    ai: process.env.NODE_ENV === "development",
    maxSize: MAX_SIZE,
  });
}
