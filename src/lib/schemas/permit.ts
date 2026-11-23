import { z } from "zod";
import { typeSpecificSchemas } from "./permit-types";

export const permitTypeEnum = z.enum([
  "HOT_WORK",
  "CONFINED_SPACE",
  "WORKING_AT_HEIGHT",
  "ELECTRICAL_LOTO",
  "EXCAVATION",
]);

export const permitStatusEnum = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
  "CLOSED",
  "CLOSED_VERIFIED",
  "CANCELLED",
  "REJECTED",
]);

/**
 * Shared Core Permit Fields
 */
export const corePermitFieldsSchema = z.object({
  permitType: permitTypeEnum,
  areaId: z.string().uuid("A valid plant area must be selected"),
  equipmentId: z.string().uuid("A valid equipment asset must be selected"),
  contractorName: z.string().min(2, "Contractor or maintenance team name is required"),
  workDescription: z.string().min(10, "Provide a comprehensive description of the hazardous work"),
  plannedStartTime: z.string().or(z.date()).transform((val) => new Date(val)),
  plannedEndTime: z.string().or(z.date()).transform((val) => new Date(val)),
  hazardsIdentified: z.array(z.string()).min(1, "Select at least one identified hazard"),
  ppeRequired: z.array(z.string()).min(1, "Select required PPE items"),
  precautionsChecklist: z.record(z.boolean()).default({}),
});

/**
 * Full Permit Submission Schema
 * Validates core fields + checks that end time is after start time
 */
export const submitPermitSchema = corePermitFieldsSchema
  .extend({
    typeSpecificData: z.record(z.any()),
  })
  .refine(
    (data) => {
      const start = new Date(data.plannedStartTime).getTime();
      const end = new Date(data.plannedEndTime).getTime();
      return end > start;
    },
    {
      message: "Planned end time must be strictly after planned start time",
      path: ["plannedEndTime"],
    }
  );

/**
 * Save Draft Schema (Lenient - permits partial draft saving)
 */
export const saveDraftPermitSchema = z.object({
  permitType: permitTypeEnum,
  areaId: z.string().uuid().optional(),
  equipmentId: z.string().uuid().optional(),
  contractorName: z.string().optional().default(""),
  workDescription: z.string().optional().default(""),
  plannedStartTime: z.string().or(z.date()).optional(),
  plannedEndTime: z.string().or(z.date()).optional(),
  hazardsIdentified: z.array(z.string()).default([]),
  ppeRequired: z.array(z.string()).default([]),
  precautionsChecklist: z.record(z.boolean()).default({}),
  typeSpecificData: z.record(z.any()).default({}),
});

/**
 * State Transition Request Schema
 */
export const permitTransitionActionEnum = z.enum([
  "SUBMIT",
  "APPROVE",
  "REJECT",
  "ACTIVATE",
  "SUSPEND",
  "RESUME",
  "CLOSE",
  "VERIFY_CLOSE",
  "CANCEL",
]);

export const transitionPermitSchema = z.object({
  action: permitTransitionActionEnum,
  comment: z.string().optional(),
  signatureData: z.string().optional(), // base64 canvas data URL
  rejectionReason: z.string().optional(),
  completionNotes: z.string().optional(),
  housekeepingVerified: z.boolean().optional(),
});

/**
 * Extension Request Schema
 */
export const extensionRequestSchema = z.object({
  additionalHours: z.number().int().min(1).max(4, "Extensions are capped at a maximum of 4 hours per request"),
  reason: z.string().min(5, "A clear operational justification for permit extension is required"),
});
