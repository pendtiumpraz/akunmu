import { and, desc, eq, isNull } from "drizzle-orm";
import { asPlatform, db } from "../../shared/db";
import { recordAudit } from "../audit/service";
import { accountConsents, type AccountConsentRecord } from "./schema";
import { POLICY_VERSION } from "./types";

/**
 * Proof of consent (PP 33/2026 Art. 36) and its withdrawal (Art. 37 and 90). Each change adds a record, so the
 * history shows what the user accepted and when. Account data is the operator's: always the platform scope.
 */

export type ConsentState = {
  policyVersion: string;
  /** The version the user last accepted (null when they never did, e.g. accounts created before consent records). */
  acceptedVersion: string | null;
  acceptedAt: Date | null;
  marketing: boolean;
  /** true when the policy changed since the user last accepted it. */
  needsAcceptance: boolean;
  history: Array<Pick<AccountConsentRecord, "policyVersion" | "termsAccepted" | "marketing" | "source" | "createdAt">>;
};

export async function recordConsent(input: { userId: number; tenantId: number | null; marketing: boolean; source: "signup" | "settings" }): Promise<void> {
  await asPlatform(async () => {
    await db().insert(accountConsents).values({
      userId: input.userId,
      tenantId: input.tenantId,
      policyVersion: POLICY_VERSION,
      termsAccepted: true,
      marketing: input.marketing,
      source: input.source,
      choices: { terms: true, privacy: true, marketing: input.marketing },
    });
    await recordAudit({ actorType: "staff", actorId: input.userId, action: "consent.recorded", subjectType: "user", subjectId: input.userId, meta: { version: POLICY_VERSION, marketing: input.marketing, source: input.source } });
  });
}

export async function consentState(userId: number): Promise<ConsentState> {
  // Awaited inside the scope: a query builder only runs when awaited, and must run as the platform.
  const rows = await asPlatform(async () =>
    await db()
      .select()
      .from(accountConsents)
      .where(and(eq(accountConsents.userId, userId), isNull(accountConsents.deletedAt)))
      .orderBy(desc(accountConsents.createdAt)),
  );
  const latest = rows[0];
  return {
    policyVersion: POLICY_VERSION,
    acceptedVersion: latest?.policyVersion ?? null,
    acceptedAt: latest?.createdAt ?? null,
    marketing: latest?.marketing ?? false,
    needsAcceptance: !latest || latest.policyVersion !== POLICY_VERSION,
    history: rows.map(({ policyVersion, termsAccepted, marketing, source, createdAt }) => ({ policyVersion, termsAccepted, marketing, source, createdAt })),
  };
}

/** Accepting the current policy again, or changing product news, from Settings → My data. */
export async function updateConsent(userId: number, tenantId: number, marketing: boolean): Promise<ConsentState> {
  await recordConsent({ userId, tenantId, marketing, source: "settings" });
  return consentState(userId);
}

/** Erasing an account: its consent records are no longer needed as proof once the account is gone. */
export async function deleteConsentsOfUser(userId: number): Promise<void> {
  await asPlatform(async () => {
    await db().delete(accountConsents).where(eq(accountConsents.userId, userId));
  });
}
