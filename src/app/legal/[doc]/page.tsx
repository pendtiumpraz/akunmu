import { FileText, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLegalDocument, loadLegalDocument, LEGAL_DOCUMENTS } from "@/modules/legal/documents";
import { platformContactEmail, platformOperatorName } from "@/shared/env";
import { getI18n } from "@/shared/i18n/server";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { Logo } from "@/shared/ui/logo";
import { ThemeToggle } from "@/shared/ui/theme";

type Props = { params: Promise<{ doc: string }> };

async function documentFor(doc: string) {
  if (!isLegalDocument(doc)) notFound();
  const { t, locale } = await getI18n();
  const contact = platformContactEmail() ?? t("legal.contactMissing");
  return loadLegalDocument(doc, locale, { operator: platformOperatorName(), contact });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalDocument(doc)) return {};
  const document = await documentFor(doc);
  return { title: document.title, description: document.intro.slice(0, 160) };
}

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((doc) => ({ doc }));
}

/** Terms of Service and Privacy Policy of AkunMu, in the visitor's language. */
export default async function LegalPage({ params }: Props) {
  const { doc } = await params;
  const [{ t, format }, document] = await Promise.all([getI18n(), documentFor(doc)]);
  const other = doc === "privacy" ? "terms" : "privacy";

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex items-center gap-3 text-accent">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft">
            <FileText className="size-5" />
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-[0.12em]">{t("legal.eyebrow")}</span>
        </div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{document.title}</h1>
        <p className="mt-2 text-sm text-muted">{t("legal.updated", { date: format.date(document.updated) })}</p>
        <div className="mt-6 flex gap-3 rounded-panel border border-warn-line bg-warn-soft p-4 text-sm leading-6 text-warn-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{t("legal.draftNotice")}</p>
        </div>
        <p className="mt-8 text-base leading-7 text-ink-2">{document.intro}</p>

        <nav aria-label={t("legal.contents")} className="mt-8 rounded-panel border border-line bg-surface p-5">
          <p className="text-[13px] font-semibold text-ink">{t("legal.contents")}</p>
          <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {document.sections.map((section, index) => (
              <li key={section.heading}>
                <a href={`#section-${index + 1}`} className="text-sm text-accent hover:underline">
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {document.sections.map((section, index) => (
            <section key={section.heading} id={`section-${index + 1}`} className="scroll-mt-24">
              <h2 className="text-xl font-bold text-ink">{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-[15px] leading-7 text-ink-2">
                  {paragraph}
                </p>
              ))}
              {section.items ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-7 text-ink-2 marker:text-accent">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
        <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
          <Link href={`/legal/${other}`} className="font-semibold text-accent hover:underline">
            {t(other === "privacy" ? "legal.privacy" : "legal.terms")}
          </Link>
        </p>
      </article>
    </div>
  );
}
