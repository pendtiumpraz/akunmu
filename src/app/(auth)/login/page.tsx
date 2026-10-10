import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readStaffSession } from "@/modules/users/session";
import { getI18n } from "@/shared/i18n/server";
import { AuthFrame } from "../auth-frame";
import { StaffLoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("auth.title"), robots: { index: false } };
}

export default async function StaffLoginPage() {
  if (await readStaffSession()) redirect("/app");
  const { t } = await getI18n();
  return (
    <AuthFrame
      title={t("auth.title")}
      subtitle={t("auth.subtitle")}
      footer={
        <>
          {t("auth.noAccountSignup")}{" "}
          <Link href="/signup" className="font-semibold text-accent hover:underline">
            {t("auth.signupLink")}
          </Link>
        </>
      }
    >
      <StaffLoginForm />
    </AuthFrame>
  );
}
