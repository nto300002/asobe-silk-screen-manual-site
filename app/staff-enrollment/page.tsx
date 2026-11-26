import { redirect } from "next/navigation";
import { getSkillAccount } from "@/lib/access-auth";
import { appSessionPath } from "@/app/chatgpt-auth";
import StaffEnrollmentClient from "./staff-enrollment-client";
import AdminEnrollment from "./admin-enrollment";

export const dynamic = "force-dynamic";

export default async function Page() {
  const account = await getSkillAccount();
  if (!account) redirect(appSessionPath("/staff-enrollment"));
  if (!account.active) redirect("/");
  if (account.role === "admin") return <AdminEnrollment />;
  if (account.role === "staff") redirect("/passkey");
  return <StaffEnrollmentClient />;
}
