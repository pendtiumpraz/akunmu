import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db, ownedByScope, type DbExecutor } from "../../shared/db";
import { devices } from "../devices/schema";
import { findings, ingestTokens, type FindingRecord, type IngestTokenRecord, type NewFindingRecord, type NewIngestTokenRecord } from "./schema";
import type { FindingStatus } from "./types";

// ----- ingest tokens -----

export async function insertIngestToken(values: NewIngestTokenRecord, executor?: DbExecutor): Promise<IngestTokenRecord> {
  const [row] = await db(executor).insert(ingestTokens).values(values).returning();
  return row;
}

/** Live (not revoked) tokens of the scope's workspace, newest first, with their device's name. */
export async function listIngestTokens(executor?: DbExecutor) {
  return db(executor)
    .select({ token: ingestTokens, deviceName: devices.name })
    .from(ingestTokens)
    .leftJoin(devices, eq(devices.id, ingestTokens.deviceId))
    .where(and(ownedByScope(ingestTokens.tenantId), isNull(ingestTokens.revokedAt), isNull(ingestTokens.deletedAt)))
    .orderBy(desc(ingestTokens.createdAt));
}

/** A token by its hash, in any workspace (the request names no workspace yet). Needs the platform scope. */
export async function findIngestTokenByHash(tokenHash: string, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(ingestTokens)
    .where(and(eq(ingestTokens.tokenHash, tokenHash), isNull(ingestTokens.revokedAt), isNull(ingestTokens.deletedAt)))
    .limit(1);
  return row;
}

export async function findIngestTokenById(id: number, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(ingestTokens)
    .where(and(eq(ingestTokens.id, id), ownedByScope(ingestTokens.tenantId), isNull(ingestTokens.deletedAt)))
    .limit(1);
  return row;
}

export async function updateIngestToken(id: number, changes: Partial<NewIngestTokenRecord>, executor?: DbExecutor) {
  const [row] = await db(executor).update(ingestTokens).set(changes).where(eq(ingestTokens.id, id)).returning();
  return row;
}

// ----- findings -----

/**
 * Records a finding, or refreshes the one with the same fingerprint: its payload and when it was last seen change,
 * its status does not (a dismissed finding stays dismissed).
 */
export async function upsertFinding(values: NewFindingRecord, executor?: DbExecutor): Promise<FindingRecord> {
  const [row] = await db(executor)
    .insert(findings)
    .values(values)
    .onConflictDoUpdate({
      target: [findings.tenantId, findings.fingerprint],
      set: {
        payload: sql`excluded."payload"`,
        deviceId: sql`coalesce(excluded."device_id", ${findings.deviceId})`,
        tokenId: sql`coalesce(excluded."token_id", ${findings.tokenId})`,
        lastSeenAt: sql`now()`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return row;
}

export async function listFindings(status: FindingStatus, executor?: DbExecutor) {
  return db(executor)
    .select({ finding: findings, deviceName: devices.name })
    .from(findings)
    .leftJoin(devices, eq(devices.id, findings.deviceId))
    .where(and(ownedByScope(findings.tenantId), eq(findings.status, status), isNull(findings.deletedAt)))
    .orderBy(asc(findings.kind), asc(findings.createdAt), asc(findings.id));
}

export async function countFindings(status: FindingStatus, executor?: DbExecutor): Promise<number> {
  const [{ total }] = await db(executor)
    .select({ total: count() })
    .from(findings)
    .where(and(ownedByScope(findings.tenantId), eq(findings.status, status), isNull(findings.deletedAt)));
  return total;
}

export async function findFindingById(id: number, executor?: DbExecutor) {
  const [row] = await db(executor)
    .select()
    .from(findings)
    .where(and(eq(findings.id, id), ownedByScope(findings.tenantId), isNull(findings.deletedAt)))
    .limit(1);
  return row;
}

export async function updateFinding(id: number, changes: Partial<NewFindingRecord>, executor?: DbExecutor) {
  const [row] = await db(executor).update(findings).set(changes).where(eq(findings.id, id)).returning();
  return row;
}
