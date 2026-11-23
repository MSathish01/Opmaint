# Opmaint Permit to Work (PTW) Module — Complete Implementation Blueprint

> **System Target:** Industrial-grade Permit to Work module for Opmaint CMMS  
> **Tech Stack:** react.js 14+ (App Router, TypeScript), Tailwind CSS, shadcn/ui, PostgreSQL (Neon / Supabase), Prisma ORM, Zod, Vitest  
> **Estimated Timeline:** 12–16 Hours across 6 Structured Phases  
> **Compliance & Domain Focus:** High-stakes manufacturing shop floors (Chennai industrial plants, hazardous energy, contractor workflows)

---

## Architecture Overview & Core Design Philosophy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT INTERFACE                                 │
│  - Industrial High-Contrast Dashboard (Active Now, Expiring < 2h Strip)         │
│  - Glove-Friendly Mobile View (≥48px tap targets, high contrast)                │
│  - Adaptive Multi-Step Authoring Form (Dynamic Type Schema Ingestion)          │
│  - Approver Canvas Workbench (Digital Signature Capture & Checklist)            │
│  - Detail & Legal Audit Timeline (Read-only immutable historical stream)       │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │ HTTP REST / Server Actions + Zod Validation
┌─────────────────────────▼───────────────────────────────────────────────────────┐
│                             BACKEND ENGINE LAYER                                │
│  ┌────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────┐ │
│  │ Pure State Machine     │ │ Non-Bypassable RBAC     │ │ Conflict Detection  │ │
│  │ Transition Guard Engine│ │ - Self-Approval Block   │ │ Spatial & Temporal  │ │
│  │ - Strict Time Windows  │ │ - Area Ownership Bounds │ │ Overlap Checker     │ │
│  │ - Multi-Party Approvals│ │ - Role Invariant Checks │ │ (Hot Work + Confined│ │
│  └───────────┬────────────┘ └───────────┬─────────────┘ └──────────┬──────────┘ │
│              └──────────────────────────┼──────────────────────────┘            │
│                                         ▼                                       │
│                       Audit Logger & Auto-Expiry Engine                         │
└─────────────────────────────────────────┬───────────────────────────────────────┘
                                          │ Prisma ORM
┌─────────────────────────────────────────▼───────────────────────────────────────┐
│                             POSTGRESQL DATABASE                                 │
│  - Core `Permit` Table (Shared Universal Properties)                            │
│  - `type_specific_data` JSONB Discriminator (Hot Work, Confined, LOTO, Height)  │
│  - Normalized Relational Tables: `Approvals`, `AuditLogs`, `Plant/Area/Equip`   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase Breakdown Matrix

| Phase | Focus Area | Key Deliverables | Estimated Hours |
|---|---|---|---|
| **Phase 1** | **Foundation & Domain Modeling** | Prisma schema, migrations, polymorphic types, Zod schemas, DB setup | 2.5 hours |
| **Phase 2** | **State Machine & RBAC Engine** | Pure state machine, transition guards, self-approval block, unit tests | 2.5 hours |
| **Phase 3** | **Seed Data & Backend API Layer** | Realistic plant seed script (4 roles, 2 plants, 6 equip, 10 permits), API endpoints | 2.5 hours |
| **Phase 4** | **Core UI & Screen Implementation** | Dashboard with live filters, adaptive form, detail view, approval workbench, closure | 3.5 hours |
| **Phase 5** | **Differentiators & Advanced Safety** | Overlap conflict detection, auto-expiry engine, extension flow, QR code, canvas signatures | 2.5 hours |
| **Phase 6** | **Deployment, Verification & Handover** | Vercel deployment, test pass, README documentation, Loom recording prep | 2.0 hours |

---

## Phase 1: Foundation, Data Modeling & Polymorphic Abstraction

### Goal
Establish a database schema that provides a strict shared permit entity while cleanly isolating type-specific data so that a 5th permit type (e.g., `EXCAVATION`) requires zero schema rewrites.

### Tasks
1. **Initialize Project Infrastructure:**
   - Initialize Next.js 14+ with TypeScript, Tailwind CSS, Lucide icons, and shadcn/ui primitives.
   - Configure path aliases (`@/components`, `@/lib`, `@/types`, `@/server`).
   - Setup PostgreSQL connection string (Neon or Supabase).

2. **Design Prisma Schema (`prisma/schema.prisma`):**
   - **`User` Entity:** `id`, `email`, `passwordHash`, `name`, `role` (`REQUESTER`, `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN`), `assignedAreaId` (nullable, strictly scopes Area Owners).
   - **`Plant`, `Area`, `Equipment` Hierarchy:**
     - `Plant` $\rightarrow$ `Area` (assigned to Area Owner) $\rightarrow$ `Equipment` (specific asset tag, location).
   - **`Permit` Entity (Shared Core):**
     - `id`, `permitNumber` (human-readable format: `PTW-2026-0001`), `permitType` (`HOT_WORK`, `CONFINED_SPACE`, `WORKING_AT_HEIGHT`, `ELECTRICAL_LOTO`).
     - `status` (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `CLOSED`, `CLOSED_VERIFIED`, `CANCELLED`).
     - `requesterId`, `areaId`, `equipmentId`.
     - `contractorName`, `workDescription`.
     - `plannedStartTime`, `plannedEndTime`, `actualStartTime`, `actualEndTime`.
     - `hazardsIdentified` (JSON array of strings).
     - `ppeRequired` (JSON array of strings).
     - `precautionsChecklist` (JSON object containing safety verification flags).
     - `typeSpecificData` (`Json` column containing validated polymorphic payload).
     - `createdAt`, `updatedAt`.
   - **`PermitApproval` Entity:**
     - `id`, `permitId`, `approverId` (nullable initially), `requiredRole` (`AREA_OWNER`, `SAFETY_OFFICER`), `status` (`PENDING`, `APPROVED`, `REJECTED`), `comment`, `signatureData` (base64 PNG string), `decidedAt`.
   - **`AuditLog` Entity (Append-Only):**
     - `id`, `permitId`, `actorId` (nullable for system events), `action` (e.g., `STATE_TRANSITION`, `FIELD_UPDATE`, `SUSPEND`, `RESUME`, `EXTENSION`), `fromState`, `toState`, `diff` (JSON), `comment`, `timestamp`.
   - **`ExtensionRequest` Entity:**
     - `id`, `permitId`, `requestedByUserId`, `additionalHours`, `reason`, `status` (`PENDING`, `APPROVED`, `REJECTED`), `reviewedByUserId`, `reviewedAt`.

3. **Define Polymorphic Zod Schemas (`src/lib/schemas/`):**
   - `corePermitSchema`: Shared validation for base permit fields.
   - `hotWorkSchema`:
     - `hotWorkType`: `'WELDING' | 'GRINDING' | 'CUTTING' | 'SOLDERING'`
     - `fireWatchName`: `string`
     - `extinguisherType`: `'CO2' | 'DCP_POWDER' | 'WATER_FOAM'`
     - `combustiblesClearedRadius`: `number` (minimum 10m validation)
     - `gasReadings`: `{ testTime: string, lelPercent: number, o2Percent: number, testedBy: string }`
   - `confinedSpaceSchema`:
     - `spaceId`: `string`
     - `entryPoint`: `string`
     - `atmosphericTest`: `{ testTime: string, o2Percent: number, lelPercent: number, h2sPpm: number, coPpm: number }`
     - `standbyAttendant`: `string`
     - `rescuePlan`: `string`
     - `ventilationMethod`: `'NATURAL' | 'FORCED_BLOWER' | 'EXHAUST'`
   - `heightSchema`:
     - `heightMetres`: `number`
     - `accessMethod`: `'SCAFFOLD' | 'LADDER' | 'MEWP' | 'ROPE'`
     - `fallArrestEquipment`: `string[]`
     - `anchorPointChecked`: `boolean`
     - `barricadingBelow`: `boolean`
   - `electricalLotoSchema`:
     - `equipmentTag`: `string`
     - `voltageLevel`: `'415V' | '3.3kV' | '6.6kV' | '11kV' | '48V_DC'`
     - `isolationPoints`: `Array<{ location: string, pointType: string }>`
     - `lockNumbers`: `string[]`
     - `tagNumbers`: `string[]`
     - `earthingApplied`: `boolean`
     - `testedDeadBy`: `string`
     - `testedDeadAt`: `string`
   - Composite Discriminated Union:
     ```typescript
     export const permitPayloadSchema = z.discriminatedUnion("permitType", [
       z.object({ permitType: z.literal("HOT_WORK"), data: hotWorkSchema }),
       z.object({ permitType: z.literal("CONFINED_SPACE"), data: confinedSpaceSchema }),
       z.object({ permitType: z.literal("WORKING_AT_HEIGHT"), data: heightSchema }),
       z.object({ permitType: z.literal("ELECTRICAL_LOTO"), data: electricalLotoSchema }),
     ]);
     ```

### Deliverables Checklist (Phase 1)
- [ ] Working Prisma schema with all relations and indices.
- [ ] Database migrated in PostgreSQL.
- [ ] Discriminated union Zod schemas with complete type safety.
- [ ] Extensibility test: verify adding `EXCAVATION` requires zero changes to core tables.

---

## Phase 2: Strict State Machine & Server-Side Security Invariants

### Goal
Implement a pure, standalone state machine and RBAC engine that enforces every safety rule in Node/TypeScript backend logic, ensuring that unauthorized or illegal transitions cannot be executed even if the API is bypassed or hit directly.

### The State Graph
```
           ┌──────────┐
           │  DRAFT   │
           └────┬─────┘
                │ submit
                ▼
      ┌──────────────────┐
      │ PENDING_APPROVAL ├─────── any reject ──────► REJECTED (terminal)
      └─────────┬────────┘
                │ all required approve (Area Owner + Safety Officer)
                ▼
          ┌──────────┐
          │ APPROVED ├─────────── window passes ───► EXPIRED (terminal)
          └─────┬────┘
                │ activate (now >= planned_start && all approved)
                ▼
          ┌──────────┐
    ┌────►│  ACTIVE  ├─────────── window passes ───► EXPIRED (terminal)
    │     └─────┬────┘
 resume         │ suspend (Safety Officer only)
    │           ▼
    │     ┌───────────┐
    └─────┤ SUSPENDED ├────────── window passes ───► EXPIRED (terminal)
          └───────────┘
                │
          close (Requester marks work done)
                ▼
          ┌──────────┐
          │  CLOSED  │
          └─────┬────┘
                │ verify (Safety Officer verifies site clean & safe)
                ▼
      ┌──────────────────┐
      │ CLOSED_VERIFIED  │ (terminal)
      └──────────────────┘

* Note: Any non-terminal state ──cancel──► CANCELLED (terminal)
```

### Tasks
1. **Pure State Machine (`src/lib/state-machine/`):**
   - Define all valid transitions in an explicit transitions map.
   - Guard functions:
     - `canTransition(currentStatus, action, context): { allowed: boolean, reason?: string }`
     - `guardActivation(permit, currentTime)`:
       - Fails if `currentTime < plannedStartTime`.
       - Fails if `currentTime > plannedEndTime`.
       - Fails if any required approval is not `APPROVED`.
     - `guardExpiration(permit, currentTime)`:
       - Automatically evaluates whether a permit has lapsed.

2. **Security & RBAC Enforcement Rules (`src/lib/permissions/`):**
   - **Invariant 1 (Self-Approval Prohibition):**
     $$\text{If } \text{actor.id} == \text{permit.requesterId} \implies \text{THROW 403 Forbidden}$$
     A technician or manager who created the permit can never approve it under any circumstance.
   - **Invariant 2 (Area Ownership Scope):**
     - An `AREA_OWNER` can only sign off on permits whose `areaId` matches `user.assignedAreaId`.
   - **Invariant 3 (Safety Officer Authority):**
     - Only `SAFETY_OFFICER` (and `ADMIN`) can trigger `SUSPEND`, `RESUME`, or `VERIFY_CLOSE`.
   - **Invariant 4 (Requester Action Scope):**
     - Requesters can only `SUBMIT`, `CANCEL` (while draft/pending), or `CLOSE` their own permits.
   - **Invariant 5 (Terminal State Lock):**
     - States `REJECTED`, `EXPIRED`, `CLOSED_VERIFIED`, and `CANCELLED` cannot accept any state transition.

3. **Automated Unit Tests (`src/tests/state-machine.test.ts` & `permissions.test.ts`):**
   - Test: Self-approval attempt throws HTTP 403.
   - Test: Activation before `plannedStartTime` fails.
   - Test: Activation without all approvers signed off fails.
   - Test: Direct API jump from `DRAFT` $\rightarrow$ `ACTIVE` throws HTTP 400.
   - Test: Safety Officer can suspend active permit; requester cannot.
   - Test: Area Owner cannot approve permit outside assigned plant area.

### Deliverables Checklist (Phase 2)
- [ ] Complete state machine transition matrix implemented as pure TypeScript functions.
- [ ] RBAC guard functions covering all 4 roles and invariants.
- [ ] Vitest test suite with $\ge 12$ targeted unit tests passing.

---

## Phase 3: Comprehensive Seed Data & REST API Layer

### Goal
Populate a complete, realistic industrial facility dataset and build the server API endpoints with transaction-safe audit logging.

### Tasks
1. **Develop Industrial Seed Script (`prisma/seed.ts`):**
   - **4 Users (One per role, documented passwords for demo):**
     - `requester@opmaint.com` — Rajesh Kumar (Contractor Supervisor)
     - `areaowner@opmaint.com` — Suresh Patel (Area Owner - Press & Stamping Shop)
     - `safety@opmaint.com` — Ananya Sharma (Lead Safety Officer)
     - `admin@opmaint.com` — Admin User (Plant Head)
   - **2 Plants:**
     - `Plant 01`: Chennai Automotive Assembly Plant (Oragadam)
     - `Plant 02`: Sriperumbudur Heavy Stamping Division
   - **6 Equipment Items:**
     - `EQ-PRS-001`: 500T Hydraulic Blanking Press (Area: Press Shop)
     - `EQ-ROB-004`: Robotic MIG Welding Cell #4 (Area: Body Shop)
     - `EQ-OVEN-002`: Continuous Paint Curing Oven (Area: Paint Line)
     - `EQ-TNK-402`: Solvent Degreasing Tank (Area: Chemical Recovery / Confined Space)
     - `EQ-CRN-012`: 20T Overhead Bay Gantry Crane (Area: Heavy Bay / Working at Height)
     - `EQ-SUB-11K`: Main Substation 11kV Incomer Feeder Panel (Area: Electrical Utility / LOTO)
   - **10 Permits Spanning Every State in the State Machine:**
     1. `DRAFT`: Hot Work on Welding Cell (incomplete gas test).
     2. `PENDING_APPROVAL` (1): Confined Space on Solvent Tank (waiting for Area Owner).
     3. `PENDING_APPROVAL` (2): Height Work on Gantry Crane (Area Owner approved, waiting for Safety Officer).
     4. `APPROVED`: Electrical LOTO on 11kV Panel (waiting for planned shift start time).
     5. `ACTIVE` (1): Hot Work on Hydraulic Press with < 1.5h remaining (triggers "Expiring Soon" alert).
     6. `ACTIVE` (2): Confined space with active entry log and 6 hours remaining.
     7. `SUSPENDED`: Solvent Tank work suspended due to atmospheric H2S gas spike.
     8. `EXPIRED`: Working at height permit that lapsed yesterday without extension.
     9. `CLOSED`: Hot work maintenance marked complete by contractor, awaiting Safety Officer site verification.
     10. `CLOSED_VERIFIED`: Full completed lifecycle with complete audit history and digital signatures.

2. **API Routes Implementation (`src/app/api/permits/`):**
   - `GET /api/permits`: List with search, status filter, type filter, area filter, and `myPendingApprovals=true`.
   - `POST /api/permits`: Create draft or submit permit (Zod-validated).
   - `GET /api/permits/[id]`: Full detail, including approval records and audit timeline.
   - `PATCH /api/permits/[id]/transition`:
     - Payload: `{ action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'ACTIVATE' | 'SUSPEND' | 'RESUME' | 'CLOSE' | 'VERIFY_CLOSE' | 'CANCEL', comment?: string, signatureData?: string }`
     - Executes inside a **Prisma database transaction** (`prisma.$transaction`):
       1. Fetch current permit with lock.
       2. Run state machine & RBAC guards.
       3. Update permit status / approvals.
       4. Append immutable entry to `AuditLog`.

3. **Authentication Mechanism:**
   - Lightweight, cookie-based session / JWT authentication.
   - Included **"1-Click Demo Role Switcher"** in the top navigation bar so reviewers can instantly switch between Rajesh (Requester), Suresh (Area Owner), and Ananya (Safety Officer) without re-typing passwords.

### Deliverables Checklist (Phase 3)
- [ ] `npm run prisma:seed` creates all users, plants, equipment, and 10 state-spanning permits cleanly.
- [ ] Transactional API transitions with guaranteed audit trail insertion.
- [ ] Role switcher working seamlessly for rapid evaluator testing.

---

## Phase 4: Core User Interfaces & Shop-Floor UX

### Goal
Build the 5 required screens with high-contrast, industrial-grade usability suitable for shop-floor technicians wearing gloves and safety officers conducting field audits.

### Screen Specifications

#### 1. Permit List & Live Command Center (`/permits`)
- **Emergency / Active Strip:**
  - Metric tile: **Active Right Now** (count + immediate modal/filter).
  - Metric tile: **Expiring in Next 2 Hours** (warning amber badges with live countdowns).
  - Metric tile: **Awaiting My Signature** (highlighted if logged-in user has pending approvals).
- **Industrial Data Grid:**
  - Columns: Permit #, Type (with icon), Status (color-coded badge), Plant & Area, Equipment, Validity Window, Actions.
  - Interactive Filter Bar: Filter by Status, Permit Type, Area, and Date Range.

#### 2. Adaptive Multi-Step Permit Creator (`/permits/new`)
- **Step 1: Asset & Location Selection:**
  - Cascading dropdowns: Plant $\rightarrow$ Area $\rightarrow$ Equipment tag.
- **Step 2: General Scope & Validity:**
  - Contractor team, description of work, planned start and end datetimes.
- **Step 3: Dynamic Type-Specific Form Component:**
  - Adapts instantly when type is changed:
    - *Hot Work:* Category buttons, fire watch name, extinguisher type selector, clearance radius input, gas test fields.
    - *Confined Space:* Tank/space identifier, entry point, 4-gas test inputs (O₂, LEL, H₂S, CO) with safety threshold indicators, rescue protocol check.
    - *Working at Height:* Height in metres, access equipment checkboxes, anchor point verification toggle.
    - *Electrical LOTO:* Voltage selector, dynamic isolation point rows (Add Lock/Tag number).
- **Step 4: Hazards, Controls & PPE Matrix:**
  - Visual toggle grid for standard PPE (Safety helmet, boots, harness, respirator, face shield).
- **Actions:** "Save Draft" (lenient validation) or "Submit for Approval" (strict Zod validation).

#### 3. Permit Detail View (`/permits/[id]`)
- **Header:** Permit Number, Status Banner, Time Window, Live Expiry Countdown Timer, QR Code button.
- **Contextual Action Bar:**
  - Buttons render strictly according to `canTransition(user.role, permit.status)`:
    - Requester sees: "Close Permit", "Request Extension", "Cancel".
    - Area Owner sees: "Review & Sign", "Reject".
    - Safety Officer sees: "Suspend Work", "Resume Work", "Verify & Close Out".
  - Prohibited actions are never rendered.
- **Tabbed Layout:**
  - *Tab 1: Work Order & Hazards* (Core fields + PPE + Precaution checklist).
  - *Tab 2: Technical & Isolation Specs* (Rendered type-specific data).
  - *Tab 3: Approval Ledger* (Signatures, timestamps, approver badges).
  - *Tab 4: Immutable Audit Trail* (Vertical visual timeline with from-state $\rightarrow$ to-state pills, actor name, timestamp, and comments).

#### 4. Approval View & Canvas Signature Workbench
- Dedicated modal or view triggered from "Review & Sign".
- Safety checklist confirmation (Approver confirms site inspection).
- **HTML5 Canvas Signature Box:** Clear button, smooth stroke capture, converts to base64.
- Mandatory comment input for rejections.

#### 5. Work Handover & Safety Closure View
- **Requester Handover:**
  - Confirmation that work is finished, all contractor personnel have exited, and equipment is ready for inspection.
- **Safety Officer Final Sign-Off:**
  - Housekeeping verification checklist:
    - De-isolation completed (LOTO removed).
    - Fire watch completed 30-minute post-work cool-down.
    - Confined space sealed.
  - Final digital signature and transition to `CLOSED_VERIFIED`.

### Deliverables Checklist (Phase 4)
- [ ] Responsive dashboard with real-time countdown badges.
- [ ] Multi-step form with dynamic type-specific fields.
- [ ] Permission-guarded detail page with no illegal action buttons.
- [ ] Signature canvas component functioning on desktop and touch devices.
- [ ] Closure and verification workflow tested end-to-end.

---

## Phase 5: Differentiators That Separate Good From Average

### Goal
Implement high-value safety and CMMS capabilities that demonstrate genuine manufacturing domain insight.

### Differentiators Plan

#### 1. Spatial-Temporal Conflict Detection Engine
- **Industrial Risk:** Performing hot work (welding/cutting generating sparks) in the same physical line or adjacent to a confined space solvent tank or flammable gas line causes catastrophic explosions.
- **Implementation (`src/lib/conflict-detection.ts`):**
  - When creating or activating a permit, query existing permits where:
    $$\text{status} \in \{\text{APPROVED}, \text{ACTIVE}\} \land \text{areaId} == \text{targetAreaId}$$
    $$\land (\text{plannedStartTime} \le \text{targetEndTime} \land \text{plannedEndTime} \ge \text{targetStartTime})$$
  - If a **Hot Work** permit overlaps in time and area with a **Confined Space** or **Flammable Line** permit:
    - Flag a prominent **Safety Conflict Alert**:
      > **⚠️ SEVERE SAFETY CONFLICT DETECTED**  
      > This Hot Work permit overlaps with active Confined Space permit **#PTW-2026-0002** (Solvent Degreasing Tank) in the same production area. High risk of flammable vapor ignition.
    - Requires explicit acknowledgment and additional safety officer review.

#### 2. Deterministic Auto-Expiry Engine & Countdown
- **Implementation:**
  - Active countdown component on all active permits displaying remaining hours, minutes, seconds.
  - Changes color: Green ($>2\text{h}$) $\rightarrow$ Amber ($\le 2\text{h}$, "Expiring Soon") $\rightarrow$ Red (Expired).
  - Background auto-expiry endpoint `/api/cron/check-expiry`:
    - Executes automatically on client dashboard load or via periodic interval.
    - Lapsed active or approved permits immediately transition to `EXPIRED` with an audit log actor of `SYSTEM_EXPIRY_ENGINE`.
    - Expired permits cannot be reactivated; the UI clearly displays: *"Validity window lapsed. Standard safety protocol requires raising a new permit."*

#### 3. Formal Extension Request Flow
- **Implementation:**
  - While a permit is `ACTIVE` and within 2 hours of expiry, the requester can click "Request Extension".
  - Input: $+1\text{h}$, $+2\text{h}$, or $+4\text{h}$ with mandatory operational justification.
  - Safety rule: Maximum 1 extension allowed per permit to prevent shift fatigue.
  - Creates an `ExtensionRequest` record and alerts the Safety Officer.
  - Once the Safety Officer approves, the `plannedEndTime` is updated, and an audit entry is created.

#### 4. QR Code Generation for Field Inspection
- Real safety officers walk the floor with a tablet or mobile phone.
- Each permit features a **"Field QR Code"** button that generates a standard QR code encoding the direct permit URL (`/permits/[id]`).
- Scanning the QR code displays the current live status, gas readings, and authorization signatures.

#### 5. Mobile-First Shop Floor Optimization
- Ensure touch targets are at least $48 \times 48\text{px}$.
- High-contrast visual cues (dark border styling, prominent status badges).
- Full responsiveness on small viewport widths ($360\text{px}-420\text{px}$).

### Deliverables Checklist (Phase 5)
- [ ] Conflict detection algorithm functioning and warning during creation.
- [ ] Auto-expiry running server-side with audit trail.
- [ ] Extension request flow implemented with safety officer sign-off.
- [ ] QR code generator modal rendered via `qrcode.react`.
- [ ] Mobile-tested interface with large touch targets.

---

## Phase 6: Deployment, Hardening, Documentation & Loom Video

### Goal
Deploy the application to a public production URL, write a clean README, run final test suites, and record the Loom demo.

### Tasks
1. **Cloud Deployment:**
   - Deploy backend and frontend to **Vercel** or **Render**.
   - Host PostgreSQL on **Neon** or **Supabase**.
   - Run production migrations and seed the production database so the live link is populated immediately.
   - Verify all routes, role switching, and API actions on the live production URL.

2. **Repository Hardening & Hygiene:**
   - Verify realistic git commit history (logical atomic commits per phase, no single monolithic commit).
   - Ensure `npm run build` and `npm test` execute with 0 errors and 0 warnings.
   - Ensure clean `.env.example` file is included with clear database setup instructions.

3. **Author README.md:**
   - **Live Link & Demo Credentials Table:**
     | Role | Email | Password | Assigned Scope |
     |---|---|---|---|
     | **Requester** | `requester@opmaint.com` | `opmaint2026` | Contractor Supervisor |
     | **Area Owner** | `areaowner@opmaint.com` | `opmaint2026` | Press & Stamping Shop |
     | **Safety Officer** | `safety@opmaint.com` | `opmaint2026` | Plant-wide Safety & Hot Work |
     | **Admin** | `admin@opmaint.com` | `opmaint2026` | All Plants & Permissions |
   - **Local Setup Guide:** Step-by-step instructions that work out-of-the-box (`npm install`, `npx prisma migrate dev`, `npm run prisma:seed`, `npm run dev`).
   - **Decisions Made Where Spec Was Silent:**
     - How extensions are capped (max 1 extension, max 4 hours).
     - How conflict detection is scoped (same area + overlapping time + incompatible permit types).
     - Why JSONB discriminator was chosen over Class Table Inheritance for polymorphic safety payloads.
   - **What We Knowingly Left Out / Out of Scope:**
     - Websockets (used client polling/revalidation instead).
     - File storage (used URL strings).
   - **What We Would Build Next:**
     - Integration with physical IoT gas monitors (e.g., Honeywell / Draeger sensors pushing live ppm readings directly to the permit).
     - RFID/NFC badge tap for LOTO verification at the electrical feeder panel.
   - **AI Usage Disclosure:** Honest description of how LLMs were used (accelerating boilerplate and test generation) and how design decisions were verified.

4. **Loom Video Demo Walkthrough Script (6–8 Minutes):**
   - **Min 0:00 – 1:15 (Shop Floor & CMMS Context):**
     - Show camera on, introduce self.
     - Mention reviewing opmaint.com and understanding how PTW operates in Chennai manufacturing plants with contractors, LOTO, and hazardous energy.
   - **Min 1:15 – 3:30 (Live Workflow Demonstration):**
     - Log in as Rajesh (Requester) $\rightarrow$ Create a Hot Work permit.
     - Show the **Conflict Detection** warning popping up when overlapping with a Confined Space work order.
     - Switch to Suresh (Area Owner) $\rightarrow$ Demonstrate that Suresh cannot approve permits in areas he does not own. Sign with canvas digital signature.
     - Switch to Ananya (Safety Officer) $\rightarrow$ Approve permit. Show self-approval prohibition if she tries to approve her own request.
     - Activate permit $\rightarrow$ Show the **Live Expiry Countdown** and "Expiring Soon" status.
     - Show the Field **QR Code** for site inspection.
     - Demonstrate Work Closure and Safety Officer Verification.
   - **Min 3:30 – 5:00 (Code Walkthrough — "Part I'm Proud Of"):**
     - Open the codebase to `src/lib/state-machine/` and `src/lib/schemas/`.
     - Explain the polymorphic data model and how an `EXCAVATION` or `RADIATION` permit can be added without altering database tables.
     - Walk through the pure state transition guards and transactional audit log generator.
   - **Min 5:00 – 6:15 (Code Walkthrough — "Part I'd Rewrite"):**
     - Candidly discuss an architectural trade-off: currently, auto-expiry runs via scheduled checks and client revalidation. In an enterprise system with 5,000 daily permits, explain how you would replace this with an event-driven distributed queue (like BullMQ / Redis or Temporal) with delayed tasks for exact-second invalidation.
   - **Min 6:15 – 7:00 (Conclusion):**
     - Express enthusiasm for shop-floor plant visits and thank Tanzeel and the Opmaint team.

---

## Submission Checklist

- [ ] **GitHub Repository:** Public, or private with `tanzeel@opmaint.com` invited.
- [ ] **Commit History:** Meaningful, incremental commits across all 6 phases.
- [ ] **Live Deployed Link:** Vercel/Render URL running live and pre-seeded.
- [ ] **Loom Video:** 6–8 minutes, camera on, covering demo, proud-of code, and rewrite-target code.
- [ ] **Email Prepared:** Sent to `tanzeel@opmaint.com` with subject `Web Dev Intern Assignment — <Your Name>`.
