import { describe, it, expect } from "vitest";
import { validateStateTransition, StateMachinePermitInput } from "../lib/state-machine/transitions";

describe("Phase 2: State Machine Transition Engine", () => {
  const basePermit: StateMachinePermitInput = {
    id: "permit-001",
    permitNumber: "PTW-2026-0001",
    status: "DRAFT",
    requesterId: "user-requester-1",
    areaId: "area-press-shop",
    plannedStartTime: new Date(Date.now() - 3600000), // 1 hour ago
    plannedEndTime: new Date(Date.now() + 7200000), // 2 hours from now
    approvals: [
      { id: "app-1", requiredRole: "AREA_OWNER", status: "PENDING" },
      { id: "app-2", requiredRole: "SAFETY_OFFICER", status: "PENDING" },
    ],
  };

  it("allows Requester to submit a DRAFT permit to PENDING_APPROVAL", () => {
    const result = validateStateTransition(basePermit, "SUBMIT", {
      actor: { id: "user-requester-1", role: "REQUESTER" },
    });
    expect(result.allowed).toBe(true);
    expect(result.nextStatus).toBe("PENDING_APPROVAL");
  });

  it("blocks illegal transition jump: DRAFT directly to ACTIVE", () => {
    const result = validateStateTransition(basePermit, "ACTIVATE", {
      actor: { id: "user-requester-1", role: "REQUESTER" },
    });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("INVALID_TRANSITION");
  });

  it("blocks self-approval: Requester attempting to approve their own permit", () => {
    const pendingPermit: StateMachinePermitInput = {
      ...basePermit,
      status: "PENDING_APPROVAL",
    };

    const result = validateStateTransition(pendingPermit, "APPROVE", {
      actor: { id: "user-requester-1", role: "AREA_OWNER" }, // even if they have an approval role!
    });

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("FORBIDDEN");
    expect(result.error).toContain("A person can never approve their own permit");
  });

  it("blocks Area Owner from approving permit outside their assigned area", () => {
    const pendingPermit: StateMachinePermitInput = {
      ...basePermit,
      status: "PENDING_APPROVAL",
      areaId: "area-paint-shop",
    };

    const result = validateStateTransition(pendingPermit, "APPROVE", {
      actor: { id: "user-area-owner-1", role: "AREA_OWNER", assignedAreaId: "area-press-shop" },
    });

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("FORBIDDEN");
    expect(result.error).toContain("assigned facility area");
  });

  it("keeps permit in PENDING_APPROVAL when only 1 of 2 required approvers signs", () => {
    const pendingPermit: StateMachinePermitInput = {
      ...basePermit,
      status: "PENDING_APPROVAL",
      approvals: [
        { id: "app-1", requiredRole: "AREA_OWNER", status: "PENDING" },
        { id: "app-2", requiredRole: "SAFETY_OFFICER", status: "PENDING" },
      ],
    };

    const result = validateStateTransition(pendingPermit, "APPROVE", {
      actor: { id: "user-area-owner-1", role: "AREA_OWNER", assignedAreaId: "area-press-shop" },
    });

    expect(result.allowed).toBe(true);
    expect(result.nextStatus).toBe("PENDING_APPROVAL"); // Stays pending because Safety Officer hasn't signed
  });

  it("transitions to APPROVED when the final required approver signs", () => {
    const pendingPermit: StateMachinePermitInput = {
      ...basePermit,
      status: "PENDING_APPROVAL",
      approvals: [
        { id: "app-1", requiredRole: "AREA_OWNER", status: "APPROVED", approverId: "user-area-owner-1" },
        { id: "app-2", requiredRole: "SAFETY_OFFICER", status: "PENDING" },
      ],
    };

    const result = validateStateTransition(pendingPermit, "APPROVE", {
      actor: { id: "user-safety-1", role: "SAFETY_OFFICER" },
    });

    expect(result.allowed).toBe(true);
    expect(result.nextStatus).toBe("APPROVED");
  });

  it("blocks activation if any required approval is missing", () => {
    const approvedPermit: StateMachinePermitInput = {
      ...basePermit,
      status: "APPROVED",
      approvals: [
        { id: "app-1", requiredRole: "AREA_OWNER", status: "APPROVED" },
        { id: "app-2", requiredRole: "SAFETY_OFFICER", status: "PENDING" }, // Missing!
      ],
    };

    const result = validateStateTransition(approvedPermit, "ACTIVATE", {
      actor: { id: "user-requester-1", role: "REQUESTER" },
      now: new Date(),
    });

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("APPROVALS_INCOMPLETE");
  });

  it("blocks activation if current time is before planned start time", () => {
    const approvedPermit: StateMachinePermitInput = {
      ...basePermit,
      status: "APPROVED",
      plannedStartTime: new Date(Date.now() + 3600000), // starts in 1 hour
      plannedEndTime: new Date(Date.now() + 18000000),
      approvals: [
        { id: "app-1", requiredRole: "AREA_OWNER", status: "APPROVED" },
        { id: "app-2", requiredRole: "SAFETY_OFFICER", status: "APPROVED" },
      ],
    };

    const result = validateStateTransition(approvedPermit, "ACTIVATE", {
      actor: { id: "user-requester-1", role: "REQUESTER" },
      now: new Date(),
    });

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("TIME_VIOLATION");
    expect(result.error).toContain("before its planned start time");
  });

  it("allows activation when fully approved and within time window", () => {
    const approvedPermit: StateMachinePermitInput = {
      ...basePermit,
      status: "APPROVED",
      plannedStartTime: new Date(Date.now() - 600000), // started 10 mins ago
      plannedEndTime: new Date(Date.now() + 18000000),
      approvals: [
        { id: "app-1", requiredRole: "AREA_OWNER", status: "APPROVED" },
        { id: "app-2", requiredRole: "SAFETY_OFFICER", status: "APPROVED" },
      ],
    };

    const result = validateStateTransition(approvedPermit, "ACTIVATE", {
      actor: { id: "user-requester-1", role: "REQUESTER" },
      now: new Date(),
    });

    expect(result.allowed).toBe(true);
    expect(result.nextStatus).toBe("ACTIVE");
  });

  it("allows Safety Officer to instantly suspend an ACTIVE permit with a reason", () => {
    const activePermit: StateMachinePermitInput = {
      ...basePermit,
      status: "ACTIVE",
    };

    const result = validateStateTransition(activePermit, "SUSPEND", {
      actor: { id: "user-safety-1", role: "SAFETY_OFFICER" },
      comment: "Emergency: Combustible gas detection alarm triggered in adjacent line.",
    });

    expect(result.allowed).toBe(true);
    expect(result.nextStatus).toBe("SUSPENDED");
  });

  it("blocks Requester from suspending a permit", () => {
    const activePermit: StateMachinePermitInput = {
      ...basePermit,
      status: "ACTIVE",
    };

    const result = validateStateTransition(activePermit, "SUSPEND", {
      actor: { id: "user-requester-1", role: "REQUESTER" },
      comment: "Trying to suspend",
    });

    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("FORBIDDEN");
  });

  it("requires housekeeping confirmation for Safety Officer final closure verification", () => {
    const closedPermit: StateMachinePermitInput = {
      ...basePermit,
      status: "CLOSED",
    };

    const unverifiedResult = validateStateTransition(closedPermit, "VERIFY_CLOSE", {
      actor: { id: "user-safety-1", role: "SAFETY_OFFICER" },
      housekeepingVerified: false,
    });
    expect(unverifiedResult.allowed).toBe(false);
    expect(unverifiedResult.errorCode).toBe("VALIDATION_FAILED");

    const verifiedResult = validateStateTransition(closedPermit, "VERIFY_CLOSE", {
      actor: { id: "user-safety-1", role: "SAFETY_OFFICER" },
      housekeepingVerified: true,
    });
    expect(verifiedResult.allowed).toBe(true);
    expect(verifiedResult.nextStatus).toBe("CLOSED_VERIFIED");
  });

  it("blocks any transition on a terminal state like EXPIRED or CLOSED_VERIFIED", () => {
    const expiredPermit: StateMachinePermitInput = {
      ...basePermit,
      status: "EXPIRED",
    };

    const result = validateStateTransition(expiredPermit, "ACTIVATE", {
      actor: { id: "user-safety-1", role: "SAFETY_OFFICER" },
    });
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe("INVALID_TRANSITION");
  });
});
