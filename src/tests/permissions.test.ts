import { describe, it, expect } from "vitest";
import { getAvailableActions, assertAuthorized } from "../lib/permissions/rbac";
import { AuthenticatedUser } from "@/types";

describe("Phase 2: RBAC & Permission Invariants", () => {
  const requester: AuthenticatedUser = {
    id: "user-req-1",
    email: "rajesh@opmaint.com",
    name: "Rajesh Kumar",
    role: "REQUESTER",
  };

  const areaOwnerPress: AuthenticatedUser = {
    id: "user-ao-1",
    email: "suresh@opmaint.com",
    name: "Suresh Patel",
    role: "AREA_OWNER",
    assignedAreaId: "area-press",
  };

  const safetyOfficer: AuthenticatedUser = {
    id: "user-so-1",
    email: "ananya@opmaint.com",
    name: "Ananya Sharma",
    role: "SAFETY_OFFICER",
  };

  const permitInPressShop = {
    status: "PENDING_APPROVAL" as const,
    requesterId: "user-req-1",
    areaId: "area-press",
    plannedStartTime: new Date(),
    plannedEndTime: new Date(Date.now() + 36000000),
    approvals: [
      { requiredRole: "AREA_OWNER" as const, status: "PENDING" as const },
      { requiredRole: "SAFETY_OFFICER" as const, status: "PENDING" as const },
    ],
  };

  it("never presents approval actions to the requester who created the permit", () => {
    const actions = getAvailableActions(requester, permitInPressShop);
    expect(actions).not.toContain("APPROVE");
    expect(actions).not.toContain("REJECT");
  });

  it("presents APPROVE and REJECT to the Area Owner for their assigned area", () => {
    const actions = getAvailableActions(areaOwnerPress, permitInPressShop);
    expect(actions).toContain("APPROVE");
    expect(actions).toContain("REJECT");
  });

  it("hides APPROVE and REJECT from an Area Owner when permit is in a different area", () => {
    const permitInPaintShop = {
      ...permitInPressShop,
      areaId: "area-paint",
    };
    const actions = getAvailableActions(areaOwnerPress, permitInPaintShop);
    expect(actions).not.toContain("APPROVE");
    expect(actions).not.toContain("REJECT");
  });

  it("allows Safety Officer to see SUSPEND action on ACTIVE permit", () => {
    const activePermit = {
      ...permitInPressShop,
      status: "ACTIVE" as const,
      approvals: [
        { requiredRole: "AREA_OWNER" as const, status: "APPROVED" as const },
        { requiredRole: "SAFETY_OFFICER" as const, status: "APPROVED" as const },
      ],
    };

    const safetyActions = getAvailableActions(safetyOfficer, activePermit);
    expect(safetyActions).toContain("SUSPEND");

    const requesterActions = getAvailableActions(requester, activePermit);
    expect(requesterActions).not.toContain("SUSPEND");
    expect(requesterActions).toContain("CLOSE");
  });

  it("assertAuthorized strictly throws error if user attempts self-approval via direct invocation", () => {
    expect(() => {
      assertAuthorized(requester, permitInPressShop, "APPROVE");
    }).toThrow("SECURITY INVARIANT VIOLATION");
  });

  it("assertAuthorized throws error if Area Owner attempts cross-area sign-off", () => {
    expect(() => {
      assertAuthorized(areaOwnerPress, { ...permitInPressShop, areaId: "area-paint" }, "APPROVE");
    }).toThrow("FORBIDDEN: Area Owners cannot approve or reject permits outside their assigned plant area");
  });
});
