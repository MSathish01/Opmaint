import { z } from "zod";

/**
 * Hot Work Permit Distinct Payload Schema
 * Requirements:
 * - Type of hot work (welding / grinding / cutting / soldering)
 * - Fire watch assigned
 * - Fire extinguisher type present
 * - Combustibles cleared radius (e.g. minimum 10m)
 * - Gas test readings (LEL %, O2 %) with test time
 */
export const hotWorkDataSchema = z.object({
  hotWorkType: z.enum(["WELDING", "GRINDING", "CUTTING", "SOLDERING"], {
    errorMap: () => ({ message: "Select a valid hot work type (Welding, Grinding, Cutting, Soldering)" }),
  }),
  fireWatchName: z.string().min(2, "Fire watch person name is mandatory"),
  fireExtinguisherType: z.enum(["CO2", "DCP_POWDER", "WATER_FOAM", "ABC_DRY_CHEMICAL"], {
    errorMap: () => ({ message: "Select valid fire extinguisher type" }),
  }),
  combustiblesClearedRadiusMetres: z
    .number()
    .min(10, "Combustibles must be cleared for at least 10 metres radius around hot work"),
  continuousSparkContainment: z.boolean().default(false),
  gasTest: z.object({
    testTime: z.string().min(1, "Atmospheric gas test time is required"),
    lelPercent: z.number().min(0).max(100, "LEL percentage must be between 0 and 100"),
    o2Percent: z.number().min(0).max(100, "O2 percentage must be between 0 and 100"),
    testedBy: z.string().min(2, "Gas tester name is required"),
  }),
});

export type HotWorkData = z.infer<typeof hotWorkDataSchema>;

/**
 * Confined Space Entry Distinct Payload Schema
 * Requirements:
 * - Space ID
 * - Entry point
 * - Atmospheric test (O2 %, LEL %, H2S ppm, CO ppm) with test time
 * - Standby attendant name
 * - Rescue plan
 * - Ventilation method
 * - Entry/exit log
 */
export const confinedSpaceDataSchema = z.object({
  spaceId: z.string().min(2, "Confined space ID/tag is required (e.g. TANK-TK-402)"),
  entryPoint: z.string().min(2, "Entry point description is required (e.g. Manhole North 24-inch)"),
  standbyAttendantName: z.string().min(2, "Standby attendant name is mandatory for confined space entry"),
  rescuePlanAvailable: z.boolean().refine((val) => val === true, {
    message: "A certified emergency rescue plan must be in place before permit can be issued",
  }),
  ventilationMethod: z.enum(["FORCED_AIR_BLOWER", "NATURAL_DRAFT", "EXHAUST_EXTRACTION"], {
    errorMap: () => ({ message: "Select a valid ventilation method" }),
  }),
  atmosphericTest: z.object({
    testTime: z.string().min(1, "Atmospheric test time is required"),
    o2Percent: z.number().min(19.5, "Oxygen level must be safe (minimum 19.5%)").max(23.5, "Oxygen level cannot exceed 23.5%"),
    lelPercent: z.number().max(10, "LEL must be below 10% for entry authorization"),
    h2sPpm: z.number().max(10, "H2S must be 10 ppm or below"),
    coPpm: z.number().max(25, "Carbon Monoxide must be 25 ppm or below"),
    testedBy: z.string().min(2, "Certified gas tester name is required"),
  }),
  entryExitLog: z
    .array(
      z.object({
        workerName: z.string(),
        timeIn: z.string(),
        timeOut: z.string().optional(),
      })
    )
    .default([]),
});

export type ConfinedSpaceData = z.infer<typeof confinedSpaceDataSchema>;

/**
 * Working at Height Distinct Payload Schema
 * Requirements:
 * - Height in metres
 * - Access method (scaffold / ladder / MEWP / rope)
 * - Fall arrest equipment
 * - Anchor point checked
 * - Barricading below
 */
export const workingAtHeightDataSchema = z.object({
  heightMetres: z.number().min(1.8, "Working at height procedures apply to work at 1.8 metres or above"),
  accessMethod: z.enum(["SCAFFOLD", "LADDER", "MEWP", "ROPE_ACCESS"], {
    errorMap: () => ({ message: "Select access method (Scaffold, Ladder, MEWP, Rope Access)" }),
  }),
  fallArrestEquipment: z
    .array(z.string())
    .min(1, "Specify at least one fall arrest system (e.g. Full body harness with shock absorber)"),
  anchorPointChecked: z.boolean().refine((val) => val === true, {
    message: "Certified anchor point load check must be confirmed",
  }),
  barricadingBelow: z.boolean().refine((val) => val === true, {
    message: "Drop zone barricading and warning tape below must be confirmed",
  }),
  weatherConditionsChecked: z.boolean().default(true),
});

export type WorkingAtHeightData = z.infer<typeof workingAtHeightDataSchema>;

/**
 * Electrical / Isolation (LOTO) Distinct Payload Schema
 * Requirements:
 * - Equipment tag
 * - Voltage level
 * - Isolation points list
 * - Lock numbers
 * - Tag numbers
 * - Earthing applied
 * - Tested dead by whom
 */
export const electricalLotoDataSchema = z.object({
  equipmentTag: z.string().min(2, "Target equipment isolation tag is required"),
  voltageLevel: z.enum(["24V_DC", "110V_AC", "230V_AC", "415V_AC", "3.3KV", "6.6KV", "11KV"], {
    errorMap: () => ({ message: "Select valid operating voltage level" }),
  }),
  isolationPoints: z
    .array(
      z.object({
        pointTag: z.string().min(1, "Isolation point tag/name required"),
        isolationType: z.enum(["BREAKER", "DISCONNECTOR", "FUSE_REMOVAL", "VALVE", "BLIND_FLANGE"]),
        locked: z.boolean(),
        tagged: z.boolean(),
      })
    )
    .min(1, "At least one physical isolation point must be registered"),
  lockNumbers: z.array(z.string()).min(1, "Padlock numbers must be recorded"),
  tagNumbers: z.array(z.string()).min(1, "Danger tag numbers must be recorded"),
  earthingApplied: z.boolean(),
  testedDeadBy: z.string().min(2, "Name of authorized electrical person who proved circuit dead is required"),
  testedDeadTime: z.string().min(1, "Time tested dead is required"),
  multiLockHaspUsed: z.boolean().default(true),
});

export type ElectricalLotoData = z.infer<typeof electricalLotoDataSchema>;

/**
 * Excavation Distinct Payload Schema (Extensibility Demo - 5th Permit Type)
 * Shows that the architecture accommodates a 5th type with zero changes to core DB tables.
 */
export const excavationDataSchema = z.object({
  excavationDepthMetres: z.number().min(0.5, "Depth in metres required"),
  undergroundUtilitiesSurveyDone: z.boolean().refine((val) => val === true, {
    message: "Underground utility scan (gas, power, water) must be verified",
  }),
  shoringOrBatteringRequired: z.boolean(),
  gasTestRequired: z.boolean().default(false),
  competentPersonName: z.string().min(2, "Competent excavation supervisor name required"),
});

export type ExcavationData = z.infer<typeof excavationDataSchema>;

/**
 * Type-specific schema registry mapping
 */
export const typeSpecificSchemas = {
  HOT_WORK: hotWorkDataSchema,
  CONFINED_SPACE: confinedSpaceDataSchema,
  WORKING_AT_HEIGHT: workingAtHeightDataSchema,
  ELECTRICAL_LOTO: electricalLotoDataSchema,
  EXCAVATION: excavationDataSchema,
} as const;

/**
 * Validates polymorphic type-specific data against its corresponding schema
 */
export function validateTypeSpecificData(
  permitType: keyof typeof typeSpecificSchemas,
  data: unknown
): { success: true; data: any } | { success: false; errors: z.ZodError } {
  const schema = typeSpecificSchemas[permitType];
  if (!schema) {
    return {
      success: false,
      errors: new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ["permitType"],
          message: `Unknown permit type: ${permitType}`,
        },
      ]),
    };
  }

  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}
