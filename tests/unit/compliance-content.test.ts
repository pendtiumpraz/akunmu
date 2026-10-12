import { describe, expect, it } from "vitest";
import activitiesEn from "@/content/compliance/activities.en.json";
import activitiesId from "@/content/compliance/activities.id.json";
import commonEn from "@/content/compliance/common.en.json";
import commonId from "@/content/compliance/common.id.json";
import privacyEn from "@/content/legal/privacy.en.json";
import privacyId from "@/content/legal/privacy.id.json";
import termsEn from "@/content/legal/terms.en.json";
import termsId from "@/content/legal/terms.id.json";
import { ACTIVITIES, INFRASTRUCTURE } from "@/modules/compliance/catalog";
import { neonRegion } from "@/modules/compliance/hosting";
import { inherentRisk, residualRisk, summarizeRisks } from "@/modules/compliance/risk";
import { POLICY_VERSION } from "@/modules/privacy/types";

type Tree = Record<string, unknown>;

/** Leaf paths with their value type (arrays count as one leaf with their length). */
function shape(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [`${prefix}[${value.length}]`];
  if (value && typeof value === "object") return Object.entries(value as Tree).flatMap(([key, child]) => shape(child, prefix ? `${prefix}.${key}` : key));
  return [prefix];
}

describe("compliance catalog content", () => {
  it("has the same structure in every language", () => {
    expect(shape(activitiesId).sort()).toEqual(shape(activitiesEn).sort());
    expect(shape(commonId).sort()).toEqual(shape(commonEn).sort());
  });

  it("describes every catalog activity, its risks and every infrastructure component", () => {
    const content = activitiesEn as Record<string, { risks: Record<string, unknown> }>;
    for (const activity of ACTIVITIES) {
      expect(content[activity.key], activity.key).toBeDefined();
      for (const risk of activity.risks) expect(content[activity.key].risks[risk.id], `${activity.key}/${risk.id}`).toBeDefined();
    }
    for (const component of INFRASTRUCTURE) expect(commonEn.infrastructure[component]).toBeDefined();
  });
});

describe("legal documents", () => {
  it("match across languages and carry the policy version users accept", () => {
    expect(shape(privacyId).sort()).toEqual(shape(privacyEn).sort());
    expect(shape(termsId).sort()).toEqual(shape(termsEn).sort());
    expect(privacyEn.updated).toBe(POLICY_VERSION);
    expect(termsEn.updated).toBe(POLICY_VERSION);
  });
});

describe("DPIA risk scoring", () => {
  it("follows the standard's matrix, which weighs impact more than likelihood", () => {
    expect(inherentRisk(5, 1)).toMatchObject({ level: 5, name: "High" });
    expect(inherentRisk(1, 5)).toMatchObject({ level: 2, name: "Low to Moderate" });
    expect(inherentRisk(3, 3)).toMatchObject({ level: 3, rank: 13 });
    expect(inherentRisk(6, 1)).toBeNull();
    expect(residualRisk(4, 2)).toMatchObject({ value: 2, status: "mitigate" });
    expect(residualRisk(3, 3)).toMatchObject({ value: 0, status: "minimal" });
  });

  it("summarizes the register from residual values, or inherent ones until controls are rated", () => {
    expect(summarizeRisks([{ impact: 4, likelihood: 3, control: 1 }, { impact: 2, likelihood: 2, control: 3 }])).toMatchObject({ scored: 2, residualMax: 3, toMitigate: 1, overall: "high" });
    expect(summarizeRisks([{ impact: 3, likelihood: 3 }])).toMatchObject({ overall: "medium", residualMax: null });
    expect(summarizeRisks([])).toMatchObject({ overall: null });
  });
});

describe("data locations", () => {
  it("reads the region from Neon host names", () => {
    expect(neonRegion("ep-cool-river-123456-pooler.ap-southeast-1.aws.neon.tech")).toBe("ap-southeast-1");
    expect(neonRegion("ep-x.eastus2.azure.neon.tech")).toBe("eastus2");
    expect(neonRegion("localhost")).toBeNull();
  });
});
