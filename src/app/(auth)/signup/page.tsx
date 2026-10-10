import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readStaffSession } from "@/modules/users/session";
import { getI18n } from "@/shared/i18n/server";
import { AuthFrame } from "../auth-frame";
import { SignupForm } from "./signup-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("signup.metaTitle") };
}

/** Self-service sign-up of a workspace and its first admin. */
export default async function SignupPage() {
  if (await readStaffSession()) redirect("/app");
  const { t } = await getI18n();
  return (
    <AuthFrame
      title={t("signup.title")}
      subtitle={t("signup.subtitle")}
      footer={
        <>
          {t("signup.haveAccount")}{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            {t("signup.signIn")}
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthFrame>
  );
}
