import { errorReply, parseBody, reply, skillDb } from "@/lib/skill-db";
import { readManual } from "@/lib/manual-store";
import { accountDenied, getSkillAccount, isStaff } from "@/lib/access-auth";
import { auditStatement } from "@/lib/audit-log.mjs";
import { rejectWriteRequest } from "@/lib/write-request.mjs";
import { availableProgressUserSql } from "@/lib/user-records.mjs";

type ProgressRow = { step_id: string; item_index: number };

async function GETHandler(request: Request) {
  const account = await getSkillAccount();
  const denied = accountDenied(account);
  if (denied) return denied;
  const userId = Number(new URL(request.url).searchParams.get("userId"));
  if (!isStaff(account!) && account!.userId !== userId) return reply({ error: "自分の進捗のみ閲覧できます" }, 403);
  try {
    const db = skillDb();
    const user = await db.prepare(availableProgressUserSql).bind(userId).first();
    if (!user) return reply({ error: "利用者が見つかりません" }, 404);
    const { results } = await db.prepare("SELECT step_id, item_index FROM progress WHERE user_id = ? ORDER BY step_id, item_index").bind(userId).all<ProgressRow>();
    return reply({ progress: results });
  } catch (error) { return errorReply(error); }
}

async function PUTHandler(request: Request) {
  const account = await getSkillAccount();
  const denied = accountDenied(account);
  if (denied) return denied;
  const rejected = rejectWriteRequest(request);
  if (rejected) return rejected;
  const input = await parseBody(request);
  if (!input) return reply({ error: "入力形式が正しくありません" }, 400);
  const userId = Number(input.userId);
  if (!isStaff(account!) && account!.userId !== userId) return reply({ error: "自分の進捗のみ変更できます" }, 403);
  const stepId = input.stepId;
  const itemIndex = input.itemIndex;
  const checked = input.checked;
  if (typeof stepId !== "string" || !Number.isInteger(itemIndex) || (itemIndex as number) < 0 || typeof checked !== "boolean") {
    return reply({ error: "チェック項目が正しくありません" }, 400);
  }
  try {
    const db = skillDb();
    const user = await db.prepare(availableProgressUserSql).bind(userId).first();
    if (!user) return reply({ error: "承認待ちまたは削除済みの利用者には進捗を保存できません" }, 403);
    const manual = await readManual();
    const exists = manual.sections.some(section => section.steps.some(step => step.progressRefs.some(ref => ref[0] === stepId && ref[1] === itemIndex)));
    if (!exists) return reply({ error: "チェック項目が見つかりません" }, 400);
    const change = checked
      ? db.prepare("INSERT OR IGNORE INTO progress (user_id, step_id, item_index, checked_at) VALUES (?, ?, ?, ?)").bind(userId, stepId, itemIndex, new Date().toISOString())
      : db.prepare("DELETE FROM progress WHERE user_id = ? AND step_id = ? AND item_index = ?").bind(userId, stepId, itemIndex);
    await db.batch([change, auditStatement(db, account!.sub, checked ? 'skill.progress.check' : 'skill.progress.uncheck', `user:${userId}:step:${stepId}:${itemIndex}`)]);
    return reply({ ok: true });
  } catch (error) { return errorReply(error); }
}

export const GET = (...args: Parameters<typeof GETHandler>) => GETHandler(...args).catch(errorReply);
export const PUT = (...args: Parameters<typeof PUTHandler>) => PUTHandler(...args).catch(errorReply);
