export type UserRole = "REQUESTER" | "AREA_OWNER" | "SAFETY_OFFICER" | "ADMIN";

export type PermitType =
  | "HOT_WORK"
  | "CONFINED_SPACE"
  | "WORKING_AT_HEIGHT"
  | "ELECTRICAL_LOTO"
  | "EXCAVATION";

export type PermitStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ACTIVE"
  | "SUSPENDED"
  | "EXPIRED"
  | "CLOSED"
  | "CLOSED_VERIFIED"
  | "CANCELLED"
  | "REJECTED";

export type ApprovalRole = "AREA_OWNER" | "SAFETY_OFFICER";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ExtensionStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  badgeNumber?: string | null;
  assignedAreaId?: string | null;
}

export interface PlantSummary {
  id: string;
  code: string;
  name: string;
  location: string;
}

export interface AreaSummary {
  id: string;
  code: string;
  name: string;
  plantId: string;
  plant?: PlantSummary;
}

export interface EquipmentSummary {
  id: string;
  tag: string;
  name: string;
  areaId: string;
  area?: AreaSummary;
}

export interface PermitApprovalRecord {
  id: string;
  permitId: string;
  requiredRole: ApprovalRole;
  approverId?: string | null;
  approver?: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  } | null;
  status: ApprovalStatus;
  comment?: string | null;
  signatureData?: string | null;
  decidedAt?: string | Date | null;
  createdAt: string | Date;
}

export interface AuditLogRecord {
  id: string;
  permitId: string;
  actorId?: string | null;
  actor?: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  } | null;
  action: string;
  fromState?: string | null;
  toState?: string | null;
  diff?: any;
  comment?: string | null;
  timestamp: string | Date;
}

export interface ExtensionRequestRecord {
  id: string;
  permitId: string;
  requestedById: string;
  requestedBy: {
    id: string;
    name: string;
    email: string;
  };
  additionalHours: number;
  reason: string;
  status: ExtensionStatus;
  reviewedById?: string | null;
  reviewedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  reviewedAt?: string | Date | null;
  createdAt: string | Date;
}

export interface PermitFull {
  id: string;
  permitNumber: string;
  permitType: PermitType;
  status: PermitStatus;
  requesterId: string;
  requester: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  areaId: string;
  area: AreaSummary & { plant: PlantSummary };
  equipmentId: string;
  equipment: EquipmentSummary;
  contractorName: string;
  workDescription: string;
  plannedStartTime: string | Date;
  plannedEndTime: string | Date;
  actualStartTime?: string | Date | null;
  actualEndTime?: string | Date | null;
  hazardsIdentified: string[];
  ppeRequired: string[];
  precautionsChecklist: Record<string, boolean>;
  typeSpecificData: any;
  completionNotes?: string | null;
  housekeepingVerified: boolean;
  closureVerifiedAt?: string | Date | null;
  approvals: PermitApprovalRecord[];
  auditLogs: AuditLogRecord[];
  extensionRequests: ExtensionRequestRecord[];
  createdAt: string | Date;
  updatedAt: string | Date;
}
