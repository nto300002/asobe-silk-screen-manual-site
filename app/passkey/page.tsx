import { redirect } from "next/navigation";
import { getSkillAccount, isStaff } from "@/lib/access-auth";
import { appSessionPath, safeRelativeReturnPath } from "@/app/chatgpt-auth";
import PasskeyPage from "./passkey-client";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: {searchParams: Promise<{return_to?:string}>}) {
  const returnTo = safeRelativeReturnPath((await searchParams).return_to ?? "/");
  const account = await getSkillAccount();
  if (!account) redirect(appSessionPath(`/passkey?return_to=${encodeURIComponent(returnTo)}`));
  if (!isStaff(account)) redirect("/");
  return <PasskeyPage returnTo={returnTo} />;
}
