import { notFound } from "next/navigation";
import AccountAccess from "@/components/AccountAccess";
import Shell from "@/components/Shell";
const pages = [
  "login",
  "register",
  "onboarding",
  "dashboard",
  "chat",
  "voice",
  "browser",
  "whatsapp",
  "email",
  "calendar",
  "automations",
  "files",
  "memory",
  "integrations",
  "activity",
  "settings",
  "admin",
];
export default async function Page({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (page === "account-access") return <AccountAccess />;
  if (!pages.includes(page)) notFound();
  return <Shell page={page} />;
}
