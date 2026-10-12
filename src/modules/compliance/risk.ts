/**
 * DPIA risk scoring per the Privasimu DPIA standard (DPIA.xlsx, sheet "Kriteria Risiko"), the same rules as
 * Privasimu's frontend `lib/dpia-risk-matrix.ts` and backend `SkorRisikoDpia`:
 *
 *  - impact and likelihood are scored 1–5, the control rating 1 (Not Effective), 2 (Partially Effective)
 *    or 3 (Effective); the treatment is mitigate | accept | transfer | terminate;
 *  - the inherent rating comes from the standard's 5×5 matrix, which weighs impact more than likelihood
 *    (likelihood 1 × impact 5 is High) — it is not impact × likelihood;
 *  - residual = inherent rating − control rating; ≤ 1 needs minimal action, > 1 must be mitigated.
 *
 * Level names are the standard's own and stay the same in every language.
 */

export const RISK_CATEGORIES = [
  "legal_basis",
  "retention",
  "authentication",
  "access_monitoring",
  "encryption_structured",
  "encryption_unstructured",
  "anonymization",
  "authorization",
  "third_parties",
  "periodic_monitoring",
  "due_diligence",
  "data_mapping",
  "backup_restore",
  "backup_security",
  "privacy_notice",
  "data_minimization",
  "data_destruction",
  "data_quality",
  "data_verification",
  "cross_border",
  "subject_rights",
] as const;

export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const TREATMENTS = ["mitigate", "accept", "transfer", "terminate"] as const;
export type Treatment = (typeof TREATMENTS)[number];

export type RiskLevel = 1 | 2 | 3 | 4 | 5;
export type Score5 = 1 | 2 | 3 | 4 | 5;
export type Score3 = 1 | 2 | 3;

/** Inherent rating per [likelihood][impact] ("Kriteria Risiko" B7:H11). */
const MATRIX: Record<number, Record<number, RiskLevel>> = {
  5: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 5 },
  4: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
  3: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
  2: { 1: 1, 2: 2, 3: 2, 4: 4, 5: 5 },
  1: { 1: 1, 2: 1, 3: 2, 4: 3, 5: 5 },
};

/** Priority (25 = first) per [likelihood][impact], printed in each matrix cell of the standard. */
const RANKS: Record<number, Record<number, number>> = {
  5: { 1: 7, 2: 12, 3: 17, 4: 22, 5: 25 },
  4: { 1: 4, 2: 9, 3: 14, 4: 19, 5: 24 },
  3: { 1: 3, 2: 8, 3: 13, 4: 18, 5: 23 },
  2: { 1: 2, 2: 6, 3: 11, 4: 16, 5: 21 },
  1: { 1: 1, 2: 5, 3: 10, 4: 15, 5: 20 },
};

export const RISK_LEVEL_NAMES: Record<RiskLevel, string> = {
  1: "Low",
  2: "Low to Moderate",
  3: "Moderate",
  4: "Moderate to High",
  5: "High",
};

export const CONTROL_NAMES: Record<Score3, string> = {
  1: "Not Effective",
  2: "Partially Effective",
  3: "Effective",
};

export const RESIDUAL_NAMES = { minimal: "Minimal Action Required", mitigate: "Mitigate" } as const;
export type ResidualStatus = keyof typeof RESIDUAL_NAMES;

/** Integer in 1..max, or null (fractions, text and out-of-range values are rejected, not clamped). */
export function scoreValue(value: unknown, max: number): number | null {
  const number = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  return typeof number === "number" && Number.isInteger(number) && number >= 1 && number <= max ? number : null;
}

export type InherentRisk = { level: RiskLevel; rank: number; name: string };
export type ResidualRisk = { value: number; status: ResidualStatus; name: string };

export function inherentRisk(impact: unknown, likelihood: unknown): InherentRisk | null {
  const i = scoreValue(impact, 5);
  const l = scoreValue(likelihood, 5);
  if (i === null || l === null) return null;
  const level = MATRIX[l][i];
  return { level, rank: RANKS[l][i], name: RISK_LEVEL_NAMES[level] };
}

/** Residual = inherent rating − control rating (may go below 1). Null until the control is rated. */
export function residualRisk(inherentLevel: number | null | undefined, control: unknown): ResidualRisk | null {
  const c = scoreValue(control, 3);
  if (!inherentLevel || c === null) return null;
  const value = inherentLevel - c;
  const status: ResidualStatus = value <= 1 ? "minimal" : "mitigate";
  return { value, status, name: RESIDUAL_NAMES[status] };
}

/** A residual value placed on the 1–5 level scale (for badges). */
export function levelForValue(value: number): RiskLevel {
  return Math.min(5, Math.max(1, Math.round(value))) as RiskLevel;
}

export type OverallRisk = "low" | "medium" | "high";

/** Overall DPIA badge: nothing left to do is low; Mitigate is medium at 2 and high from 3. */
export function overallFromResidual(residual: number): OverallRisk {
  return residual <= 1 ? "low" : residual === 2 ? "medium" : "high";
}

/** Overall badge while no control is rated yet: from the highest inherent rating. */
export function overallFromInherent(inherent: number): OverallRisk {
  return inherent >= 4 ? "high" : inherent === 3 ? "medium" : "low";
}

export type ScoredRiskInput = { impact?: unknown; likelihood?: unknown; control?: unknown };

export type RiskSummary = {
  scored: number;
  inherentMax: RiskLevel | null;
  residualMax: number | null;
  toMitigate: number;
  overall: OverallRisk | null;
};

export function summarizeRisks(risks: ScoredRiskInput[]): RiskSummary {
  const inherent = risks.map((risk) => inherentRisk(risk.impact, risk.likelihood)).filter((value): value is InherentRisk => value !== null);
  const residuals = risks
    .map((risk) => residualRisk(inherentRisk(risk.impact, risk.likelihood)?.level, risk.control)?.value)
    .filter((value): value is number => typeof value === "number");
  const inherentMax = inherent.length > 0 ? (Math.max(...inherent.map((value) => value.level)) as RiskLevel) : null;
  const residualMax = residuals.length > 0 ? Math.max(...residuals) : null;
  return {
    scored: inherent.length,
    inherentMax,
    residualMax,
    toMitigate: residuals.filter((value) => value > 1).length,
    overall: residualMax !== null ? overallFromResidual(residualMax) : inherentMax !== null ? overallFromInherent(inherentMax) : null,
  };
}

/** Badge tone (1–5) of an overall level, shared by screens and documents. */
export const OVERALL_TONE: Record<OverallRisk, RiskLevel> = { low: 1, medium: 3, high: 5 };
