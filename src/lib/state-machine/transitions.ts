import { PermitStatus, UserRole, ApprovalStatus } from "@/types";

export type TransitionAction =
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "ACTIVATE"
  | "SUSPEND"
  | "RESUME"
  | "CLOSE"
  | "VERIFY_CLOSE"
  | "CANCEL"
  | "EXPIRE";

export interface TransitionContext {
  actor: {
    id: string;
    role: UserRole;
    assignedAreaId?: string | null;
  };
  now?: Date;
  comment?: string;
  signatureData?: string;
  rejectionReason?: string;
  completionNotes?: string;
  housekeepingVerified?: boolean;
}

export interface StateMachinePermitInput {
  id: string;
  permitNumber: string;
  status: PermitStatus;
  requesterId: string;
  areaId: string;
  plannedStartTime: Date | string;
  plannedEndTime: Date | string;
  approvals: Array<{
    id: string;
    requiredRole: "AREA_OWNER" | "SAFETY_OFFICER";
    status: ApprovalStatus;
    approverId?: string | null;
  }>;
}

export interface TransitionValidationResult {
  allowed: boolean;
  nextStatus?: PermitStatus;
  error?: string;
  errorCode?: "INVALID_TRANSITION" | "FORBIDDEN" | "TIME_VIOLATION" | "APPROVALS_INCOMPLETE" | "VALIDATION_FAILED";
}

/**
 * Valid state transitions mapping
 */
export const ALLOWED_TRANSITIONS: Record<PermitStatus, TransitionAction[]> = {
  DRAFT: ["SUBMIT", "CANCEL"],
  PENDING_APPROVAL: ["APPROVE", "REJECT", "CANCEL"],
  APPROVED: ["ACTIVATE", "EXPIRE", "CANCEL"],
  ACTIVE: ["SUSPEND", "CLOSE", "EXPIRE"],
  SUSPENDED: ["RESUME", "EXPIRE", "CANCEL"],
  CLOSED: ["VERIFY_CLOSE"],
  // Terminal states cannot transition to anything
  CLOSED_VERIFIED: [],
  EXPIRED: [],
  REJECTED: [],
  CANCELLED: [],
};

/**
 * Validates whether a state transition can occur based on current state, rules, and invariants.
 */
export function validateStateTransition(
  permit: StateMachinePermitInput,
  action: TransitionAction,
  context: TransitionContext
): TransitionValidationResult {
  const currentStatus = permit.status;
  const now = context.now ? new Date(context.now) : new Date();
  const startTime = new Date(permit.plannedStartTime);
  const endTime = new Date(permit.plannedEndTime);
  const { actor } = context;

  // 1. Check if the action is topologically allowed from current state
  const allowedActions = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowedActions.includes(action)) {
    return {
      allowed: false,
      errorCode: "INVALID_TRANSITION",
      error: `Illegal state transition: Cannot perform '${action}' on a permit with status '${currentStatus}'.`,
    };
  }

  // 2. Handle specific actions and enforce domain rules
  switch (action) {
    case "SUBMIT": {
      // Requesters and Admins can submit drafts
      if (actor.role !== "REQUESTER" && actor.role !== "ADMIN") {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "Only requesters or administrators can submit permits for approval.",
        };
      }
      return { allowed: true, nextStatus: "PENDING_APPROVAL" };
    }

    case "APPROVE": {
      // RULE: Self-Approval Prohibition
      // A person can NEVER approve their own permit, even if role allows it!
      if (actor.id === permit.requesterId) {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "SAFETY VIOLATION: A person can never approve their own permit.",
        };
      }

      // Check role authorization
      if (actor.role !== "AREA_OWNER" && actor.role !== "SAFETY_OFFICER" && actor.role !== "ADMIN") {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "You do not have the required role to approve permits.",
        };
      }

      // Check Area Owner scope constraint
      if (actor.role === "AREA_OWNER" && actor.assignedAreaId && actor.assignedAreaId !== permit.areaId) {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "Area Owners can only approve permits for equipment in their assigned facility area.",
        };
      }

      // Check if all required approvals will be satisfied
      // Required approvals: typically AREA_OWNER and SAFETY_OFFICER
      const remainingApprovals = permit.approvals.filter(
        (app) => app.approverId !== actor.id && app.status !== "APPROVED"
      );

      // If actor fulfills one required approval, check if the other required role is also approved
      const otherApprovalsApproved = remainingApprovals.every((app) => {
        // If this remaining approval is for the role the actor is approving, it's satisfied
        if (
          (actor.role === "AREA_OWNER" && app.requiredRole === "AREA_OWNER") ||
          (actor.role === "SAFETY_OFFICER" && app.requiredRole === "SAFETY_OFFICER") ||
          actor.role === "ADMIN"
        ) {
          return true;
        }
        return app.status === "APPROVED";
      });

      // If all approvals are met, moves to APPROVED; otherwise remains PENDING_APPROVAL
      return {
        allowed: true,
        nextStatus: otherApprovalsApproved ? "APPROVED" : "PENDING_APPROVAL",
      };
    }

    case "REJECT": {
      if (actor.id === permit.requesterId) {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "SAFETY VIOLATION: A person cannot act as the approver on their own permit.",
        };
      }

      if (actor.role !== "AREA_OWNER" && actor.role !== "SAFETY_OFFICER" && actor.role !== "ADMIN") {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "Only Area Owners, Safety Officers, or Admins can reject permits.",
        };
      }

      if (!context.rejectionReason && !context.comment) {
        return {
          allowed: false,
          errorCode: "VALIDATION_FAILED",
          error: "A mandatory rejection reason is required to reject a permit.",
        };
      }

      return { allowed: true, nextStatus: "REJECTED" };
    }

    case "ACTIVATE": {
      // Rule 1: A permit cannot go ACTIVE unless every required approver has approved.
      const hasUnapprovedRequirements = permit.approvals.some((app) => app.status !== "APPROVED");
      if (hasUnapprovedRequirements || permit.approvals.length === 0) {
        return {
          allowed: false,
          errorCode: "APPROVALS_INCOMPLETE",
          error: "Cannot activate permit: Every required approver (Area Owner and Safety Officer) must approve first.",
        };
      }

      // Rule 2: A permit cannot go ACTIVE before its planned start time.
      if (now.getTime() < startTime.getTime()) {
        return {
          allowed: false,
          errorCode: "TIME_VIOLATION",
          error: `Cannot activate permit before its planned start time (${startTime.toISOString()}). Current time is ${now.toISOString()}.`,
        };
      }

      // Rule 3: A permit cannot go ACTIVE if it has already passed its validity window.
      if (now.getTime() > endTime.getTime()) {
        return {
          allowed: false,
          errorCode: "TIME_VIOLATION",
          error: "Cannot activate permit: The planned validity window has already expired.",
        };
      }

      return { allowed: true, nextStatus: "ACTIVE" };
    }

    case "SUSPEND": {
      // Only Safety Officer or Admin can suspend an active permit immediately
      if (actor.role !== "SAFETY_OFFICER" && actor.role !== "ADMIN") {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "Only a Safety Officer or Administrator can suspend an active permit.",
        };
      }

      if (!context.comment) {
        return {
          allowed: false,
          errorCode: "VALIDATION_FAILED",
          error: "A suspension reason (e.g. gas alarm, weather change, emergency) is mandatory.",
        };
      }

      return { allowed: true, nextStatus: "SUSPENDED" };
    }

    case "RESUME": {
      // Only Safety Officer or Admin can resume work after re-inspection
      if (actor.role !== "SAFETY_OFFICER" && actor.role !== "ADMIN") {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "Only a Safety Officer or Administrator can resume a suspended permit.",
        };
      }

      if (now.getTime() > endTime.getTime()) {
        return {
          allowed: false,
          errorCode: "TIME_VIOLATION",
          error: "Cannot resume permit: The validity window expired while suspended.",
        };
      }

      return { allowed: true, nextStatus: "ACTIVE" };
    }

    case "CLOSE": {
      // Requester marks work complete
      if (actor.id !== permit.requesterId && actor.role !== "ADMIN") {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "Only the permit requester or an administrator can close out the work.",
        };
      }

      return { allowed: true, nextStatus: "CLOSED" };
    }

    case "VERIFY_CLOSE": {
      // Safety Officer performs closure verification and ensures area is clean
      if (actor.role !== "SAFETY_OFFICER" && actor.role !== "ADMIN") {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "Only a Safety Officer can verify permit closure and perform final sign-off.",
        };
      }

      // Invariant: Safety Officer cannot verify closure if they were the requester
      if (actor.id === permit.requesterId) {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "SAFETY VIOLATION: A requester cannot perform safety closure verification on their own permit.",
        };
      }

      if (context.housekeepingVerified !== true) {
        return {
          allowed: false,
          errorCode: "VALIDATION_FAILED",
          error: "Housekeeping and de-isolation verification must be confirmed before final closure.",
        };
      }

      return { allowed: true, nextStatus: "CLOSED_VERIFIED" };
    }

    case "EXPIRE": {
      // Auto-expiration check
      if (now.getTime() <= endTime.getTime()) {
        return {
          allowed: false,
          errorCode: "TIME_VIOLATION",
          error: "Cannot expire permit: Validity window has not yet passed.",
        };
      }
      return { allowed: true, nextStatus: "EXPIRED" };
    }

    case "CANCEL": {
      // Requester or Admin can cancel
      if (actor.id !== permit.requesterId && actor.role !== "ADMIN") {
        return {
          allowed: false,
          errorCode: "FORBIDDEN",
          error: "Only the requester or an administrator can cancel this permit.",
        };
      }
      return { allowed: true, nextStatus: "CANCELLED" };
    }

    default:
      return {
        allowed: false,
        errorCode: "INVALID_TRANSITION",
        error: `Unhandled transition action: ${action}`,
      };
  }
}
