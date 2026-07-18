export type ProjectType = "commercial" | "internal";

export const SIMULATION_DISCLAIMER = "Scenario simulation based on user and model assumptions. It is not a trained prediction of project success.";
export const POSITIVE_OUTCOME_LABEL = "Probability of positive Year-1 financial outcome under selected assumptions";

interface CommonAssumptions {
  annualOperatingCost: number;
  capEx: number;
  adoptionRate: number;
  costStdDev: number;
  adoptionStdDev: number;
}
interface CommercialAssumptions extends CommonAssumptions {
  annualRevenue: number;
  revenueStdDev: number;
}

interface InternalAssumptions extends CommonAssumptions {
  annualLabourCostAvoided: number;
  annualProductivityBenefit: number;
  benefitStdDev: number;
}

export type SimulationInput =
  | { projectType: "commercial"; iterations: number; seed: number; assumptions: CommercialAssumptions }
  | { projectType: "internal"; iterations: number; seed: number; assumptions: InternalAssumptions };

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function normal(random: () => number): number {
  let u = random();
  let v = random();
  if (u <= Number.EPSILON) u = Number.EPSILON;
  if (v <= Number.EPSILON) v = Number.EPSILON;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function quantile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentile)));
  return sorted[index];
}

function validate(input: SimulationInput) {
  if (!Number.isInteger(input.iterations) || input.iterations < 10 || input.iterations > 100_000) throw new Error("Invalid iteration count");
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xFFFFFFFF) throw new Error("Invalid random seed");
  const values = Object.values(input.assumptions);
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) throw new Error("Simulation assumptions must be finite and non-negative");
  if (input.assumptions.adoptionRate > 1) throw new Error("Adoption rate must be between 0 and 1");
  if (input.assumptions.costStdDev > 1 || input.assumptions.adoptionStdDev > 1) throw new Error("Volatility must be between 0 and 1");
  if (input.projectType === "commercial" && input.assumptions.revenueStdDev > 1) throw new Error("Volatility must be between 0 and 1");
  if (input.projectType === "internal" && input.assumptions.benefitStdDev > 1) throw new Error("Volatility must be between 0 and 1");
}

export function detectProjectType(input: { businessModel?: string; revenueModel?: string }): ProjectType {
  const text = `${input.businessModel ?? ""} ${input.revenueModel ?? ""}`;
  return /internal|cost\s*(?:avoidance|saving)|productivity|no external revenue/i.test(text) ? "internal" : "commercial";
}

export function runScenarioSimulation(input: SimulationInput) {
  validate(input);
  const random = rng(input.seed);
  const outcomes: number[] = [];
  let positive = 0;
  for (let index = 0; index < input.iterations; index += 1) {
    const adoption = Math.max(0, Math.min(1, input.assumptions.adoptionRate * (1 + input.assumptions.adoptionStdDev * normal(random))));
    const operatingCost = Math.max(0, input.assumptions.annualOperatingCost * (1 + input.assumptions.costStdDev * normal(random)));
    const yearOneCapExCharge = input.assumptions.capEx * 0.2;
    let outcome: number;
    if (input.projectType === "commercial") {
      const revenue = Math.max(0, input.assumptions.annualRevenue * (1 + input.assumptions.revenueStdDev * normal(random)));
      outcome = revenue * adoption - operatingCost - yearOneCapExCharge;
    } else {
      const benefitBase = input.assumptions.annualLabourCostAvoided + input.assumptions.annualProductivityBenefit;
      const benefit = Math.max(0, benefitBase * (1 + input.assumptions.benefitStdDev * normal(random)));
      outcome = benefit * adoption - operatingCost - yearOneCapExCharge;
    }
    outcomes.push(outcome);
    if (outcome > 0) positive += 1;
  }

  const mean = outcomes.reduce((total, value) => total + value, 0) / outcomes.length;
  const distributions = input.projectType === "commercial"
    ? [
        { name: "Annual revenue", distribution: "Normal", standardDeviation: input.assumptions.revenueStdDev },
        { name: "Annual operating cost", distribution: "Normal", standardDeviation: input.assumptions.costStdDev },
        { name: "Adoption", distribution: "Bounded normal", standardDeviation: input.assumptions.adoptionStdDev },
      ]
    : [
        { name: "Cost savings and productivity benefit", distribution: "Normal", standardDeviation: input.assumptions.benefitStdDev },
        { name: "Annual operating cost", distribution: "Normal", standardDeviation: input.assumptions.costStdDev },
        { name: "Internal adoption", distribution: "Bounded normal", standardDeviation: input.assumptions.adoptionStdDev },
      ];

  return {
    projectType: input.projectType,
    seed: input.seed,
    iterations: input.iterations,
    metricLabel: POSITIVE_OUTCOME_LABEL,
    disclaimer: SIMULATION_DISCLAIMER,
    positiveOutcomeProbability: positive / input.iterations * 100,
    outcome: { p10: quantile(outcomes, 0.1), p50: quantile(outcomes, 0.5), p90: quantile(outcomes, 0.9), mean },
    distributions,
  };
}
