import assert from "node:assert/strict";
import test from "node:test";
import ColorEngine from "../color-engine.module.js";

test("RGB <-> XYZ <-> Lab <-> RGB round-trip precision", () => {
  const testColors = [
    [255, 255, 255], // Pure White
    [0, 0, 0],       // Pure Black
    [128, 128, 128], // Mid Gray
    [255, 0, 0],     // Red
    [0, 255, 0],     // Green
    [0, 0, 255],     // Blue
    [210, 180, 140], // Tan / Beige (Interior)
    [139, 69, 19],   // Saddle Brown (Wood)
    [47, 79, 79],    // Dark Slate Gray (Cabinetry)
    [245, 245, 220], // Beige wall
    [24, 43, 73]     // Navy furniture
  ];

  for (const [r, g, b] of testColors) {
    const lab = ColorEngine.rgbToLab(r, g, b);
    assert.ok(Number.isFinite(lab[0]), `L is finite for [${r},${g},${b}]`);
    assert.ok(Number.isFinite(lab[1]), `a is finite for [${r},${g},${b}]`);
    assert.ok(Number.isFinite(lab[2]), `b is finite for [${r},${g},${b}]`);

    const [rOut, gOut, bOut] = ColorEngine.labToRgb(lab[0], lab[1], lab[2]);
    assert.ok(
      Math.abs(r - rOut) <= 1 && Math.abs(g - gOut) <= 1 && Math.abs(b - bOut) <= 1,
      `RGB roundtrip failed for [${r},${g},${b}] -> Got [${rOut},${gOut},${bOut}]`
    );
  }
});

test("Lab <-> LCh <-> Lab round-trip precision", () => {
  const testLabs = [
    [100, 0, 0],
    [0, 0, 0],
    [50, 25, 45],
    [70, -30, 20],
    [35, 10, -45],
    [85, -5, -15]
  ];

  for (const [L, a, b] of testLabs) {
    const [lchL, C, h] = ColorEngine.labToLch(L, a, b);
    assert.ok(lchL >= 0 && lchL <= 100, `L in range [0, 100]`);
    assert.ok(C >= 0, `Chroma >= 0`);
    assert.ok(h >= 0 && h <= 360, `Hue in range [0, 360]`);

    const [labL, labA, labB] = ColorEngine.lchToLab(lchL, C, h);
    assert.ok(Math.abs(L - labL) < 1e-4, `L precision`);
    assert.ok(Math.abs(a - labA) < 1e-4, `a precision`);
    assert.ok(Math.abs(b - labB) < 1e-4, `b precision`);
  }
});

test("Circular hue difference and distance math", () => {
  // Hue delta shortest signed path
  assert.equal(ColorEngine.circularHueDelta(10, 30), 20);
  assert.equal(ColorEngine.circularHueDelta(30, 10), -20);
  assert.equal(ColorEngine.circularHueDelta(10, 350), -20);
  assert.equal(ColorEngine.circularHueDelta(350, 10), 20);
  assert.equal(Math.abs(ColorEngine.circularHueDelta(0, 180)), 180);
  assert.equal(Math.abs(ColorEngine.circularHueDelta(180, 0)), 180);

  // Circular distance
  assert.equal(ColorEngine.circularDistance(10, 350), 20);
  assert.equal(ColorEngine.circularDistance(350, 10), 20);
  assert.equal(ColorEngine.circularDistance(0, 180), 180);
  assert.equal(ColorEngine.circularDistance(45, 90), 45);
});

test("CIEDE2000 (ΔE00) perceptual calculation against known pairs", () => {
  // Same color must have ΔE = 0
  const dE0 = ColorEngine.deltaE2000([50, 2.6772, -79.7751], [50, 2.6772, -79.7751]);
  assert.ok(Math.abs(dE0) < 1e-5, `Identical colors should have ΔE=0`);

  // Standard Sharma & Bala CIE test pair 1
  // [50, 2.6772, -79.7751] vs [50, 0, -82.7485] -> expected ΔE ≈ 2.0425
  const dE1 = ColorEngine.deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]);
  assert.ok(Math.abs(dE1 - 2.0425) < 0.005, `Sharma pair 1 expected ~2.0425, got ${dE1}`);

  // Standard CIE test pair 2
  // [50, 3.1571, -77.2803] vs [50, 0, -82.7485] -> expected ΔE ≈ 2.8615
  const dE2 = ColorEngine.deltaE2000([50, 3.1571, -77.2803], [50, 0, -82.7485]);
  assert.ok(Math.abs(dE2 - 2.8615) < 0.005, `Sharma pair 2 expected ~2.8615, got ${dE2}`);
});

test("Fast SSIM structural similarity", () => {
  const w = 32;
  const h = 32;
  const size = w * h * 4;

  const dataA = new Uint8ClampedArray(size);
  const dataB = new Uint8ClampedArray(size);

  // Generate checkerboard / gradient image
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const v = Math.round((x / w) * 200 + (y / h) * 55);
      dataA[idx] = v;
      dataA[idx + 1] = v;
      dataA[idx + 2] = v;
      dataA[idx + 3] = 255;

      dataB[idx] = v;
      dataB[idx + 1] = v;
      dataB[idx + 2] = v;
      dataB[idx + 3] = 255;
    }
  }

  const ssimIdentical = ColorEngine.computeFastSSIM({ data: dataA }, { data: dataB }, w, h, 2);
  assert.ok(Math.abs(ssimIdentical - 1.0) < 0.01, `SSIM of identical images should be 1.0, got ${ssimIdentical}`);

  // Slightly perturb dataB
  for (let i = 0; i < size; i += 4) {
    dataB[i] = Math.min(255, dataB[i] + 15);
  }
  const ssimPerturbed = ColorEngine.computeFastSSIM({ data: dataA }, { data: dataB }, w, h, 2);
  assert.ok(ssimPerturbed > 0.85 && ssimPerturbed < 1.0, `Perturbed SSIM should be in [0.85, 1.0), got ${ssimPerturbed}`);
});

test("Edge map & edge safety bounds", () => {
  const w = 20;
  const h = 20;
  const d = new Uint8ClampedArray(w * h * 4);

  // Top half white, bottom half black (sharp horizontal edge at y=10)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const val = y < 10 ? 255 : 0;
      d[idx] = val;
      d[idx + 1] = val;
      d[idx + 2] = val;
      d[idx + 3] = 255;
    }
  }

  const edges = ColorEngine.computeEdgeMap({ data: d }, w, h);
  const safety = ColorEngine.computeEdgeSafetyMap(edges, w, h);

  // Smooth regions away from edge should have safety ≈ 1.0
  assert.ok(safety[2 * w + 10] > 0.95, `Flat region safety should be close to 1.0`);
  assert.ok(safety[18 * w + 10] > 0.95, `Flat region safety should be close to 1.0`);

  // Region right along edge at y=9, y=10 should have low safety
  assert.ok(safety[9 * w + 10] < 0.5, `Edge region should have low safety to protect boundaries`);
  assert.ok(safety[10 * w + 10] < 0.5, `Edge region should have low safety to protect boundaries`);
});

test("Material & ROI classification and profile extraction", () => {
  const w = 40;
  const h = 40;
  const d = new Uint8ClampedArray(w * h * 4);

  // Synthesize interior scene:
  // Top: Wall (beige, ny < 0.45)
  // Mid: Wood Cabinetry (ny 0.45 - 0.75, warm wood)
  // Bottom: Floor (ny > 0.75, darker wood floor)
  for (let y = 0; y < h; y++) {
    const ny = y / h;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (ny < 0.45) {
        // Neutral Wall
        d[idx] = 240;
        d[idx + 1] = 238;
        d[idx + 2] = 230;
      } else if (ny < 0.75) {
        // Warm Wood Cabinetry
        d[idx] = 185;
        d[idx + 1] = 125;
        d[idx + 2] = 75;
      } else {
        // Floor
        d[idx] = 135;
        d[idx + 1] = 85;
        d[idx + 2] = 45;
      }
      d[idx + 3] = 255;
    }
  }

  const result = ColorEngine.extractMaterialProfiles({ data: d }, w, h);
  assert.ok(result.profiles.wall.present, "Wall should be detected");
  assert.ok(result.profiles.wood.present || result.profiles.cabinetry.present, "Wood/Cabinetry should be detected");
  assert.ok(result.profiles.floor.present, "Floor should be detected");
  assert.ok(result.featherRadius >= 5 && result.featherRadius <= 15, "Feather radius is resolution-aware");
});

test("Multi-reference material aggregation", () => {
  const ref1 = {
    materialProfiles: {
      cabinetry: {
        key: 'cabinetry',
        present: true,
        confidence: 0.85,
        share: 0.35,
        medianL: 60,
        medianC: 22,
        medianH: 45,
        meanLab: [60, 10, 20],
        pL: [45, 60, 75],
        pC: [12, 22, 30]
      }
    }
  };

  const ref2 = {
    materialProfiles: {
      cabinetry: {
        key: 'cabinetry',
        present: true,
        confidence: 0.90,
        share: 0.40,
        medianL: 64,
        medianC: 24,
        medianH: 49,
        meanLab: [64, 11, 21],
        pL: [48, 64, 78],
        pC: [14, 24, 32]
      }
    }
  };

  const aggregated = ColorEngine.aggregateMaterialProfiles([ref1, ref2]);
  assert.ok(aggregated.cabinetry.present, "Aggregated cabinetry is present");
  assert.equal(aggregated.cabinetry.medianL, 62, "Median L is aggregated correctly");
  assert.equal(aggregated.cabinetry.medianC, 23, "Median C is aggregated correctly");
  assert.ok(Math.abs(aggregated.cabinetry.medianH - 47) <= 1, "Median H is aggregated correctly");
});

test("Illumination estimation and correction", () => {
  const w = 30;
  const h = 30;
  const d = new Uint8ClampedArray(w * h * 4);

  // Fill with slightly cool daylight ambient cast on neutral wall
  for (let i = 0; i < w * h * 4; i += 4) {
    d[i] = 200;
    d[i + 1] = 210;
    d[i + 2] = 230; // Cool bluish daylight
    d[i + 3] = 255;
  }

  const field = ColorEngine.estimateIlluminationField({ data: d }, w, h);
  assert.equal(field.length, 9, "Field has 9 grid points");
  assert.ok(field[4].blueCast > 0, "Cool ambient cast is detected");

  const illum = ColorEngine.interpolateIllumination(field, 0.5, 0.5);
  assert.ok(Number.isFinite(illum.b), "Interpolated illumination is finite");

  const [rOut, gOut, bOut] = ColorEngine.applyIlluminationCorrection(200, 210, 230, illum, { illumination: 0.7 });
  // After correction, blue cast should be gently neutralized
  assert.ok(bOut <= 230, "Blue spill was neutralized gently");
});
