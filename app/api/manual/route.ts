import { errorReply, parseBody, reply, skillDb } from "@/lib/skill-db";
import { canEditManual, getAdminStatus } from "@/lib/admin-auth";
import { maskManualImages, readManual, validateManual } from "@/lib/manual-store";
import { getSkillAccount } from "@/lib/access-auth";
import { auditStatement } from "@/lib/audit-log.mjs";
import { rejectWriteRequest } from "@/lib/write-request.mjs";
import { guides } from "@/lib/guides.js";

async function GETHandler() {
  const account = await getSkillAccount();
  if (!account) return reply({ error: "ログインしてください" }, 401);
  if (!account.active) return reply({ error: "このアカウントは利用できません" }, 403);
  try {
    const manual = await readManual();
    return reply({
      ...manual,
      sections: account.role === "provisional" ? maskManualImages(manual.sections) : manual.sections,
      imageAccess: account.role === "provisional" ? "locked" : "full",
      guides,
    });
  }
  catch (error) { return errorReply(error); }
}

async function PUTHandler(request: Request) {
  const status = await getAdminStatus();
  if (!await canEditManual(undefined, status)) return reply({ error: "工程の編集には職員パスキー認証が必要です" }, status.authenticated ? 403 : 401);
  const rejected = rejectWriteRequest(request);
  if (rejected) return rejected;
  const input = await parseBody(request);
  const sections = input?.sections;
  const version = input?.version;
  if (!validateManual(sections) || !Number.isInteger(version) || (version as number) < 0 || JSON.stringify(sections).length > 500_000) {
    return reply({ error: "マニュアルの内容が正しくありません" }, 400);
  }
  try {
    const db = skillDb();
    await db.prepare("INSERT OR IGNORE INTO manual_documents (id, content, version) VALUES (1, ?, 0)")
      .bind("[]").run();
    const result = await db.prepare("UPDATE manual_documents SET content = ?, version = version + 1 WHERE id = 1 AND version = ?")
      .bind(JSON.stringify(sections), version).run();
    if (!result.meta.changes) return reply({ error: "他の人が更新しました。ページを再読み込みしてください" }, 409);
    const account = await getSkillAccount();
    await auditStatement(db, account!.sub, 'skill.manual.update', `version:${(version as number) + 1}`).run();
    return reply({ sections, version: (version as number) + 1 });
  } catch (error) { return errorReply(error); }
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
export const PUT = (...args: Parameters<typeof PUTHandler>) => PUTHandler(...args).catch(errorReply);
