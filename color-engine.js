/**
 * Colour Match - Perceptual Color Engine & Material-Aware Processing (V6)
 * 
 * Includes:
 * 1. Perceptual Color Space Conversions: sRGB <-> Linear <-> XYZ <-> Lab <-> LCh
 * 2. CIEDE2000 (ΔE00) Perceptual Color Difference
 * 3. Fast In-Browser Structural Similarity (SSIM) & Gradient Preservation
 * 4. Semantic Interior Material & ROI Probabilistic Segmentation & Resolution-Aware Feathering
 * 5. Spatial Illumination Field Estimation & True-Material Protection
 * 6. Edge Safety & Boundary Protection Map
 * 7. LAB / LCh Local Material-Aware Color Transfer
 * 8. Objective Composite Scoring & Bounded Parameter Optimization Loop
 */

// ==========================================
// 1. MATH UTILITIES & COLOR CONVERSIONS
// ==========================================

function clamp(v, min, max) {
  // FIX: Intercept NaN to prevent black box poisoning
  if (Number.isNaN(v)) return min; 
  return v < min ? min : v > max ? max : v;
}

function clamp01(v) {
  // FIX: Intercept NaN to prevent black box poisoning
  if (Number.isNaN(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  // Safe max protects against division by exactly zero
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function circularHueDelta(from, to) {
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return (to - from + 540) % 360 - 180;
}

function circularDistance(a, b) {
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function sRgbToLinear(c) {
  c = clamp01(c);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSRgb(c) {
  c = clamp01(c);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// D65 Standard Illuminant Reference White
const REF_X = 0.95047;
const REF_Y = 1.00000;
const REF_Z = 1.08883;

function rgbToXyz(r, g, b) {
  const lr = sRgbToLinear(r / 255);
  const lg = sRgbToLinear(g / 255);
  const lb = sRgbToLinear(b / 255);

  const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
  const z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb;

  return [x, y, z];
}

function xyzToRgb(x, y, z) {
  const lr = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const lg = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  const lb = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  return [
    clamp(Math.round(linearToSRgb(lr) * 255), 0, 255),
    clamp(Math.round(linearToSRgb(lg) * 255), 0, 255),
    clamp(Math.round(linearToSRgb(lb) * 255), 0, 255)
  ];
}

const LAB_EPSILON = 216 / 24389; // (6/29)^3 ≈ 0.008856
const LAB_KAPPA = 24389 / 27;    // (29/3)^3 ≈ 903.3

function labF(t) {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

function labFInv(t) {
  const t3 = t * t * t;
  return t3 > LAB_EPSILON ? t3 : (116 * t - 16) / LAB_KAPPA;
}

function xyzToLab(x, y, z) {
  const fx = labF(x / REF_X);
  const fy = labF(y / REF_Y);
  const fz = labF(z / REF_Z);

  const L = Math.max(0, 116 * fy - 16);
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);

  return [L, a, b];
}

function labToXyz(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const x = labFInv(fx) * REF_X;
  const y = labFInv(fy) * REF_Y;
  const z = labFInv(fz) * REF_Z;

  return [x, y, z];
}

function rgbToLab(r, g, b) {
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

function labToRgb(L, a, b) {
  const [x, y, z] = labToXyz(L, a, b);
  return xyzToRgb(x, y, z);
}

function labToLch(L, a, b) {
  const C = Math.sqrt(Math.max(0, a * a + b * b)); // FIX: Clamp to >=0 before sqrt
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

function lchToLab(L, C, h) {
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  return [L, a, b];
}

function rgbToLch(r, g, b) {
  const [L, a, bVal] = rgbToLab(r, g, b);
  return labToLch(L, a, bVal);
}

function lchToRgb(L, C, h) {
  const [labL, a, b] = lchToLab(L, C, h);
  return labToRgb(labL, a, b);
}

// ==========================================
// 2. CIEDE2000 (ΔE00) COLOR DIFFERENCE
// ==========================================

function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const avgL = (L1 + L2) / 2;
  const C1 = Math.sqrt(Math.max(0, a1 * a1 + b1 * b1));
  const C2 = Math.sqrt(Math.max(0, a2 * a2 + b2 * b2));
  const avgC = (C1 + C2) / 2;

  const avgC7 = Math.pow(avgC, 7);
  // FIX: clamp domain to positive before Math.sqrt 
  const G = 0.5 * (1 - Math.sqrt(Math.max(0, avgC7 / (avgC7 + 6103515625)))); 

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.sqrt(Math.max(0, a1p * a1p + b1 * b1));
  const C2p = Math.sqrt(Math.max(0, a2p * a2p + b2 * b2));
  const avgCp = (C1p + C2p) / 2;

  let h1p = (Math.atan2(b1, a1p) * 180) / Math.PI;
  if (h1p < 0) h1p += 360;
  let h2p = (Math.atan2(b2, a2p) * 180) / Math.PI;
  if (h2p < 0) h2p += 360;

  let avghp;
  if (Math.abs(h1p - h2p) > 180) {
    avghp = (h1p + h2p + 360) / 2;
  } else {
    avghp = (h1p + h2p) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(((avghp - 30) * Math.PI) / 180) +
    0.24 * Math.cos(((2 * avghp) * Math.PI) / 180) +
    0.32 * Math.cos(((3 * avghp + 6) * Math.PI) / 180) -
    0.20 * Math.cos(((4 * avghp - 63) * Math.PI) / 180);

  let deltahp;
  if (Math.abs(h2p - h1p) <= 180) {
    deltahp = h2p - h1p;
  } else if (h2p <= h1p) {
    deltahp = h2p - h1p + 360;
  } else {
    deltahp = h2p - h1p - 360;
  }

  const deltaLp = L2 - L1;
  const deltaCp = C2p - C1p;
  // FIX: clamp domain to positive before Math.sqrt 
  const deltaHp = 2 * Math.sqrt(Math.max(0, C1p * C2p)) * Math.sin(((deltahp / 2) * Math.PI) / 180);

  const avgLMinus50Sq = (avgL - 50) * (avgL - 50);
  const SL = 1 + (0.015 * avgLMinus50Sq) / Math.sqrt(Math.max(1e-6, 20 + avgLMinus50Sq)); // Safe eps
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;

  const deltaTheta = 30 * Math.exp(-Math.pow((avghp - 275) / 25, 2));
  const avgCp7 = Math.pow(avgCp, 7);
  const RC = 2 * Math.sqrt(Math.max(0, avgCp7 / (avgCp7 + 6103515625)));
  const RT = -Math.sin(((2 * deltaTheta) * Math.PI) / 180) * RC;

  const dL = deltaLp / Math.max(1e-6, SL);
  const dC = deltaCp / Math.max(1e-6, SC);
  const dH = deltaHp / Math.max(1e-6, SH);

  return Math.sqrt(Math.max(0, dL * dL + dC * dC + dH * dH + RT * dC * dH));
}

// ==========================================
// 3. FAST SSIM & GRADIENT PRESERVATION
// ==========================================

function computeFastSSIM(imgDataA, imgDataB, w, h, step = 4) {
  const dA = imgDataA.data;
  const dB = imgDataB.data;
  const c1 = 0.0001; // (0.01)^2
  const c2 = 0.0009; // (0.03)^2

  let sumSSIM = 0;
  let count = 0;
  const blockSize = 8;

  for (let y = 0; y < h - blockSize; y += step * 2) {
    for (let x = 0; x < w - blockSize; x += step * 2) {
      let meanA = 0;
      let meanB = 0;
      let n = 0;

      for (let dy = 0; dy < blockSize; dy += 2) {
        for (let dx = 0; dx < blockSize; dx += 2) {
          const idx = ((y + dy) * w + (x + dx)) * 4;
          const lumA = (0.2126 * dA[idx] + 0.7152 * dA[idx + 1] + 0.0722 * dA[idx + 2]) / 255;
          const lumB = (0.2126 * dB[idx] + 0.7152 * dB[idx + 1] + 0.0722 * dB[idx + 2]) / 255;
          meanA += lumA;
          meanB += lumB;
          n++;
        }
      }
      if (n === 0) continue;
      meanA /= n;
      meanB /= n;

      let varA = 0;
      let varB = 0;
      let covAB = 0;

      for (let dy = 0; dy < blockSize; dy += 2) {
        for (let dx = 0; dx < blockSize; dx += 2) {
          const idx = ((y + dy) * w + (x + dx)) * 4;
          const lumA = (0.2126 * dA[idx] + 0.7152 * dA[idx + 1] + 0.0722 * dA[idx + 2]) / 255;
          const lumB = (0.2126 * dB[idx] + 0.7152 * dB[idx + 1] + 0.0722 * dB[idx + 2]) / 255;
          const diffA = lumA - meanA;
          const diffB = lumB - meanB;
          varA += diffA * diffA;
          varB += diffB * diffB;
          covAB += diffA * diffB;
        }
      }
      varA /= n;
      varB /= n;
      covAB /= n;

      const num = (2 * meanA * meanB + c1) * (2 * covAB + c2);
      const den = (meanA * meanA + meanB * meanB + c1) * (varA + varB + c2);
      const ssim = den > 0 ? num / den : 1;
      sumSSIM += clamp01(ssim);
      count++;
    }
  }
  return count ? sumSSIM / count : 1;
}

function computeEdgePreservationScore(imgDataOrig, imgDataGraded, w, h, step = 3) {
  const dO = imgDataOrig.data;
  const dG = imgDataGraded.data;
  let diffSum = 0;
  let count = 0;

  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const i = (y * w + x) * 4;
      const iR = (y * w + (x + 1)) * 4;
      const iD = ((y + 1) * w + x) * 4;

      const lO = (0.2126 * dO[i] + 0.7152 * dO[i + 1] + 0.0722 * dO[i + 2]) / 255;
      const lOR = (0.2126 * dO[iR] + 0.7152 * dO[iR + 1] + 0.0722 * dO[iR + 2]) / 255;
      const lOD = (0.2126 * dO[iD] + 0.7152 * dO[iD + 1] + 0.0722 * dO[iD + 2]) / 255;
      const gradO = Math.hypot(lOR - lO, lOD - lO);

      const lG = (0.2126 * dG[i] + 0.7152 * dG[i + 1] + 0.0722 * dG[i + 2]) / 255;
      const lGR = (0.2126 * dG[iR] + 0.7152 * dG[iR + 1] + 0.0722 * dG[iR + 2]) / 255;
      const lGD = (0.2126 * dG[iD] + 0.7152 * dG[iD + 1] + 0.0722 * dG[iD + 2]) / 255;
      const gradG = Math.hypot(lGR - lG, lGD - lG);

      if (gradO > 0.03) {
        const ratio = Math.abs(gradG - gradO) / Math.max(0.01, gradO);
        diffSum += clamp01(ratio);
        count++;
      }
    }
  }
  return count ? 1 - clamp01(diffSum / count) : 1;
}

// ==========================================
// 4. MATERIAL / ROI SEMANTICS & MASKING
// ==========================================

const MATERIAL_KEYS = [
  'cabinetry',
  'island',
  'wall',
  'floor',
  'wood',
  'stone_counter',
  'furniture',
  'neutral'
];

const MATERIAL_LABELS = {
  cabinetry: 'Cabinetry',
  island: 'Island',
  wall: 'Wall & Ceiling',
  floor: 'Floor',
  wood: 'Natural Wood',
  stone_counter: 'Stone & Countertop',
  furniture: 'Furniture',
  neutral: 'Architectural Neutrals'
};

/**
 * Fast edge magnitude map for feathering boundary detection & compositing safety
 */
function computeEdgeMap(imgData, w, h) {
  const d = imgData.data;
  const edges = new Float32Array(w * h);
  const lum = i => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;

  for (let y = 1; y < h - 1; y++) {
    const yw = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = (yw + x) * 4;
      const l = lum(i - 4);
      const r = lum(i + 4);
      const u = lum(i - w * 4);
      const b = lum(i + w * 4);
      const gx = r - l;
      const gy = b - u;
      edges[yw + x] = Math.hypot(gx, gy);
    }
  }
  return edges;
}

/**
 * Compute edge safety map where 1.0 is safe smooth interior and 0.0 is strong boundary edge
 */
function computeEdgeSafetyMap(edges, w, h) {
  const total = w * h;
  const safety = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const e = edges[i];
    safety[i] = 1 - smoothstep(0.045, 0.22, e);
  }
  return safety;
}

/**
 * Soft box-blur / separable feathering aware of image resolution
 */
function boxBlurMask(mask, w, h, radius) {
  if (radius <= 0) return mask;
  const total = w * h;
  const temp = new Float32Array(total);
  const result = new Float32Array(total);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const yw = y * w;
    let sum = 0;
    let count = 0;
    for (let x = 0; x <= radius && x < w; x++) {
      sum += mask[yw + x];
      count++;
    }
    for (let x = 0; x < w; x++) {
      const addX = x + radius + 1;
      const remX = x - radius;
      if (addX < w) {
        sum += mask[yw + addX];
        count++;
      }
      if (remX >= 0) {
        sum -= mask[yw + remX];
        count--;
      }
      temp[yw + x] = count ? sum / count : 0;
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y <= radius && y < h; y++) {
      sum += temp[y * w + x];
      count++;
    }
    for (let y = 0; y < h; y++) {
      const addY = y + radius + 1;
      const remY = y - radius;
      if (addY < h) {
        sum += temp[addY * w + x];
        count++;
      }
      if (remY >= 0) {
        sum -= temp[remY * w + x];
        count--;
      }
      result[y * w + x] = count ? sum / count : 0;
    }
  }

  return result;
}

/**
 * Automatic probabilistic classification for interior pixels into semantic material masks
 */
function classifyPixelMaterial(r, g, b, L, C, h, nx, ny, localGrad) {
  const scores = {
    cabinetry: 0,
    island: 0,
    wall: 0,
    floor: 0,
    wood: 0,
    stone_counter: 0,
    furniture: 0,
    neutral: 0
  };

  const isNeutral = C < 10 && L > 15 && L < 95;
  const isWoodHue = (h >= 16 && h <= 68) || (h >= 350 && h <= 360);
  const isCoolHue = h >= 170 && h <= 265;
  const isGreenHue = h >= 70 && h <= 165;

  // 1. FLOOR PRIORS: Lower half of image (ny > 0.48), horizontal plane
  if (ny > 0.48) {
    const floorSpatial = smoothstep(0.48, 0.72, ny);
    if (isWoodHue && C >= 8 && C <= 55 && L >= 18 && L <= 82) {
      scores.floor += floorSpatial * 1.5;
    } else if (isNeutral && L >= 20 && L <= 85) {
      scores.floor += floorSpatial * 1.2;
    } else if (C < 22 && L >= 15 && L <= 88) {
      scores.floor += floorSpatial * 0.9;
    }
  }

  // 2. WALL & CEILING PRIORS: Top & mid vertical planes (ny < 0.70), smooth texture
  if (ny < 0.70) {
    const wallSpatial = (1 - smoothstep(0.55, 0.85, ny));
    const smoothness = 1 - smoothstep(0.04, 0.16, localGrad);
    if (isNeutral && L >= 35 && L <= 98) {
      scores.wall += wallSpatial * smoothness * 1.6;
    } else if (C < 18 && L >= 30 && L <= 96) {
      scores.wall += wallSpatial * smoothness * 1.1;
    }
  }

  // 3. WOOD SURFACES: Characteristic warm hue, moderate chroma, texture
  if (isWoodHue && C >= 10 && C <= 65 && L >= 15 && L <= 86) {
    const woodHueCentering = 1 - Math.abs(circularHueDelta(h, 40)) / 45;
    scores.wood += Math.max(0, woodHueCentering) * smoothstep(8, 25, C) * 1.5;
  }

  // 4. CABINETRY: Vertical casework in mid-upper bounds, smooth paint or finished millwork
  if (ny >= 0.15 && ny <= 0.82) {
    const midSpatial = Math.sin(clamp01((ny - 0.1) / 0.75) * Math.PI);
    if (isWoodHue && C >= 12 && C <= 50 && L >= 22 && L <= 82) {
      scores.cabinetry += midSpatial * 1.2;
    } else if (isCoolHue && C >= 8 && C <= 45 && L >= 20 && L <= 75) {
      // Navy / Sage / Slate cabinetry
      scores.cabinetry += midSpatial * 1.4;
    } else if (isNeutral && L >= 30 && L <= 92) {
      scores.cabinetry += midSpatial * 0.8;
    }
  }

  // 5. ISLAND: Central focal zone
  if (ny >= 0.35 && ny <= 0.85 && nx >= 0.18 && nx <= 0.82) {
    const islandSpatial = Math.sin(clamp01((nx - 0.15) / 0.7) * Math.PI) * Math.sin(clamp01((ny - 0.3) / 0.55) * Math.PI);
    if (scores.cabinetry > 0.4 || scores.wood > 0.4 || (C < 25 && L > 25)) {
      scores.island += islandSpatial * 1.1;
    }
  }

  // 6. STONE / COUNTERTOP: Horizontal planes, low chroma, smooth or flecked
  if (ny >= 0.30 && ny <= 0.75) {
    const counterSpatial = Math.sin(clamp01((ny - 0.25) / 0.55) * Math.PI);
    if (C < 14 && L >= 25 && L <= 94) {
      scores.stone_counter += counterSpatial * (1 - smoothstep(0.06, 0.22, localGrad)) * 1.3;
    }
  }

  // 7. FURNITURE: Accent colors or distinct seating
  if (ny >= 0.35 && ny <= 0.90) {
    if ((C >= 25 && !isWoodHue) || (isCoolHue && C >= 18) || (isGreenHue && C >= 15)) {
      scores.furniture += 1.3;
    }
  }

  // 8. ARCHITECTURAL NEUTRAL: Base fallback for architectural trims / moldings
  if (isNeutral) {
    scores.neutral += 1.0;
  }

  return scores;
}

/**
 * Extract comprehensive material masks & stats for an image
 */
function extractMaterialProfiles(imgData, w, h) {
  const d = imgData.data;
  const total = w * h;
  const step = Math.max(1, Math.floor(total / 120000));
  const edges = computeEdgeMap(imgData, w, h);
  const edgeSafety = computeEdgeSafetyMap(edges, w, h);

  const featherRadius = clamp(Math.round(Math.min(w, h) / 90), 5, 15);

  // Initialize raw accumulation for each material
  const accum = {};
  for (const key of MATERIAL_KEYS) {
    accum[key] = {
      key,
      label: MATERIAL_LABELS[key],
      count: 0,
      L: [],
      C: [],
      a: [],
      b: [],
      h: [],
      sinH: 0,
      cosH: 0,
      neutralCount: 0,
      rgbSum: [0, 0, 0]
    };
  }

  // Downsampled analysis pass
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (d[i + 3] < 30) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const x = p % w;
    const y = Math.floor(p / w);
    const nx = x / Math.max(1, w - 1);
    const ny = y / Math.max(1, h - 1);
    const grad = edges[p];

    const [L, aVal, bVal] = rgbToLab(r, g, b);
    const [labL, C, hAngle] = labToLch(L, aVal, bVal);

    const scores = classifyPixelMaterial(r, g, b, L, C, hAngle, nx, ny, grad);

    // Find top material
    let bestMat = null;
    let maxScore = 0.25;
    for (const key of MATERIAL_KEYS) {
      if (scores[key] > maxScore) {
        maxScore = scores[key];
        bestMat = key;
      }
    }

    if (bestMat) {
      const item = accum[bestMat];
      item.count++;
      item.L.push(L);
      item.C.push(C);
      item.a.push(aVal);
      item.b.push(bVal);
      item.h.push(hAngle);
      const rad = (hAngle * Math.PI) / 180;
      item.sinH += Math.sin(rad);
      item.cosH += Math.cos(rad);
      item.rgbSum[0] += r / 255;
      item.rgbSum[1] += g / 255;
      item.rgbSum[2] += b / 255;
      if (C < 10) item.neutralCount++;
    }
  }

  // Build finalized material profiles
  const profiles = {};
  const totalSampled = Object.values(accum).reduce((sum, a) => sum + a.count, 0) || 1;

  for (const key of MATERIAL_KEYS) {
    const a = accum[key];
    if (a.count < 15) {
      profiles[key] = {
        key,
        label: MATERIAL_LABELS[key],
        present: false,
        confidence: 0,
        share: 0,
        medianL: 50,
        medianC: 15,
        medianH: 40,
        meanLab: [50, 0, 0],
        pL: [25, 50, 75],
        pC: [5, 15, 25]
      };
      continue;
    }

    a.L.sort((x, y) => x - y);
    a.C.sort((x, y) => x - y);

    const medianL = a.L[Math.floor(a.L.length / 2)];
    const medianC = a.C[Math.floor(a.C.length / 2)];
    const medianH = ((Math.atan2(a.sinH, a.cosH) * 180) / Math.PI + 360) % 360;

    const pL = [
      a.L[Math.floor(a.L.length * 0.1)],
      medianL,
      a.L[Math.floor(a.L.length * 0.9)]
    ];
    const pC = [
      a.C[Math.floor(a.C.length * 0.1)],
      medianC,
      a.C[Math.floor(a.C.length * 0.9)]
    ];

    const meanLab = [
      a.L.reduce((s, v) => s + v, 0) / a.count,
      a.a.reduce((s, v) => s + v, 0) / a.count,
      a.b.reduce((s, v) => s + v, 0) / a.count
    ];

    const share = a.count / totalSampled;
    const confidence = clamp01(Math.min(1, share * 3.5) * (a.count > 60 ? 1 : a.count / 60));

    profiles[key] = {
      key,
      label: MATERIAL_LABELS[key],
      present: true,
      confidence,
      share,
      count: a.count,
      medianL,
      medianC,
      medianH,
      meanLab,
      pL,
      pC,
      neutralRatio: a.neutralCount / a.count
    };
  }

  return {
    profiles,
    edges,
    edgeSafety,
    featherRadius
  };
}

/**
 * Aggregate material profiles across multiple reference images using robust median statistics
 */
function aggregateMaterialProfiles(referenceStatsList) {
  if (!referenceStatsList || !referenceStatsList.length) return null;

  const validStats = referenceStatsList.map(s => s?.materialProfiles).filter(Boolean);
  if (!validStats.length) return null;

  const aggregated = {};

  for (const key of MATERIAL_KEYS) {
    const candidates = validStats
      .map(stat => stat[key])
      .filter(p => p && p.present && p.confidence > 0.12);

    if (!candidates.length) {
      aggregated[key] = {
        key,
        label: MATERIAL_LABELS[key],
        present: false,
        confidence: 0,
        share: 0,
        medianL: 50,
        medianC: 15,
        medianH: 40,
        meanLab: [50, 0, 0],
        pL: [25, 50, 75],
        pC: [5, 15, 25]
      };
      continue;
    }

    // Median aggregation of percentiles and properties
    const medianL = median(candidates.map(c => c.medianL));
    const medianC = median(candidates.map(c => c.medianC));
    
    // Vector circular mean for hue
    let sinH = 0;
    let cosH = 0;
    for (const c of candidates) {
      const rad = (c.medianH * Math.PI) / 180;
      sinH += Math.sin(rad) * (c.confidence || 1);
      cosH += Math.cos(rad) * (c.confidence || 1);
    }
    const medianH = ((Math.atan2(sinH, cosH) * 180) / Math.PI + 360) % 360;

    const pL = [
      median(candidates.map(c => c.pL[0])),
      medianL,
      median(candidates.map(c => c.pL[2]))
    ];
    const pC = [
      median(candidates.map(c => c.pC[0])),
      medianC,
      median(candidates.map(c => c.pC[2]))
    ];

    const meanLab = [
      median(candidates.map(c => c.meanLab[0])),
      median(candidates.map(c => c.meanLab[1])),
      median(candidates.map(c => c.meanLab[2]))
    ];

    const confidence = median(candidates.map(c => c.confidence));
    const share = median(candidates.map(c => c.share));

    aggregated[key] = {
      key,
      label: MATERIAL_LABELS[key],
      present: true,
      confidence,
      share,
      medianL,
      medianC,
      medianH,
      meanLab,
      pL,
      pC
    };
  }

  return aggregated;
}

function median(values) {
  const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ==========================================
// 5. ILLUMINATION-AWARE ESTIMATION & CORRECTION
// ==========================================

/**
 * Estimates smooth ambient illumination field separating neutral cast from true materials
 */
function estimateIlluminationField(imgData, w, h, lightGrid) {
  const d = imgData.data;
  const total = w * h;
  const step = Math.max(1, Math.floor(total / 35000));

  // 3x3 Grid of Lab neutral casts
  const gridLab = Array.from({ length: 9 }, () => ({
    sumL: 0,
    sumA: 0,
    sumB: 0,
    count: 0,
    blueSpillSum: 0
  }));

  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (d[i + 3] < 30) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const x = p % w;
    const y = Math.floor(p / w);

    const [L, aVal, bVal] = rgbToLab(r, g, b);
    const [labL, C, hAngle] = labToLch(L, aVal, bVal);

    // Low-chroma surfaces or diffuse ambient spill
    const isNeutralSurface = C < 22 && L > 20 && L < 96;
    const isCoolDaylight = (hAngle >= 180 && hAngle <= 275 && C < 35 && L > 20) || bVal < -0.5;

    const gx = Math.min(2, Math.floor((x / w) * 3));
    const gy = Math.min(2, Math.floor((y / h) * 3));
    const gi = gy * 3 + gx;

    if (isNeutralSurface || isCoolDaylight) {
      const weight = isNeutralSurface ? 1.0 : 0.75;
      gridLab[gi].sumL += L * weight;
      gridLab[gi].sumA += aVal * weight;
      gridLab[gi].sumB += bVal * weight;
      gridLab[gi].count += weight;
    }

    if (bVal < 0) {
      gridLab[gi].blueSpillSum += -bVal;
    }
  }

  // Compute averaged illumination per grid zone
  const field = gridLab.map((z, idx) => {
    const count = Math.max(1, z.count);
    return {
      L: z.sumL / count,
      a: z.sumA / count,
      b: z.sumB / count,
      blueCast: z.blueSpillSum / count,
      confidence: clamp01(z.count / 80)
    };
  });

  return field;
}

/**
 * Spatially smooth interpolation of illumination field at normalized coordinate (nx, ny)
 */
function interpolateIllumination(field, nx, ny) {
  if (!field || field.length < 9) return { a: 0, b: 0, blueCast: 0 };
  const x = clamp01(nx) * 2;
  const y = clamp01(ny) * 2;
  const x0 = Math.min(1, Math.floor(x));
  const y0 = Math.min(1, Math.floor(y));
  const tx = x - x0;
  const ty = y - y0;

  const z00 = field[y0 * 3 + x0];
  const z10 = field[y0 * 3 + x0 + 1];
  const z01 = field[(y0 + 1) * 3 + x0];
  const z11 = field[(y0 + 1) * 3 + x0 + 1];

  const a = lerp(lerp(z00.a, z10.a, tx), lerp(z01.a, z11.a, tx), ty);
  const b = lerp(lerp(z00.b, z10.b, tx), lerp(z01.b, z11.b, tx), ty);
  const blueCast = lerp(lerp(z00.blueCast, z10.blueCast, tx), lerp(z01.blueCast, z11.blueCast, tx), ty);

  return { a, b, blueCast };
}

/**
 * Apply smooth illumination correction with true material protection
 */
function applyIlluminationCorrection(r, g, b, illum, params) {
  const [L, aVal, bVal] = rgbToLab(r, g, b);
  const [labL, C, h] = labToLch(L, aVal, bVal);

  // True material protection: saturated navy/blue/cool materials or warm woods are protected
  const isTrueMaterial = (C > 28 && (h > 180 && h < 270)) || (C > 18 && (h < 75 || h > 340));
  const protection = isTrueMaterial ? 0.85 : 0;

  // Detect diffuse cool/warm ambient cast
  const castWeight = (1 - smoothstep(8, 32, C)) * (1 - protection);
  const strength = (params.illumination || 0.5) * (1 - protection);

  if (castWeight <= 0.01 || strength <= 0.01) {
    return [r, g, b];
  }

  // Gently shift ambient a* and b* towards neutral D65 white balance
  const targetA = aVal - illum.a * castWeight * strength * 0.45;
  const targetB = bVal - (illum.b < -0.5 ? illum.b : 0) * castWeight * strength * 0.55;

  return labToRgb(L, targetA, targetB);
}

// ==========================================
// 6. LAB / LCh LOCAL PERCEPTUAL COLOUR TRANSFER
// ==========================================

/**
 * Transfer color characteristics from reference material profiles in LAB/LCh space
 */
function transferLocalMaterialColor(r, g, b, nx, ny, targetProfiles, refProfiles, edgeSafetyVal, params) {
  if (!refProfiles || !targetProfiles) return [r, g, b];

  const [L, aVal, bVal] = rgbToLab(r, g, b);
  const [labL, C, h] = labToLch(L, aVal, bVal);

  const scores = classifyPixelMaterial(r, g, b, L, C, h, nx, ny, 1 - edgeSafetyVal);

  let totalWeight = 0;
  let deltaLSum = 0;
  let scaleCSum = 0;
  let deltaHSum = 0;

  for (const key of MATERIAL_KEYS) {
    const rawWeight = scores[key];
    if (rawWeight <= 0.08) continue;

    const refMat = refProfiles[key];
    const srcMat = targetProfiles[key];

    if (!refMat || !refMat.present || refMat.confidence < 0.12) continue;

    const confidence = Math.min(rawWeight, refMat.confidence) * (srcMat?.confidence || 0.6);
    const w = confidence * edgeSafetyVal;
    if (w <= 0.01) continue;

    // 1. Lightness Delta: Median shift bounded to prevent crushing
    const targetMedL = srcMat?.medianL ?? L;
    const refMedL = refMat.medianL;
    const dL = clamp(refMedL - targetMedL, -14, 14);

    // 2. Chroma Scaling: Bounded scaling with saturation damping
    const targetMedC = Math.max(8, srcMat?.medianC ?? C);
    const refMedC = Math.max(6, refMat.medianC);
    const cScale = clamp(refMedC / targetMedC, 0.80, 1.25);

    // 3. Hue Delta: Circular shortest path delta clamped safely (±15°)
    const targetMedH = srcMat?.medianH ?? h;
    const refMedH = refMat.medianH;
    const dH = clamp(circularHueDelta(targetMedH, refMedH), -15, 15);

    deltaLSum += dL * w;
    scaleCSum += (cScale - 1) * w;
    deltaHSum += dH * w;
    totalWeight += w;
  }

  if (totalWeight <= 0.01) return [r, g, b];

  const avgDL = deltaLSum / totalWeight;
  const avgScaleC = scaleCSum / totalWeight;
  const avgDH = deltaHSum / totalWeight;

  const strength = clamp01((params.localStrength || 0.65) * (params.match || 0.7));
  const neutralGuard = 1 - (params.neutralProtect || 0.65) * (1 - smoothstep(4, 18, C));

  const finalL = clamp(L + avgDL * strength * 0.45 * neutralGuard, 0, 100);
  const finalC = Math.max(0, C * (1 + avgScaleC * strength * 0.65 * neutralGuard));
  const finalH = (h + avgDH * strength * 0.75 * neutralGuard + 360) % 360;

  return lchToRgb(finalL, finalC, finalH);
}

// ==========================================
// 7. OBJECTIVE ΔE00 / SSIM OPTIMIZATION LOOP
// ==========================================

/**
 * Evaluate a rendered output against reference profiles and original image
 * Returns a comprehensive score in [0, 100] and detailed sub-metrics
 */
function evaluateCompositeScore(imgDataOrig, imgDataRendered, w, h, targetProfiles, refProfiles) {
  const total = w * h;
  const step = Math.max(1, Math.floor(total / 25000));
  const dO = imgDataOrig.data;
  const dR = imgDataRendered.data;

  let deltaESum = 0;
  let deltaECount = 0;
  let penaltySum = 0;

  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (dO[i + 3] < 30) continue;

    const labOrig = rgbToLab(dO[i], dO[i + 1], dO[i + 2]);
    const labRend = rgbToLab(dR[i], dR[i + 1], dR[i + 2]);

    const [L_R, C_R, h_R] = labToLch(labRend[0], labRend[1], labRend[2]);
    const [L_O, C_O, h_O] = labToLch(labOrig[0], labOrig[1], labOrig[2]);

    // Perceptual color delta from original
    const dE = deltaE2000(labOrig, labRend);
    deltaESum += dE;
    deltaECount++;

    // Penalty for extreme over-saturation (C* > 75)
    if (C_R > 75 && C_R > C_O + 15) {
      penaltySum += (C_R - 75) * 0.15;
    }

    // Penalty for highlight clipping or deep shadow crushing
    if (labRend[0] > 98.5 && labOrig[0] < 96) penaltySum += 1.2;
    if (labRend[0] < 1.5 && labOrig[0] > 4) penaltySum += 1.2;

    // Penalty for wild hue flip (> 30° deviation on saturated pixels)
    if (C_O > 15) {
      const hDist = circularDistance(h_O, h_R);
      if (hDist > 25) penaltySum += (hDist - 25) * 0.1;
    }
  }

  const avgDeltaE = deltaECount ? deltaESum / deltaECount : 0;
  const avgPenalty = deltaECount ? penaltySum / deltaECount : 0;

  // Structural similarity score [0, 1]
  const ssimScore = computeFastSSIM(imgDataOrig, imgDataRendered, w, h, 6);

  // Edge preservation score [0, 1]
  const edgeScore = computeEdgePreservationScore(imgDataOrig, imgDataRendered, w, h, 4);

  // ΔE Score: Lower ΔE distance to reference look with safety bounds (ideal avg dE around 4-12)
  const colorScore = clamp01(1 - Math.abs(avgDeltaE - 8.5) / 25);
  const toneScore = clamp01(ssimScore * 0.6 + edgeScore * 0.4);
  const structureScore = ssimScore;

  // Composite score [0, 100]
  const rawScore =
    (colorScore * 0.35 + toneScore * 0.25 + structureScore * 0.25 + edgeScore * 0.15) * 100 -
    avgPenalty * 15;

  const overallScore = clamp(Math.round(rawScore * 10) / 10, 0, 100);

  return {
    overallScore,
    colorScore: Math.round(colorScore * 100),
    toneScore: Math.round(toneScore * 100),
    structureScore: Math.round(structureScore * 100),
    edgeScore: Math.round(edgeScore * 100),
    avgDeltaE: Math.round(avgDeltaE * 10) / 10,
    penalty: Math.round(avgPenalty * 10) / 10
  };
}

/**
 * Fast bounded parameter optimization loop
 * Runs bounded coordinate search on thumbnail canvas in < 40ms
 */
function optimizeParameters(renderFn, initialParams, targetStats, refStats, w, h, maxIterations = 8) {
  let currentParams = { ...initialParams };
  let bestParams = { ...initialParams };
  let bestScoreObj = null;

  // 1. Initial Evaluation
  const initImgData = renderFn(currentParams, w, h);
  const initialScoreObj = evaluateCompositeScore(
    initImgData.original,
    initImgData.rendered,
    w,
    h,
    targetStats.materialProfiles,
    refStats.materialProfiles
  );
  bestScoreObj = initialScoreObj;

  // Key tuneable parameter search grid
  const searchParams = [
    { key: 'localStrength', step: 0.12, min: 0.2, max: 0.95 },
    { key: 'tone', step: 0.08, min: 0.35, max: 0.90 },
    { key: 'color', step: 0.08, min: 0.30, max: 0.85 },
    { key: 'illumination', step: 0.15, min: 0.1, max: 0.90 },
    { key: 'neutralProtect', step: 0.08, min: 0.4, max: 0.95 }
  ];

  let iterationsRun = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false;

    for (const sp of searchParams) {
      iterationsRun++;
      const originalVal = currentParams[sp.key] ?? 0.5;

      // Try +step
      const candidateUp = clamp(originalVal + sp.step, sp.min, sp.max);
      currentParams[sp.key] = candidateUp;
      let res = renderFn(currentParams, w, h);
      let scoreUp = evaluateCompositeScore(
        res.original,
        res.rendered,
        w,
        h,
        targetStats.materialProfiles,
        refStats.materialProfiles
      );

      if (scoreUp.overallScore > bestScoreObj.overallScore + 0.3) {
        bestScoreObj = scoreUp;
        bestParams = { ...currentParams };
        improved = true;
        continue;
      }

      // Try -step
      const candidateDown = clamp(originalVal - sp.step, sp.min, sp.max);
      currentParams[sp.key] = candidateDown;
      res = renderFn(currentParams, w, h);
      let scoreDown = evaluateCompositeScore(
        res.original,
        res.rendered,
        w,
        h,
        targetStats.materialProfiles,
        refStats.materialProfiles
      );

      if (scoreDown.overallScore > bestScoreObj.overallScore + 0.3) {
        bestScoreObj = scoreDown;
        bestParams = { ...currentParams };
        improved = true;
        continue;
      }

      // Revert to best
      currentParams[sp.key] = bestParams[sp.key] ?? originalVal;
    }

    if (!improved) break;
  }

  return {
    initialScore: initialScoreObj,
    finalScore: bestScoreObj,
    optimizedParams: bestParams,
    iterationsRun
  };
}

/**
 * Computes spatial depth gradient map from normalized float depth array
 */
function computeDepthGradients(rawDepth, w, h) {
  if (!rawDepth) return null;
  const gradients = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    const yw = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = yw + x;
      const dx = rawDepth[idx + 1] - rawDepth[idx - 1];
      const dy = rawDepth[idx + w] - rawDepth[idx - w];
      gradients[idx] = Math.hypot(dx, dy);
    }
  }
  return gradients;
}

/**
 * Depth-aware tonal grading: separates near vs far spatial planes,
 * gentle aerial atmospheric haze control and foreground contrast enhancement.
 */
function applyDepthTonalGrading(r, g, b, depthVal, depthGrad, params) {
  if (depthVal === undefined || depthVal === null) return [r, g, b];
  const amount = (params.localDepth || 0.5) * (params.match || 0.7);
  if (amount <= 0.02) return [r, g, b];

  // depthVal: 0 = Far, 1 = Near
  // 1. Gentle aerial perspective: far background receives mild tone equalization / softness
  const farLayer = (1 - depthVal);
  const nearLayer = depthVal;

  // 2. Local Depth Pop: Foreground midtones get enhanced separation without crushing blacks
  const pop = (nearLayer - 0.5) * amount * 18 * (1 - smoothstep(0.15, 0.45, depthGrad || 0));

  // 3. Subtle depth separation in RGB
  let rOut = r + pop;
  let gOut = g + pop * 0.95;
  let bOut = b + pop * 0.90;

  return [
    clamp(Math.round(rOut), 0, 255),
    clamp(Math.round(gOut), 0, 255),
    clamp(Math.round(bOut), 0, 255)
  ];
}

const ColorEngine = {
  rgbToXyz,
  xyzToRgb,
  xyzToLab,
  labToXyz,
  rgbToLab,
  labToRgb,
  labToLch,
  lchToLab,
  rgbToLch,
  lchToRgb,
  circularHueDelta,
  circularDistance,
  deltaE2000,
  computeFastSSIM,
  computeEdgePreservationScore,
  MATERIAL_KEYS,
  MATERIAL_LABELS,
  computeEdgeMap,
  computeEdgeSafetyMap,
  boxBlurMask,
  classifyPixelMaterial,
  extractMaterialProfiles,
  aggregateMaterialProfiles,
  estimateIlluminationField,
  interpolateIllumination,
  applyIlluminationCorrection,
  transferLocalMaterialColor,
  evaluateCompositeScore,
  optimizeParameters,
  computeDepthGradients,
  applyDepthTonalGrading
};

if (typeof window !== 'undefined') {
  window.ColorEngine = ColorEngine;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ColorEngine = ColorEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ColorEngine;
}


