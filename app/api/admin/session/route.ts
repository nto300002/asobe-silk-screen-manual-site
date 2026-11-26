import { errorReply } from "@/lib/skill-db";
import { getAdminStatus } from "@/lib/admin-auth";
import { reply } from "@/lib/skill-db";

async function GETHandler() {
  return reply(await getAdminStatus());
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
