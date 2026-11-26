import { errorReply } from "@/lib/skill-db";
import { reply } from "@/lib/skill-db";

// The former selected-participant edit permission is no longer supported.
async function PATCHHandler() {
  return reply({ error: "利用者への編集権限付与は廃止されました" }, 410);
}

export const PATCH = (...args: Parameters<typeof PATCHHandler>) => PATCHHandler(...args).catch(errorReply);
