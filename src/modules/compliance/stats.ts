import { count, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "../../shared/db";
import { accounts } from "../accounts/schema";
import { aiConversations, aiUsage } from "../ai/schema";
import { auditLogs } from "../audit/schema";
import { findings, ingestTokens } from "../connect/schema";
import { browserProfiles, devices } from "../devices/schema";
import { accountConsents, privacyRequests } from "../privacy/schema";
import { signIns } from "../signins/schema";
import { tenants } from "../tenants/schema";
import { users } from "../users/schema";
import type { StatKey } from "./catalog";

/**
 * Aggregate counters behind each processing activity: how many records exist, how many were created in the
 * last 30 days, and (in the platform scope) how many workspaces hold them. Row contents are never read,
 * and row level security limits a workspace's counters to its own rows.
 */

type StatQuery = { table: PgTable; where?: SQL; created: AnyPgColumn; tenant?: AnyPgColumn };

const live = (deletedAt: AnyPgColumn) => isNull(deletedAt);

const QUERIES: Record<StatKey, () => StatQuery> = {
  devices: () => ({ table: devices, where: live(devices.deletedAt), created: devices.createdAt, tenant: devices.tenantId }),
  browserProfiles: () => ({ table: browserProfiles, where: live(browserProfiles.deletedAt), created: browserProfiles.createdAt, tenant: browserProfiles.tenantId }),
  accounts: () => ({ table: accounts, where: live(accounts.deletedAt), created: accounts.createdAt, tenant: accounts.tenantId }),
  signIns: () => ({ table: signIns, where: live(signIns.deletedAt), created: signIns.createdAt, tenant: signIns.tenantId }),
  findings: () => ({ table: findings, where: live(findings.deletedAt), created: findings.createdAt, tenant: findings.tenantId }),
  ingestTokens: () => ({ table: ingestTokens, where: live(ingestTokens.deletedAt), created: ingestTokens.createdAt, tenant: ingestTokens.tenantId }),
  conversations: () => ({ table: aiConversations, where: live(aiConversations.deletedAt), created: aiConversations.createdAt, tenant: aiConversations.tenantId }),
  privacyRequests: () => ({ table: privacyRequests, where: live(privacyRequests.deletedAt), created: privacyRequests.createdAt, tenant: privacyRequests.tenantId }),
  staff: () => ({ table: users, where: live(users.deletedAt), created: users.createdAt, tenant: users.tenantId }),
  tenants: () => ({ table: tenants, where: live(tenants.deletedAt), created: tenants.createdAt }),
  accountConsents: () => ({ table: accountConsents, where: live(accountConsents.deletedAt), created: accountConsents.createdAt }),
  auditLogs: () => ({ table: auditLogs, where: live(auditLogs.deletedAt), created: auditLogs.createdAt, tenant: auditLogs.tenantId }),
  aiUsage: () => ({ table: aiUsage, where: live(aiUsage.deletedAt), created: aiUsage.createdAt, tenant: aiUsage.tenantId }),
};

export type StatValue = { key: StatKey; total: number; recent: number; tenants: number };

const RECENT_DAYS = 30;

export async function countStat(key: StatKey): Promise<StatValue> {
  const query = QUERIES[key]();
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
  const [row] = await db()
    .select({
      total: count(),
      recent: sql<number>`count(*) filter (where ${query.created} >= ${since}::timestamptz)`.mapWith(Number),
      tenants: query.tenant ? sql<number>`count(distinct ${query.tenant})`.mapWith(Number) : sql<number>`0`.mapWith(Number),
    })
    .from(query.table)
    .where(query.where);
  return { key, total: Number(row?.total ?? 0), recent: Number(row?.recent ?? 0), tenants: Number(row?.tenants ?? 0) };
}

export async function countStats(keys: readonly StatKey[]): Promise<StatValue[]> {
  const values: StatValue[] = [];
  // Sequential on purpose: serverless functions hold a single database connection.
  for (const key of keys) values.push(await countStat(key));
  return values;
}
