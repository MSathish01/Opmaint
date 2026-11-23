import { PermitStatus, UserRole, PermitFull, AuthenticatedUser } from "@/types";
import { ALLOWED_TRANSITIONS, TransitionAction } from "../state-machine/transitions";

export interface PermissionCheckResult {
  canPerform: boolean;
  reason?: string;
}

/**
 * Returns the exact list of transition actions available to the current user
 * for a specific permit, given the user's role, identity, and the permit's state.
 * "A user should never see a button they aren't allowed to press."
 */
export function getAvailableActions(
  user: AuthenticatedUser,
  permit: {
    status: PermitStatus;
    requesterId: string;
    areaId: string;
    plannedStartTime: Date | string;
    plannedEndTime: Date | string;
    approvals?: Array<{
      requiredRole: "AREA_OWNER" | "SAFETY_OFFICER";
      status: "PENDING" | "APPROVED" | "REJECTED";
      approverId?: string | null;
    }>;
  }
): TransitionAction[] {
  const allowedForState = ALLOWED_TRANSITIONS[permit.status] || [];
  const actions: TransitionAction[] = [];

  const isRequester = user.id === permit.requesterId;
  const isSafetyOfficer = user.role === "SAFETY_OFFICER";
  const isAdmin = user.role === "ADMIN";
  const isAreaOwner = user.role === "AREA_OWNER";
  const ownsArea = !user.assignedAreaId || user.assignedAreaId === permit.areaId;

  for (const action of allowedForState) {
    switch (action) {
      case "SUBMIT":
        if ((isRequester || isAdmin) && permit.status === "DRAFT") {
          actions.push(action);
        }
        break;

      case "APPROVE":
      case "REJECT":
        // Non-negotiable invariant: A person cannot approve/reject their own permit!
        if (isRequester) {
          break;
        }

        if (isAdmin) {
          actions.push(action);
          break;
        }

        if (isAreaOwner && ownsArea) {
          const areaApproval = permit.approvals?.find((a) => a.requiredRole === "AREA_OWNER");
          if (!areaApproval || areaApproval.status === "PENDING") {
            actions.push(action);
          }
        }

        if (isSafetyOfficer) {
          const safetyApproval = permit.approvals?.find((a) => a.requiredRole === "SAFETY_OFFICER");
          if (!safetyApproval || safetyApproval.status === "PENDING") {
            actions.push(action);
          }
        }
        break;

      case "ACTIVATE":
        // Requesters, Area Owners, Safety Officers, or Admins can activate once all approvals exist and time is met
        const allApproved = permit.approvals?.every((a) => a.status === "APPROVED") ?? true;
        if (allApproved && (isRequester || isAreaOwner || isSafetyOfficer || isAdmin)) {
          actions.push(action);
        }
        break;

      case "SUSPEND":
        if (isSafetyOfficer || isAdmin) {
          actions.push(action);
        }
        break;

      case "RESUME":
        if (isSafetyOfficer || isAdmin) {
          actions.push(action);
        }
        break;

      case "CLOSE":
        if (isRequester || isAdmin) {
          actions.push(action);
        }
        break;

      case "VERIFY_CLOSE":
        if (!isRequester && (isSafetyOfficer || isAdmin)) {
          actions.push(action);
        }
        break;

      case "CANCEL":
        if (isRequester || isAdmin) {
          actions.push(action);
        }
        break;

      default:
        break;
    }
  }

  return actions;
}

/**
 * Asserts whether a user is authorized to perform an action.
 * Throws a descriptive error if disallowed.
 */
export function assertAuthorized(
  user: AuthenticatedUser,
  permit: {
    status: PermitStatus;
    requesterId: string;
    areaId: string;
  },
  action: TransitionAction
): void {
  // 1. Self-approval block
  if (user.id === permit.requesterId && (action === "APPROVE" || action === "REJECT" || action === "VERIFY_CLOSE")) {
    throw new Error("SECURITY INVARIANT VIOLATION: A user cannot approve, reject, or verify their own permit.");
  }

  // 2. Area Owner scope check
  if (user.role === "AREA_OWNER" && (action === "APPROVE" || action === "REJECT")) {
    if (user.assignedAreaId && user.assignedAreaId !== permit.areaId) {
      throw new Error("FORBIDDEN: Area Owners cannot approve or reject permits outside their assigned plant area.");
    }
  }

  // 3. Safety Officer privileges
  if ((action === "SUSPEND" || action === "RESUME" || action === "VERIFY_CLOSE") && user.role !== "SAFETY_OFFICER" && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN: Only Safety Officers or Administrators can perform this action.");
  }

  // 4. Requester operations
  if (action === "CLOSE" && user.id !== permit.requesterId && user.role !== "ADMIN") {
    throw new Error("FORBIDDEN: Only the permit requester or an administrator can close this permit.");
  }
}
