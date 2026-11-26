import { redirect } from "next/navigation";

export default function StaffPage() {
  redirect("/passkey?tab=accounts");
}
