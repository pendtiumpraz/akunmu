/** Request types and statuses of data subject requests; safe to import in browser code. */
export const PRIVACY_REQUEST_TYPES = ["access", "correction", "deletion", "portability", "restriction", "objection", "withdraw_consent"] as const;
export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export const PRIVACY_REQUEST_STATUSES = ["received", "in_progress", "completed", "rejected"] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

/** Who answers the request: the workspace's admins or the AkunMu operator. */
export const PRIVACY_REQUEST_RECIPIENTS = ["workspace", "platform"] as const;
export type PrivacyRequestRecipient = (typeof PRIVACY_REQUEST_RECIPIENTS)[number];

export const CLOSED_REQUEST_STATUSES: readonly PrivacyRequestStatus[] = ["completed", "rejected"];

/** Version of the privacy policy and terms users accept: the policy's "updated" date. */
export const POLICY_VERSION = "2026-10-12";
