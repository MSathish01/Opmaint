import { describe, it, expect } from "vitest";
import {
  validateTypeSpecificData,
  hotWorkDataSchema,
  confinedSpaceDataSchema,
  workingAtHeightDataSchema,
  electricalLotoDataSchema,
  excavationDataSchema,
} from "../lib/schemas/permit-types";

describe("Phase 1: Polymorphic Permit Data Model", () => {
  it("successfully validates Hot Work payload with gas readings and fire watch", () => {
    const validHotWork = {
      hotWorkType: "WELDING",
      fireWatchName: "Ramesh Kannan",
      fireExtinguisherType: "CO2",
      combustiblesClearedRadiusMetres: 12,
      continuousSparkContainment: true,
      gasTest: {
        testTime: "2026-11-23T08:30:00Z",
        lelPercent: 0,
        o2Percent: 20.9,
        testedBy: "Ananya Sharma (Safety Officer)",
      },
    };

    const result = validateTypeSpecificData("HOT_WORK", validHotWork);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hotWorkType).toBe("WELDING");
      expect(result.data.gasTest.o2Percent).toBe(20.9);
    }
  });

  it("fails Hot Work validation if combustibles radius is under 10m", () => {
    const invalidHotWork = {
      hotWorkType: "GRINDING",
      fireWatchName: "Ramesh",
      fireExtinguisherType: "CO2",
      combustiblesClearedRadiusMetres: 5, // Below safety requirement of 10m!
      gasTest: {
        testTime: "2026-11-23T08:30:00Z",
        lelPercent: 0,
        o2Percent: 20.9,
        testedBy: "Ananya Sharma",
      },
    };

    const result = validateTypeSpecificData("HOT_WORK", invalidHotWork);
    expect(result.success).toBe(false);
  });

  it("successfully validates Confined Space Entry with 4-gas test parameters", () => {
    const validConfined = {
      spaceId: "TANK-TK-402",
      entryPoint: "Manhole North 24-inch",
      standbyAttendantName: "Karthik Raja",
      rescuePlanAvailable: true,
      ventilationMethod: "FORCED_AIR_BLOWER",
      atmosphericTest: {
        testTime: "2026-11-23T09:00:00Z",
        o2Percent: 20.8,
        lelPercent: 0,
        h2sPpm: 2,
        coPpm: 5,
        testedBy: "Ananya Sharma",
      },
      entryExitLog: [
        { workerName: "Senthil Kumar", timeIn: "09:15" },
      ],
    };

    const result = validateTypeSpecificData("CONFINED_SPACE", validConfined);
    expect(result.success).toBe(true);
  });

  it("rejects Confined Space Entry if rescue plan is not confirmed", () => {
    const unsafeConfined = {
      spaceId: "TANK-TK-402",
      entryPoint: "Manhole North",
      standbyAttendantName: "Karthik",
      rescuePlanAvailable: false, // Critical failure
      ventilationMethod: "FORCED_AIR_BLOWER",
      atmosphericTest: {
        testTime: "09:00",
        o2Percent: 20.8,
        lelPercent: 0,
        h2sPpm: 0,
        coPpm: 0,
        testedBy: "Ananya",
      },
    };

    const result = validateTypeSpecificData("CONFINED_SPACE", unsafeConfined);
    expect(result.success).toBe(false);
  });

  it("successfully validates Electrical LOTO with multi-point lock and tag numbers", () => {
    const validLoto = {
      equipmentTag: "EQ-SUB-11K",
      voltageLevel: "11KV",
      isolationPoints: [
        {
          pointTag: "MCC-FEEDER-01",
          isolationType: "BREAKER",
          locked: true,
          tagged: true,
        },
      ],
      lockNumbers: ["LK-8831", "LK-8832"],
      tagNumbers: ["TAG-RED-1044"],
      earthingApplied: true,
      testedDeadBy: "Murugan (Licensed Electrical Supervisor)",
      testedDeadTime: "2026-11-23T07:45:00Z",
      multiLockHaspUsed: true,
    };

    const result = validateTypeSpecificData("ELECTRICAL_LOTO", validLoto);
    expect(result.success).toBe(true);
  });

  it("successfully validates Working at Height with fall arrest and drop-zone barricading", () => {
    const validHeight = {
      heightMetres: 8.5,
      accessMethod: "MEWP",
      fallArrestEquipment: ["Full Body Harness with Shock-Absorbing Lanyard", "Safety Helmet with Chin Strap"],
      anchorPointChecked: true,
      barricadingBelow: true,
      weatherConditionsChecked: true,
    };

    const result = validateTypeSpecificData("WORKING_AT_HEIGHT", validHeight);
    expect(result.success).toBe(true);
  });

  it("demonstrates extensibility: 5th permit type (EXCAVATION) validates seamlessly without core schema rewrite", () => {
    const validExcavation = {
      excavationDepthMetres: 2.4,
      undergroundUtilitiesSurveyDone: true,
      shoringOrBatteringRequired: true,
      gasTestRequired: false,
      competentPersonName: "Deepak Verma",
    };

    const result = validateTypeSpecificData("EXCAVATION", validExcavation);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.excavationDepthMetres).toBe(2.4);
    }
  });
});
