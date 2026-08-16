(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const refs = {
    referenceInput: $('referenceInput'),
    targetInput: $('targetInput'),
    referenceStack: $('referenceStack'),
    referenceUploadFooter: $('referenceUploadFooter'),
    referenceCountLabel: $('referenceCountLabel'),
    addReferencesBtn: $('addReferencesBtn'),
    clearReferencesBtn: $('clearReferencesBtn'),
    referenceDrop: $('referenceDrop'),
    targetDrop: $('targetDrop'),
    pasteToReferencesBtn: $('pasteToReferencesBtn'),
    pasteToTargetsBtn: $('pasteToTargetsBtn'),
    pasteHelper: $('pasteHelper'),
    pasteDestinationLabel: $('pasteDestinationLabel'),
    targetStack: $('targetStack'),
    targetUploadFooter: $('targetUploadFooter'),
    targetCountLabel: $('targetCountLabel'),
    addTargetsBtn: $('addTargetsBtn'),
    workspace: $('workspace'),
    beforeCanvas: $('beforeCanvas'),
    afterCanvas: $('afterCanvas'),
    afterLayer: $('afterLayer'),
    splitLine: $('splitLine'),
    splitSlider: $('splitSlider'),
    compareWrap: $('compareWrap'),
    styleSummary: $('styleSummary'),
    analysisGrid: $('analysisGrid'),
    referenceThreeWay: $('referenceThreeWay'),
    targetThreeWay: $('targetThreeWay'),
    targetDiagnosis: $('targetDiagnosis'),
    activeTargetLabel: $('activeTargetLabel'),
    compatibilityLabel: $('compatibilityLabel'),
    referenceHistogram: $('referenceHistogram'),
    targetHistogram: $('targetHistogram'),
    referenceAgreementLabel: $('referenceAgreementLabel'),
    referenceToneProfile: $('referenceToneProfile'),
    targetToneEq: $('targetToneEq'),
    curveCanvas: $('curveCanvas'),
    hslMixer: $('hslMixer'),
    targetStrip: $('targetStrip'),
    previewTitle: $('previewTitle'),
    batchSummary: $('batchSummary'),
    resultNote: $('resultNote'),
    exportBtn: $('exportBtn'),
    exportJpgBtn: $('exportJpgBtn'),
    exportAllBtn: $('exportAllBtn'),
    upscale2x: $('upscale2x'),
    structuralToggle: $('structuralToggle'),
    structuralPreview: $('structuralPreview'),
    structuralStatus: $('structuralStatus'),
    cannyCanvas: $('cannyCanvas'),
    depthCanvas: $('depthCanvas'),
    blueCastToggle: $('blueCastToggle'),
    batchFormat: $('batchFormat'),
    batchProgress: $('batchProgress'),
    batchProgressBar: $('batchProgressBar'),
    batchProgressText: $('batchProgressText'),
    exportLutBtn: $('exportLutBtn'),
    resetBtn: $('resetBtn'),
    resetCurrentBtn: $('resetCurrentBtn'),
    resetCurveBtn: $('resetCurveBtn'),
    autoTuneBtn: $('autoTuneBtn'),
    autoTuneAllBtn: $('autoTuneAllBtn'),
    mobileAutoTuneBtn: $('mobileAutoTuneBtn'),
    mobileAutoTuneAllBtn: $('mobileAutoTuneAllBtn'),
    newTargetBtn: $('newTargetBtn'),
    newReferenceBtn: $('newReferenceBtn'),
    prevTargetBtn: $('prevTargetBtn'),
    nextTargetBtn: $('nextTargetBtn'),
    saveProfileBtn: $('saveProfileBtn'),
    loadProfileInput: $('loadProfileInput'),
    finishPresetLabel: $('finishPresetLabel')
  };

  const sharedControlIds = [
    'matchStrength', 'toneStrength', 'colorStrength', 'threeWayStrength',
    'adaptiveToneStrength', 'detailStrength', 'neutralProtect', 'clipProtect',
    'highlightRolloff', 'colourDensity', 'localDepth', 'interiorProtect', 'finishTexture', 'exposure',
    'contrast', 'shadows', 'highlights', 'warmth', 'tint', 'saturation', 'grain'
  ];
  const trimControlIds = ['trimExposure', 'trimContrast', 'trimWarmth', 'trimTint'];
  const controls = Object.fromEntries([...sharedControlIds, ...trimControlIds].map(id => [id, $(id)]));
  const HSL_BANDS = [['Red',0],['Orange',30],['Yellow',60],['Green',120],['Aqua',180],['Blue',225],['Purple',275],['Magenta',320]];
  const curveXs = [0, .25, .5, .75, 1];
  const defaultCurve = () => [0, .25, .5, .75, 1];
  const defaultCorrection = () => ({ exposure: 0, contrast: 0, warmth: 0, tint: 0 });

  const state = {
    references: [],
    referenceSeq: 0,
    referenceStats: null,
    loadedProfile: null,
    targets: [],
    activeTargetId: null,
    afterStats: null,
    previewMax: matchMedia('(max-width: 720px), (pointer: coarse)').matches ? 720 : 960,
    processTimer: null,
    structuralTimer: null,
    mode: 'split',
    activeCurve: 'master',
    dragPoint: -1,
    targetSeq: 0,
    pasteDestination: 'reference',
    pasteSeq: 0,
    finishPreset: 'natural',
    curves: { master: defaultCurve(), r: defaultCurve(), g: defaultCurve(), b: defaultCurve() },
    hsl: Object.fromEntries(HSL_BANDS.map(([name]) => [name, { h: 0, s: 0, l: 0 }]))
  };

  const FINISH_PRESETS = {
    natural: {
      label: 'Natural • default', matchStrength: 60, toneStrength: 58, colorStrength: 46,
      threeWayStrength: 36, adaptiveToneStrength: 52, detailStrength: 30,
      neutralProtect: 78, clipProtect: 95, highlightRolloff: 56,
      colourDensity: 36, localDepth: 22, interiorProtect: 86, finishTexture: 14
    },
    editorial: {
      label: 'Editorial • recommended', matchStrength: 76, toneStrength: 70, colorStrength: 62,
      threeWayStrength: 54, adaptiveToneStrength: 68, detailStrength: 52,
      neutralProtect: 72, clipProtect: 94, highlightRolloff: 72,
      colourDensity: 62, localDepth: 58, interiorProtect: 82, finishTexture: 45
    },
    bold: {
      label: 'Bold • stronger pop', matchStrength: 88, toneStrength: 78, colorStrength: 70,
      threeWayStrength: 62, adaptiveToneStrength: 74, detailStrength: 60,
      neutralProtect: 70, clipProtect: 92, highlightRolloff: 82,
      colourDensity: 78, localDepth: 76, interiorProtect: 80, finishTexture: 58
    }
  };

  function clamp(v, min = 0, max = 255) { return Math.min(max, Math.max(min, v)); }
  function clamp01(v) { return clamp(v, 0, 1); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
  function std(a, m) { return a.length ? Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length) : 0; }
  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * p, b = Math.floor(pos), r = pos - b;
    return sorted[b + 1] !== undefined ? sorted[b] + r * (sorted[b + 1] - sorted[b]) : sorted[b];
  }
  function rgbToYuv(r, g, b) {
    const R = r / 255, G = g / 255, B = b / 255;
    return [.299 * R + .587 * G + .114 * B, -.14713 * R - .28886 * G + .436 * B, .615 * R - .51499 * G - .10001 * B];
  }
  function yuvToRgb(y, u, v) {
    return [clamp((y + 1.13983 * v) * 255), clamp((y - .39465 * u - .58060 * v) * 255), clamp((y + 2.03211 * u) * 255)];
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h;
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    let r, g, b;
    if (s === 0) r = g = b = l;
    else {
      const hue = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
    }
    return [clamp(r * 255), clamp(g * 255), clamp(b * 255)];
  }
  function circularDistance(a, b) { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; }
  function fmtPct(v) { return `${(v * 100).toFixed(v < .01 ? 1 : 0)}%`; }
  function cleanBaseName(name) { return (name || 'target').replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'target'; }
  function cloneDeep(obj) { return JSON.parse(JSON.stringify(obj)); }

  function median(values) {
    const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
    if (!a.length) return 0; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function medianField(items, path, fallback = 0) {
    const values = items.map(item => path.reduce((v, key) => v?.[key], item)).filter(Number.isFinite);
    return values.length ? median(values) : fallback;
  }
  function normalizedAggregateHist(items) {
    if (!items.some(s => s?.hist)) return null;
    const out = { y: new Uint32Array(256), r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };
    for (const channel of ['y','r','g','b']) {
      const acc = new Float64Array(256); let count = 0;
      for (const st of items) {
        const arr = st?.hist?.[channel]; if (!arr) continue; let total = 0; for (const v of arr) total += v; if (!total) continue;
        for (let i = 0; i < 256; i++) acc[i] += arr[i] / total; count++;
      }
      if (count) for (let i = 0; i < 256; i++) out[channel][i] = Math.round(acc[i] / count * 100000);
    }
    return out;
  }
  function referenceAgreement(items) {
    if (items.length <= 1) return { label: 'Single reference', score: 1 };
    const med = key => median(items.map(st => st[key]));
    const mad = key => median(items.map(st => Math.abs(st[key] - med(key))));
    const score = 1 - clamp01(mad('meanY') * 5 + mad('stdY') * 6 + mad('temperature') * 10 + mad('tint') * 10 + mad('meanSat') * 4);
    return { label: score > .78 ? 'High agreement' : score > .52 ? 'Mixed agreement' : 'Low agreement', score };
  }
  function aggregateReferenceStats(items) {
    items = items.map(hydrateStats).filter(Boolean); if (!items.length) return null;
    if (items.length === 1) { const single = cloneDeep(items[0]); single.hist = items[0].hist; single.referenceCount = 1; single.referenceAgreement = referenceAgreement(items); return single; }
    const scalarKeys = ['p01','p02','p05','p10','p25','p50','p75','p90','p95','p98','p99','meanY','stdY','meanSat','temperature','tint','clippedHi','crushed','neutralConfidence','gradient','laplacian','vignetteIndex','dynamicRange','highlightShoulder','shadowToe'];
    const agg = {}; for (const key of scalarKeys) agg[key] = median(items.map(st => st[key]));
    agg.rgb = Object.fromEntries(['r','g','b'].map(k => [k, medianField(items,['rgb',k])]));
    agg.rgbStd = Object.fromEntries(['r','g','b'].map(k => [k, medianField(items,['rgbStd',k],.1)]));
    agg.uv = Object.fromEntries(['u','v','su','sv'].map(k => [k, medianField(items,['uv',k], k === 'su' || k === 'sv' ? .05 : 0)]));
    agg.neutral = Object.fromEntries(['r','g','b'].map(k => [k, medianField(items,['neutral',k], agg.rgb[k])]));
    agg.channelClip = Object.fromEntries(['r','g','b'].map(k => [k, medianField(items,['channelClip',k])]));
    agg.lightBias = Object.fromEntries(['lr','tb','left','right','top','bottom'].map(k => [k, medianField(items,['lightBias',k])]));
    agg.colorZones = [0,1,2].map(i => Object.fromEntries(['u','v','sat','temperature','tint','neutralConfidence','residualU','residualV'].map(k => [k, medianField(items,['colorZones',i,k])])));
    agg.hueBands = HSL_BANDS.map(([, center], i) => Object.fromEntries([
      ['hue', medianField(items, ['hueBands', i, 'hue'], center)],
      ['sat', medianField(items, ['hueBands', i, 'sat'], agg.meanSat)],
      ['lum', medianField(items, ['hueBands', i, 'lum'], agg.meanY)],
      ['share', medianField(items, ['hueBands', i, 'share'], 0)]
    ]));
    agg.rgbPoints = Object.fromEntries(['r','g','b'].map(channel => [channel, Array.from({length:7}, (_, i) => medianField(items, ['rgbPoints', channel, i], [0.02,0.10,0.25,0.50,0.75,0.90,0.98][i]))]));
    agg.lightGrid = Array.from({length:9},(_,i) => Object.fromEntries(['y','u','v'].map(k => [k, medianField(items,['lightGrid',i,k], k === 'y' ? agg.meanY : 0)])));
    agg.hist = normalizedAggregateHist(items); agg.samples = items.reduce((sum,st) => sum + (st.samples || 0),0); agg.referenceCount = items.length; agg.referenceAgreement = referenceAgreement(items);
    return hydrateStats(agg);
  }

  function emptyToneZone() {
    return { count: 0, sumU: 0, sumV: 0, sumSat: 0, sumR: 0, sumG: 0, sumB: 0, neutralCount: 0, nR: 0, nG: 0, nB: 0 };
  }
  function addToneZone(z, r, g, b, y, u, v, sat) {
    z.count++; z.sumU += u; z.sumV += v; z.sumSat += sat; z.sumR += r / 255; z.sumG += g / 255; z.sumB += b / 255;
    if (sat < .11 && y > .06 && y < .96) { z.neutralCount++; z.nR += r / 255; z.nG += g / 255; z.nB += b / 255; }
  }
  function finalizeToneZone(z, globalUv) {
    const n = Math.max(1, z.count), nn = Math.max(1, z.neutralCount);
    const r = z.sumR / n, g = z.sumG / n, b = z.sumB / n;
    const nr = z.neutralCount > 18 ? z.nR / nn : r, ng = z.neutralCount > 18 ? z.nG / nn : g, nb = z.neutralCount > 18 ? z.nB / nn : b;
    return {
      u: z.sumU / n, v: z.sumV / n, sat: z.sumSat / n,
      temperature: nr - nb,
      tint: ng - (nr + nb) / 2,
      neutralConfidence: z.neutralCount / n,
      residualU: z.sumU / n - globalUv.u,
      residualV: z.sumV / n - globalUv.v
    };
  }

  function analyzeImage(img) {
    const maxDim = 760, scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(2, Math.round(img.naturalWidth * scale)), h = Math.max(2, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, w, h);
    return analyzeImageData(ctx.getImageData(0, 0, w, h), w, h);
  }

  function analyzeImageData(imageData, w, h) {
    const d = imageData.data, total = w * h, step = Math.max(1, Math.floor(total / 135000));
    const ys = [], rs = [], gs = [], bs = [], sats = [], us = [], vs = [], nr = [], ng = [], nb = [];
    const hueRaw = HSL_BANDS.map(() => ({ count: 0, sin: 0, cos: 0, sat: 0, lum: 0 }));
    let clippedHi = 0, crushed = 0, rClip = 0, gClip = 0, bClip = 0, neutralCount = 0;
    let left = 0, right = 0, top = 0, bottom = 0, leftN = 0, rightN = 0, topN = 0, bottomN = 0;
    let gradSum = 0, gradN = 0, lapSum = 0, lapN = 0;
    const toneRaw = [emptyToneZone(), emptyToneZone(), emptyToneZone()];
    const gridRaw = Array.from({ length: 9 }, () => ({ y: 0, u: 0, v: 0, n: 0 }));
    const lumAt = (x, y) => { const i = (y * w + x) * 4; return (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255; };

    for (let p = 0; p < total; p += step) {
      const i = p * 4; if (d[i + 3] < 32) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2], [y, u, v] = rgbToYuv(r, g, b);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx === 0 ? 0 : (mx - mn) / mx;
      ys.push(y); rs.push(r / 255); gs.push(g / 255); bs.push(b / 255); sats.push(sat); us.push(u); vs.push(v);
      if (y > .985) clippedHi++; if (y < .015) crushed++; if (r > 252) rClip++; if (g > 252) gClip++; if (b > 252) bClip++;
      if (sat < .11 && y > .12 && y < .9) { nr.push(r / 255); ng.push(g / 255); nb.push(b / 255); neutralCount++; }

      const x = p % w, yy = Math.floor(p / w);
      if (x < w / 2) { left += y; leftN++; } else { right += y; rightN++; }
      if (yy < h / 2) { top += y; topN++; } else { bottom += y; bottomN++; }
      const gx = Math.min(2, Math.floor(x / w * 3)), gy = Math.min(2, Math.floor(yy / h * 3)), gi = gy * 3 + gx;
      gridRaw[gi].y += y; gridRaw[gi].u += u; gridRaw[gi].v += v; gridRaw[gi].n++;
      addToneZone(toneRaw[y < .33 ? 0 : y < .67 ? 1 : 2], r, g, b, y, u, v, sat);
      if (sat > .075 && y > .025 && y < .985) {
        const [hue, hslSat, hslLum] = rgbToHsl(r, g, b);
        HSL_BANDS.forEach(([, center], hi) => {
          const dist = circularDistance(hue, center); if (dist >= 48) return;
          const weight = Math.pow(1 - dist / 48, 1.55) * (.35 + hslSat);
          const rad = hue * Math.PI / 180, bin = hueRaw[hi]; bin.count += weight;
          bin.sin += Math.sin(rad) * weight; bin.cos += Math.cos(rad) * weight;
          bin.sat += hslSat * weight; bin.lum += hslLum * weight;
        });
      }

      if (x + 1 < w && yy + 1 < h) { const yr = lumAt(x + 1, yy), yd = lumAt(x, yy + 1); gradSum += Math.abs(y - yr) + Math.abs(y - yd); gradN += 2; }
      if (x > 0 && x + 1 < w && yy > 0 && yy + 1 < h) {
        const avg = (lumAt(x - 1, yy) + lumAt(x + 1, yy) + lumAt(x, yy - 1) + lumAt(x, yy + 1)) / 4;
        lapSum += Math.abs(y - avg); lapN++;
      }
    }

    ys.sort((a, b) => a - b);
    const sortedChannels = { r: rs.slice().sort((a,b) => a - b), g: gs.slice().sort((a,b) => a - b), b: bs.slice().sort((a,b) => a - b) };
    const mr = mean(rs), mg = mean(gs), mb = mean(bs), my = mean(ys), ms = mean(sats), mu = mean(us), mv = mean(vs);
    const neutral = nr.length > 80 ? { r: mean(nr), g: mean(ng), b: mean(nb) } : { r: mr, g: mg, b: mb };
    const n = Math.max(1, ys.length), lr = leftN ? left / leftN : 0, rr = rightN ? right / rightN : 0, tr = topN ? top / topN : 0, br = bottomN ? bottom / bottomN : 0;
    const hist = { y: new Uint32Array(256), r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };
    for (let p = 0; p < total; p += step) {
      const i = p * 4; if (d[i + 3] < 32) continue;
      hist.r[d[i]]++; hist.g[d[i + 1]]++; hist.b[d[i + 2]]++;
      hist.y[Math.round(clamp01((.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255) * 255)]++;
    }
    const uv = { u: mu, v: mv, su: std(us, mu), sv: std(vs, mv) };
    const colorZones = toneRaw.map(z => finalizeToneZone(z, uv));
    const hueBands = hueRaw.map((bin, i) => ({
      hue: bin.count ? ((Math.atan2(bin.sin, bin.cos) * 180 / Math.PI) + 360) % 360 : HSL_BANDS[i][1],
      sat: bin.count ? bin.sat / bin.count : ms,
      lum: bin.count ? bin.lum / bin.count : my,
      share: bin.count / Math.max(1, ys.length)
    }));
    const rgbPoints = Object.fromEntries(['r','g','b'].map(channel => [channel, [.02,.10,.25,.50,.75,.90,.98].map(p => percentile(sortedChannels[channel], p))]));
    const lightGrid = gridRaw.map(z => ({ y: z.n ? z.y / z.n : my, u: z.n ? z.u / z.n : mu, v: z.n ? z.v / z.n : mv }));
    const corners = [lightGrid[0].y, lightGrid[2].y, lightGrid[6].y, lightGrid[8].y];
    const center = lightGrid[4].y;

    return {
      p01: percentile(ys, .01), p02: percentile(ys, .02), p05: percentile(ys, .05), p10: percentile(ys, .10),
      p25: percentile(ys, .25), p50: percentile(ys, .5), p75: percentile(ys, .75), p90: percentile(ys, .9),
      p95: percentile(ys, .95), p98: percentile(ys, .98), p99: percentile(ys, .99),
      meanY: my, stdY: std(ys, my), meanSat: ms,
      rgb: { r: mr, g: mg, b: mb }, rgbStd: { r: std(rs, mr), g: std(gs, mg), b: std(bs, mb) }, uv,
      neutral, temperature: neutral.r - neutral.b, tint: neutral.g - (neutral.r + neutral.b) / 2,
      clippedHi: clippedHi / n, crushed: crushed / n, channelClip: { r: rClip / n, g: gClip / n, b: bClip / n }, neutralConfidence: neutralCount / n,
      gradient: gradN ? gradSum / gradN : 0, laplacian: lapN ? lapSum / lapN : 0,
      lightBias: { lr: lr - rr, tb: tr - br, left: lr, right: rr, top: tr, bottom: br },
      colorZones, hueBands, rgbPoints, lightGrid,
      vignetteIndex: center - mean(corners),
      dynamicRange: percentile(ys, .98) - percentile(ys, .02),
      highlightShoulder: percentile(ys, .99) - percentile(ys, .95),
      shadowToe: percentile(ys, .05) - percentile(ys, .01),
      hist, samples: ys.length
    };
  }

  function hydrateStats(s) {
    if (!s) return null;
    if (!s.uv) s.uv = { u: 0, v: 0, su: .05, sv: .05 };
    if (!Number.isFinite(s.uv.su)) s.uv.su = .05;
    if (!Number.isFinite(s.uv.sv)) s.uv.sv = .05;
    if (!s.colorZones) s.colorZones = [0, 1, 2].map(() => ({ u: s.uv.u, v: s.uv.v, sat: s.meanSat || .2, temperature: s.temperature || 0, tint: s.tint || 0, neutralConfidence: s.neutralConfidence || 0, residualU: 0, residualV: 0 }));
    if (!s.hueBands) s.hueBands = HSL_BANDS.map(([, center]) => ({ hue: center, sat: s.meanSat || .2, lum: s.meanY || .5, share: 0 }));
    if (!s.rgbPoints) s.rgbPoints = Object.fromEntries(['r','g','b'].map(channel => [channel, [s.p02,s.p10,s.p25,s.p50,s.p75,s.p90,s.p98].map((v,i) => Number.isFinite(v) ? v : [0.02,0.10,0.25,0.50,0.75,0.90,0.98][i])]));
    if (!s.lightGrid) s.lightGrid = Array.from({ length: 9 }, () => ({ y: s.meanY || .5, u: s.uv.u, v: s.uv.v }));
    if (!Number.isFinite(s.dynamicRange)) s.dynamicRange = (s.p98 || .95) - (s.p02 || .05);
    if (!Number.isFinite(s.highlightShoulder)) s.highlightShoulder = (s.p99 || 1) - (s.p95 || .95);
    if (!Number.isFinite(s.shadowToe)) s.shadowToe = (s.p05 || .05) - (s.p01 || 0);
    if (!Number.isFinite(s.vignetteIndex)) s.vignetteIndex = 0;
    if (!Number.isFinite(s.referenceCount)) s.referenceCount = 1;
    if (!s.referenceAgreement) s.referenceAgreement = { label: s.referenceCount > 1 ? 'Mixed agreement' : 'Single reference', score: s.referenceCount > 1 ? .6 : 1 };
    return s;
  }

  function descriptor(s) {
    const temp = s.temperature > .045 ? 'warm' : s.temperature < -.035 ? 'cool' : 'neutral';
    const exposure = s.meanY < .34 ? 'moody' : s.meanY > .58 ? 'bright' : 'balanced';
    const contrast = s.stdY < .19 ? 'soft' : s.stdY > .27 ? 'crisp' : 'moderate';
    const sat = s.meanSat < .18 ? 'restrained' : s.meanSat > .34 ? 'vivid' : 'natural';
    const shadows = s.p10 > .12 ? 'open' : s.p10 < .065 ? 'deep' : 'controlled';
    const highlights = s.p98 < .93 ? 'protected' : 'luminous';
    return { temp, exposure, contrast, sat, shadows, highlights };
  }

  function toneBiasLabel(z) {
    const temp = z.temperature > .035 ? 'Warm' : z.temperature < -.028 ? 'Cool' : 'Neutral';
    const tint = z.tint > .018 ? 'green' : z.tint < -.018 ? 'magenta' : 'balanced tint';
    return { temp, tint };
  }

  function renderThreeWay(el, s) {
    const names = ['Shadows', 'Midtones', 'Highlights'];
    el.innerHTML = s.colorZones.map((z, i) => {
      const b = toneBiasLabel(z);
      return `<div class="zone-chip"><span>${names[i]}</span><strong>${b.temp}</strong><small>${b.tint}</small></div>`;
    }).join('');
  }

  const TONE_EQ_NAMES = ['Deep shadows','Shadows','Midtones','Highlights','Whites'];
  const TONE_EQ_KEYS = ['p05','p25','p50','p75','p95'];
  function globalToneMap(y, src, ref) {
    const gain = clamp(ref.stdY / Math.max(.07, src.stdY), .78, 1.28);
    return clamp01(ref.meanY + (y - src.meanY) * gain);
  }
  function adaptiveToneDeltas(src, ref) {
    return TONE_EQ_KEYS.map(key => { const x = src[key]; return clamp(ref[key] - globalToneMap(x, src, ref), -.14, .14); });
  }
  function adaptiveToneDeltaAt(src, ref, y) {
    const xs = TONE_EQ_KEYS.map(k => src[k]), ds = adaptiveToneDeltas(src, ref);
    if (y <= xs[0]) return ds[0]; if (y >= xs[4]) return ds[4]; let i = 0; while (i < 3 && y > xs[i + 1]) i++;
    const t = clamp01((y - xs[i]) / Math.max(1e-5, xs[i + 1] - xs[i])); const smooth = t * t * (3 - 2 * t); return lerp(ds[i], ds[i + 1], smooth);
  }
  function renderReferenceToneProfile(st) {
    refs.referenceToneProfile.innerHTML = TONE_EQ_KEYS.map((key,i) => `<div class="tone-chip"><span>${TONE_EQ_NAMES[i]}</span><strong>${Math.round(st[key] * 100)}%</strong></div>`).join('');
    refs.referenceAgreementLabel.textContent = `${st.referenceCount || 1} reference${st.referenceCount === 1 ? '' : 's'} • ${st.referenceAgreement?.label || 'profile'}`;
  }
  function renderTargetToneEq(target) {
    const ds = adaptiveToneDeltas(target.stats, state.referenceStats);
    refs.targetToneEq.innerHTML = ds.map((d,i) => { const n = Math.round(d * 100), label = n > 0 ? `+${n}` : `${n}`; return `<div class="tone-chip ${n > 1 ? 'lift' : n < -1 ? 'lower' : ''}"><span>${TONE_EQ_NAMES[i]}</span><strong>${label}</strong></div>`; }).join('');
  }

  function renderReferenceAnalysis(s) {
    s = hydrateStats(s);
    const d = descriptor(s);
    refs.styleSummary.textContent = `${capitalize(d.exposure)} ${d.temp} photographic finish with ${d.contrast} contrast, ${d.shadows} shadows, ${d.highlights} highlights and ${d.sat} saturation.`;
    const metrics = [
      ['Exposure', d.exposure], ['White balance', d.temp], ['Contrast', d.contrast], ['Saturation', d.sat],
      ['Shadows', d.shadows], ['Highlights', d.highlights], ['Dynamic range', s.dynamicRange > .82 ? 'wide' : s.dynamicRange < .60 ? 'compressed' : 'moderate'],
      ['Highlight shoulder', s.highlightShoulder < .035 ? 'soft' : s.highlightShoulder > .075 ? 'open' : 'controlled']
    ];
    refs.analysisGrid.innerHTML = metrics.map(([k, v]) => `<div class="metric"><span>${k}</span><strong>${capitalize(v)}</strong></div>`).join('');
    renderThreeWay(refs.referenceThreeWay, s);
    renderReferenceToneProfile(s);
    if (s.hist) drawHistogram(refs.referenceHistogram, s.hist, 'rgb'); else drawHistogramUnavailable(refs.referenceHistogram, 'Histogram unavailable in saved profile');
  }

  function compatibility(ref, t) {
    const tone = Math.abs(ref.meanY - t.meanY) * 2 + Math.abs(ref.stdY - t.stdY) * 1.5 + Math.abs(ref.p98 - t.p98) + Math.abs(ref.p02 - t.p02);
    const color = Math.abs(ref.temperature - t.temperature) * 4 + Math.abs(ref.tint - t.tint) * 4 + Math.abs(ref.meanSat - t.meanSat) * 1.6;
    const score = tone + color;
    return score < .32 ? ['Easy match', score] : score < .62 ? ['Moderate match', score] : ['Aggressive match', score];
  }

  function lightingBias(s) {
    const lr = s.lightBias.lr, tb = s.lightBias.tb;
    if (Math.abs(lr) < .025 && Math.abs(tb) < .025) return 'Fairly even';
    if (Math.abs(lr) >= Math.abs(tb)) return lr > 0 ? 'Brighter from left' : 'Brighter from right';
    return tb > 0 ? 'Brighter from top' : 'Brighter from bottom';
  }
  function vignetteLabel(v) { return v > .075 ? 'Center brighter' : v < -.075 ? 'Edges brighter' : 'Low / mixed'; }
  function shoulderLabel(v) { return v < .03 ? 'Compressed' : v > .075 ? 'Open' : 'Controlled'; }
  function toeLabel(v) { return v < .025 ? 'Compressed' : v > .07 ? 'Open' : 'Controlled'; }

  function renderTargetDiagnosis(target) {
    if (!target || !state.referenceStats) return;
    const t = hydrateStats(target.stats), [label] = compatibility(state.referenceStats, t);
    refs.activeTargetLabel.textContent = target.name;
    refs.compatibilityLabel.textContent = `${label}${target.tuned ? ' • auto tuned' : ''}`;
    refs.previewTitle.textContent = target.name;
    const sharp = t.gradient > .075 ? 'high' : t.gradient < .035 ? 'soft' : 'moderate';
    const micro = t.laplacian > .038 ? 'high' : t.laplacian < .016 ? 'low' : 'moderate';
    const neutral = t.neutralConfidence > .18 ? 'strong' : t.neutralConfidence > .07 ? 'usable' : 'limited';
    const detail = detailMatchAmount(t, state.referenceStats, { detail: 1, match: 1 });
    const detailLabel = detail > .055 ? `Sharpen ${Math.round(detail * 100)}%` : detail < -.055 ? `Soften ${Math.round(Math.abs(detail) * 100)}%` : 'Already close';
    const rows = [
      ['Highlight clipping', fmtPct(t.clippedHi)], ['Shadow crushing', fmtPct(t.crushed)],
      ['White headroom', `${((1 - t.p98) * 100).toFixed(0)}%`], ['Black headroom', `${(t.p02 * 100).toFixed(0)}%`],
      ['Dynamic range', `${(t.dynamicRange * 100).toFixed(0)}%`], ['Neutral-pixel confidence', capitalize(neutral)],
      ['Broad light bias', lightingBias(t)], ['Vignette tendency', vignetteLabel(t.vignetteIndex)],
      ['Highlight shoulder', shoulderLabel(t.highlightShoulder)], ['Shadow toe', toeLabel(t.shadowToe)],
      ['Edge sharpness', capitalize(sharp)], ['Microcontrast', capitalize(micro)],
      ['Detail recommendation', detailLabel]
    ];
    refs.targetDiagnosis.innerHTML = rows.map(([k, v]) => `<div class="diagnostic"><span>${k}</span><strong>${v}</strong></div>`).join('');
    renderThreeWay(refs.targetThreeWay, t);
    renderTargetToneEq(target);
  }

  function drawHistogramUnavailable(canvas, text) {
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#0b0b09'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#77756c'; ctx.font = '12px system-ui'; ctx.fillText(text, 18, canvas.height / 2 + 4);
  }

  function drawHistogram(canvas, hist, mode = 'y', afterHist = null) {
    if (!canvas || !hist) return;
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#0b0b09'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#24241f'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, h * i / 4); ctx.lineTo(w, h * i / 4); ctx.stroke(); }
    const draw = (arr, stroke, alpha = 1) => {
      let max = 1; for (const v of arr) max = Math.max(max, v);
      ctx.strokeStyle = stroke; ctx.globalAlpha = alpha; ctx.beginPath();
      for (let i = 0; i < 256; i++) { const x = i / 255 * w, y = h - Math.sqrt(arr[i] / max) * h * .94; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); ctx.globalAlpha = 1;
    };
    if (mode === 'rgb') { draw(hist.r, '#e78383', .65); draw(hist.g, '#83d99a', .65); draw(hist.b, '#86a9ee', .65); draw(hist.y, '#f2efe5', .75); }
    else { draw(hist.y, '#aaa79b', .85); if (afterHist) draw(afterHist.y, '#d8f077', .95); }
  }

  function drawLightMap(canvas, stats) {
    if (!canvas || !stats?.lightGrid) return;
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, cw = w / 3, ch = h / 3;
    ctx.clearRect(0, 0, w, h); ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    stats.lightGrid.forEach((z, i) => {
      const gx = i % 3, gy = Math.floor(i / 3), val = clamp01(z.y), shade = Math.round(24 + val * 185);
      ctx.fillStyle = `rgb(${shade},${shade},${Math.max(0, shade - 4)})`; ctx.fillRect(gx * cw, gy * ch, cw, ch);
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.strokeRect(gx * cw + .5, gy * ch + .5, cw - 1, ch - 1);
      ctx.fillStyle = val > .56 ? 'rgba(0,0,0,.72)' : 'rgba(255,255,255,.82)'; ctx.fillText(`${Math.round(val * 100)}%`, gx * cw + cw / 2, gy * ch + ch / 2);
    });
  }

  function piecewiseMap(y, src, dst) {
    const sx = [0, src.p02, src.p10, src.p25, src.p50, src.p75, src.p90, src.p98, 1];
    const dx = [0, dst.p02, dst.p10, dst.p25, dst.p50, dst.p75, dst.p90, dst.p98, 1];
    let k = 0; while (k < sx.length - 2 && y > sx[k + 1]) k++;
    const den = Math.max(1e-5, sx[k + 1] - sx[k]), t = clamp01((y - sx[k]) / den);
    return clamp01(lerp(dx[k], dx[k + 1], t));
  }

  function evalCurve(v, ys) {
    v = clamp01(v); const k = Math.min(3, Math.floor(v * 4)), t = (v - curveXs[k]) / (curveXs[k + 1] - curveXs[k]);
    return clamp01(lerp(ys[k], ys[k + 1], clamp01(t)));
  }
  function curveLUT(ys) { const lut = new Uint8Array(256); for (let i = 0; i < 256; i++) lut[i] = Math.round(evalCurve(i / 255, ys) * 255); return lut; }

  function activeTarget() { return state.targets.find(t => t.id === state.activeTargetId) || state.targets[0] || null; }

  function getParams(target = activeTarget()) {
    const c = target?.correction || defaultCorrection();
    return {
      match: +controls.matchStrength.value / 100,
      tone: +controls.toneStrength.value / 100,
      color: +controls.colorStrength.value / 100,
      threeWay: +controls.threeWayStrength.value / 100,
      adaptiveTone: +controls.adaptiveToneStrength.value / 100,
      detail: +controls.detailStrength.value / 100,
      neutralProtect: +controls.neutralProtect.value / 100,
      clipProtect: +controls.clipProtect.value / 100,
      highlightRolloff: +controls.highlightRolloff.value / 100,
      colourDensity: +controls.colourDensity.value / 100,
      localDepth: +controls.localDepth.value / 100,
      interiorProtect: +controls.interiorProtect.value / 100,
      finishTexture: +controls.finishTexture.value / 100,
      exposure: +controls.exposure.value / 100 + c.exposure / 100,
      contrast: +controls.contrast.value / 100 + c.contrast / 100,
      shadows: +controls.shadows.value / 100,
      highlights: +controls.highlights.value / 100,
      warmth: +controls.warmth.value / 100 + c.warmth / 100,
      tint: +controls.tint.value / 100 + c.tint / 100,
      saturation: +controls.saturation.value / 100,
      grain: +controls.grain.value / 100
    };
  }

  function updateOutputs() {
    const formatters = {
      matchStrength: v => v, toneStrength: v => v, colorStrength: v => v, threeWayStrength: v => v, adaptiveToneStrength: v => v, detailStrength: v => v,
      neutralProtect: v => v, clipProtect: v => v, highlightRolloff: v => v, colourDensity: v => v,
      localDepth: v => v, interiorProtect: v => v, finishTexture: v => v, exposure: v => (+v / 100).toFixed(2), contrast: v => v,
      shadows: v => v, highlights: v => v, warmth: v => v, tint: v => v, saturation: v => v, grain: v => v,
      trimExposure: v => (+v / 100).toFixed(2), trimContrast: v => v, trimWarmth: v => v, trimTint: v => v
    };
    for (const id of [...sharedControlIds, ...trimControlIds]) {
      const out = $(id + 'Out'); if (out) out.value = formatters[id](controls[id].value);
    }
  }

  function applyFinishPreset(name, rematch = true) {
    const preset = FINISH_PRESETS[name] || FINISH_PRESETS.natural;
    state.finishPreset = FINISH_PRESETS[name] ? name : 'natural';
    for (const [id, value] of Object.entries(preset)) if (id !== 'label' && controls[id]) controls[id].value = value;
    document.querySelectorAll('.finish-preset').forEach(button => button.classList.toggle('active', button.dataset.preset === state.finishPreset));
    refs.finishPresetLabel.textContent = preset.label;
    updateOutputs();
    if (rematch && state.referenceStats && state.targets.length) {
      for (const target of state.targets) autoTuneTarget(target);
      syncTrimControls(); renderTargetStrip(); drawPreview();
    } else scheduleProcess();
  }

  function applyHslMixer(r, g, b) {
    let [h, s, l] = rgbToHsl(r, g, b), dh = 0, ds = 0, dl = 0, ws = 0;
    for (const [name, center] of HSL_BANDS) {
      const dist = circularDistance(h, center), w = dist < 55 ? Math.pow(1 - dist / 55, 1.4) : 0;
      if (w) { const adj = state.hsl[name]; dh += adj.h * w; ds += adj.s * w; dl += adj.l * w; ws += w; }
    }
    if (ws) { dh /= ws; ds /= ws; dl /= ws; h += dh; s = clamp01(s * (1 + ds / 100)); l = clamp01(l + dl / 100 * .35); }
    return hslToRgb(h, s, l);
  }

  function toneResidualAt(stats, y) {
    const z = stats.colorZones;
    if (y <= .33) { const t = clamp01(y / .33); return { u: lerp(z[0].residualU, z[1].residualU, t * .42), v: lerp(z[0].residualV, z[1].residualV, t * .42) }; }
    if (y < .67) { const t = (y - .33) / .34; return { u: lerp(z[0].residualU * .35 + z[1].residualU * .65, z[2].residualU * .35 + z[1].residualU * .65, t), v: lerp(z[0].residualV * .35 + z[1].residualV * .65, z[2].residualV * .35 + z[1].residualV * .65, t) }; }
    const t = clamp01((y - .67) / .33); return { u: lerp(z[1].residualU, z[2].residualU, .58 + t * .42), v: lerp(z[1].residualV, z[2].residualV, .58 + t * .42) };
  }

  function gridValueAt(grid, nx, ny) {
    const x = clamp01(nx) * 2, y = clamp01(ny) * 2, x0 = Math.min(1, Math.floor(x)), y0 = Math.min(1, Math.floor(y));
    const tx = x - x0, ty = y - y0;
    const a = grid[y0 * 3 + x0].y, b = grid[y0 * 3 + x0 + 1].y, c = grid[(y0 + 1) * 3 + x0].y, d = grid[(y0 + 1) * 3 + x0 + 1].y;
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }

  function spatialDeltaAt(src, ref, nx, ny) {
    const s = gridValueAt(src.lightGrid, nx, ny) - src.meanY, r = gridValueAt(ref.lightGrid, nx, ny) - ref.meanY;
    return clamp(r - s, -.12, .12);
  }

  function smoothstep(a, b, v) {
    const t = clamp01((v - a) / Math.max(1e-6, b - a)); return t * t * (3 - 2 * t);
  }

  function channelPointMap(value, srcPoints, refPoints) {
    const sx = [0, ...srcPoints, 1], dx = [0, ...refPoints, 1];
    let i = 0; while (i < sx.length - 2 && value > sx[i + 1]) i++;
    const t = clamp01((value - sx[i]) / Math.max(1e-5, sx[i + 1] - sx[i]));
    return clamp01(lerp(dx[i], dx[i + 1], t * t * (3 - 2 * t)));
  }

  function signedHueDelta(from, to) {
    return (to - from + 540) % 360 - 180;
  }

  function applyReferenceColour(r, g, b, srcStats, refStats, params) {
    let [h, s, l] = rgbToHsl(r, g, b), dh = 0, satScale = 0, lumShift = 0, total = 0;
    for (let i = 0; i < HSL_BANDS.length; i++) {
      const center = HSL_BANDS[i][1], dist = circularDistance(h, center), weight = dist < 55 ? Math.pow(1 - dist / 55, 1.5) : 0;
      if (!weight) continue;
      const source = srcStats.hueBands[i], reference = refStats.hueBands[i];
      const confidence = clamp01(Math.max(source.share, reference.share) * 34);
      const w = weight * (.25 + .75 * confidence);
      dh += clamp(signedHueDelta(source.hue, reference.hue), -12, 12) * w;
      satScale += (clamp(reference.sat / Math.max(.055, source.sat), .76, 1.32) - 1) * w;
      lumShift += clamp(reference.lum - source.lum, -.07, .07) * w;
      total += w;
    }
    if (!total) return [r, g, b];
    dh /= total; satScale /= total; lumShift /= total;
    const neutralSurface = (1 - smoothstep(.07, .23, s)) * smoothstep(.16, .88, l);
    const green = smoothstep(72, 92, h) * (1 - smoothstep(150, 172, h));
    const wood = smoothstep(12, 24, h) * (1 - smoothstep(58, 72, h)) * smoothstep(.08, .22, s);
    const protect = params.interiorProtect * Math.max(neutralSurface, green * .72, wood * .45);
    const amount = params.colourDensity * params.match * (1 - protect * .58);
    h += dh * amount * .72;
    const midtoneMask = .28 + .72 * Math.sin(clamp01(l) * Math.PI);
    s = clamp01(s * (1 + satScale * amount) * (1 + params.colourDensity * .085 * midtoneMask * (1 - neutralSurface)));
    l = clamp01(l + lumShift * amount * .32);
    if (green) s *= 1 - green * params.interiorProtect * .045;
    return hslToRgb(h, s, l);
  }

  function applyHighlightRolloff(y, refStats, amount) {
    if (!amount || y <= .68) return y;
    const start = clamp(refStats.p75 + .035, .68, .84);
    if (y <= start) return y;
    const ceiling = clamp(refStats.p99 + .012, .91, .992);
    const t = clamp01((y - start) / Math.max(.02, 1 - start));
    const shaped = 1 - Math.pow(1 - t, 1.32);
    return clamp01(lerp(y, start + (ceiling - start) * shaped, amount));
  }

  function transformRGB(r, g, b, srcStats, refStats, params, luts, noise = 0, nx = .5, ny = .5) {
    srcStats = hydrateStats(srcStats); refStats = hydrateStats(refStats);
    let [y, u, v] = rgbToYuv(r, g, b);
    const overall = params.match, toneAmt = params.tone * overall, colorAmt = params.color * overall;
    const expFactor = Math.pow(2, params.exposure);
    const satRatio = clamp(refStats.meanSat / Math.max(.05, srcStats.meanSat), .72, 1.35);
    const suRatio = clamp(refStats.uv.su / Math.max(.02, srcStats.uv.su), .78, 1.25), svRatio = clamp(refStats.uv.sv / Math.max(.02, srcStats.uv.sv), .78, 1.25);
    const uShift = clamp(refStats.uv.u - srcStats.uv.u, -.07, .07), vShift = clamp(refStats.uv.v - srcStats.uv.v, -.07, .07);

    const originalY = y;
    const matchedY = lerp(globalToneMap(y, srcStats, refStats), piecewiseMap(y, srcStats, refStats), .72);
    y = lerp(y, matchedY, toneAmt);
    if (params.adaptiveTone) y = clamp01(y + adaptiveToneDeltaAt(srcStats, refStats, originalY) * params.adaptiveTone * overall);
    y = clamp01(y * expFactor);
    if (params.contrast) y = clamp01((y - .5) * (1 + params.contrast * .8) + .5);
    if (params.shadows) { const m = Math.pow(1 - y, 2.2); y = clamp01(y + params.shadows * .16 * m); }
    if (params.highlights) { const m = Math.pow(y, 2.2); y = clamp01(y + params.highlights * .13 * m); }
    y = applyHighlightRolloff(y, refStats, params.highlightRolloff * overall);
    if (params.clipProtect) {
      const p = params.clipProtect;
      if (srcStats.clippedHi > .003 || y > .92) { const shoulder = .92, over = Math.max(0, y - shoulder); y = shoulder + over / (1 + over * (5 + 6 * p)); }
      if (srcStats.crushed > .003 || y < .08) { const lift = .08 - y; if (lift > 0) y += lift * (.08 + srcStats.crushed * 3) * p * .8; }
      y = clamp01(y);
    }

    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), pixelSat = mx ? (mx - mn) / mx : 0;
    const neutralGuard = 1 - params.neutralProtect * Math.pow(1 - clamp01(pixelSat / .22), 2);
    const uMatched = refStats.uv.u + (u - srcStats.uv.u) * suRatio, vMatched = refStats.uv.v + (v - srcStats.uv.v) * svRatio;
    u = lerp(u, uMatched + uShift * .35, colorAmt * .55 * neutralGuard);
    v = lerp(v, vMatched + vShift * .35, colorAmt * .55 * neutralGuard);
    const satScale = lerp(1, satRatio, colorAmt * .45 * neutralGuard) * (1 + params.saturation * .7); u *= satScale; v *= satScale;

    if (params.threeWay) {
      const sr = toneResidualAt(srcStats, originalY), rr = toneResidualAt(refStats, originalY);
      const du = clamp(rr.u - sr.u, -.035, .035), dv = clamp(rr.v - sr.v, -.035, .035), amt = params.threeWay * overall * (.45 + .55 * neutralGuard);
      u += du * amt; v += dv * amt;
    }
    v += params.warmth * .035; u -= params.warmth * .016; u -= params.tint * .025;

    [r, g, b] = yuvToRgb(y, u, v);
    if (params.colourDensity) {
      const channelAmount = params.colourDensity * colorAmt * .22 * (1 - params.interiorProtect * neutralGuard * .22);
      r = lerp(r / 255, channelPointMap(r / 255, srcStats.rgbPoints.r, refStats.rgbPoints.r), channelAmount) * 255;
      g = lerp(g / 255, channelPointMap(g / 255, srcStats.rgbPoints.g, refStats.rgbPoints.g), channelAmount) * 255;
      b = lerp(b / 255, channelPointMap(b / 255, srcStats.rgbPoints.b, refStats.rgbPoints.b), channelAmount) * 255;
      [r, g, b] = applyReferenceColour(r, g, b, srcStats, refStats, params);
    }
    [r, g, b] = applyHslMixer(r, g, b);
    r = luts.master[luts.r[Math.round(clamp(r))]]; g = luts.master[luts.g[Math.round(clamp(g))]]; b = luts.master[luts.b[Math.round(clamp(b))]];
    if (params.grain && noise) {
      const lmask = .4 + .6 * (1 - Math.abs(originalY - .5) * 1.6), n = noise * 255 * params.grain * .065;
      r += n * lmask; g += n * lmask; b += n * lmask;
    }
    return [clamp(r), clamp(g), clamp(b)];
  }

  function detailMatchAmount(srcStats, refStats, params) {
    if (!params.detail) return 0;
    const gr = clamp(refStats.gradient / Math.max(.012, srcStats.gradient), .72, 1.35);
    const lr = clamp(refStats.laplacian / Math.max(.006, srcStats.laplacian), .72, 1.35);
    const ratio = Math.sqrt(gr * lr); return clamp((ratio - 1) * 1.15, -.34, .42) * params.detail * params.match;
  }

  function boxMean(source, w, h, radius) {
    const stride = w + 1, integral = new Float64Array(stride * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0; const srcRow = y * w, intRow = (y + 1) * stride, prevRow = y * stride;
      for (let x = 0; x < w; x++) {
        row += source[srcRow + x]; integral[intRow + x + 1] = integral[prevRow + x + 1] + row;
      }
    }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - radius), y1 = Math.min(h - 1, y + radius), top = y0 * stride, bottom = (y1 + 1) * stride;
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - radius), x1 = Math.min(w - 1, x + radius), count = (x1 - x0 + 1) * (y1 - y0 + 1);
        out[y * w + x] = (integral[bottom + x1 + 1] - integral[top + x1 + 1] - integral[bottom + x0] + integral[top + x0]) / count;
      }
    }
    return out;
  }

  function edgeAwareLuminosityBase(source, w, h) {
    const maxSide = 900, scale = Math.min(1, maxSide / Math.max(w, h));
    const lowW = Math.max(2, Math.round(w * scale)), lowH = Math.max(2, Math.round(h * scale)), lum = new Float32Array(lowW * lowH);
    for (let y = 0; y < lowH; y++) {
      const sy = Math.min(h - 1, Math.round(y * (h - 1) / Math.max(1, lowH - 1)));
      for (let x = 0; x < lowW; x++) {
        const sx = Math.min(w - 1, Math.round(x * (w - 1) / Math.max(1, lowW - 1))), i = (sy * w + sx) * 4;
        lum[y * lowW + x] = (.2126 * source[i] + .7152 * source[i + 1] + .0722 * source[i + 2]) / 255;
      }
    }
    const radius = Math.max(3, Math.min(14, Math.round(Math.min(lowW, lowH) / 85))), meanI = boxMean(lum, lowW, lowH, radius), squared = new Float32Array(lum.length);
    for (let i = 0; i < lum.length; i++) squared[i] = lum[i] * lum[i];
    const meanSquared = boxMean(squared, lowW, lowH, radius), a = new Float32Array(lum.length), b = new Float32Array(lum.length), epsilon = .0022;
    for (let i = 0; i < lum.length; i++) {
      const variance = Math.max(0, meanSquared[i] - meanI[i] * meanI[i]); a[i] = variance / (variance + epsilon); b[i] = meanI[i] * (1 - a[i]);
    }
    const meanA = boxMean(a, lowW, lowH, radius), meanB = boxMean(b, lowW, lowH, radius), base = new Float32Array(lum.length);
    for (let i = 0; i < lum.length; i++) base[i] = meanA[i] * lum[i] + meanB[i];
    return { base, lowW, lowH };
  }

  function applyDetailMatch(imageData, w, h, srcStats, refStats, params) {
    const amount = detailMatchAmount(srcStats, refStats, params);
    const localAmount = params.localDepth * params.match;
    const textureAmount = params.finishTexture * params.match;
    if ((Math.abs(amount) < .004 && localAmount < .004 && textureAmount < .004) || w < 3 || h < 3) return;
    const d = imageData.data, source = new Uint8ClampedArray(d); const lum = i => (.2126 * source[i] + .7152 * source[i + 1] + .0722 * source[i + 2]) / 255;
    const edgeBase = localAmount >= .004 ? edgeAwareLuminosityBase(source, w, h) : null;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4; if (source[i + 3] < 20) continue; const c = lum(i), l = lum(i - 4), r = lum(i + 4), u = lum(i - w * 4), b = lum(i + w * 4);
      const hp = clamp(c - (l + r + u + b) * .25, -.055, .055);
      const bx = edgeBase ? Math.round(x * (edgeBase.lowW - 1) / Math.max(1, w - 1)) : 0, by = edgeBase ? Math.round(y * (edgeBase.lowH - 1) / Math.max(1, h - 1)) : 0;
      const localHp = edgeBase ? clamp(c - edgeBase.base[by * edgeBase.lowW + bx], -.075, .075) : 0;
      const edge = Math.max(Math.abs(c - l), Math.abs(c - r), Math.abs(c - u), Math.abs(c - b)), edgeGuard = 1 - .82 * smoothstep(.045, .18, edge);
      const tonalMask = smoothstep(.035, .14, c) * (1 - smoothstep(.88, .985, c));
      const detailAdj = hp * 255 * (amount * 2.15 + textureAmount * .34);
      const depthAdj = localHp * 255 * localAmount * .78 * edgeGuard;
      const adj = (detailAdj + depthAdj) * tonalMask;
      d[i] = clamp(source[i] + adj); d[i + 1] = clamp(source[i + 1] + adj); d[i + 2] = clamp(source[i + 2] + adj);
    }
  }

  function applyFixBlueCast(imageData, params) {
    const d = imageData.data;
    const totalPixels = d.length;
    
    // Target hues between Cyan and Deep Blue (roughly 190 to 260)
    const centerBlue = 225; 

    for (let i = 0; i < totalPixels; i += 4) {
      // Ignore transparent/nearly transparent pixels
      if (d[i + 3] < 20) continue; 

      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];

      let [h, s, l] = rgbToHsl(r, g, b);

      // 1. HUE FEATHERING: Smooth falloff based on how close the pixel is to target blue
      const dist = circularDistance(h, centerBlue);
      const hueWeight = dist < 50 ? Math.pow(1 - dist / 50, 1.5) : 0;

      if (hueWeight > 0) {
        // 2. LUMINANCE FEATHERING: Protect deep shadows from turning grey
        const lumWeight = smoothstep(0.15, 0.70, l);

        // 3. SATURATION FEATHERING: Ignore pixels that are already neutral
        const satWeight = smoothstep(0.05, 0.40, s);

        // Combine weights for a butter-smooth alpha mask (0.0 to 1.0)
        const totalWeight = hueWeight * lumWeight * satWeight;

        if (totalWeight > 0.01) {
          // Smoothly reduce saturation by up to 85%, leaving a tiny bit of natural color
          s = lerp(s, s * 0.15, totalWeight * 0.9);

          // Gently shift the hue warmer (towards cyan/white) to match daylight
          h = lerp(h, 195, totalWeight * 0.5);

          // Counter the "grey-out" effect by slightly lifting the brightness of neutralized pixels
          l = lerp(l, clamp01(l + 0.04), totalWeight * 0.5);

          // Sync with the global warmth slider to blend it into the room seamlessly
          if (params && params.warmth !== undefined) {
              l = clamp01(l + (params.warmth * 0.02 * totalWeight));
          }

          // Convert back to RGB and apply
          const [nr, ng, nb] = hslToRgb(h, s, l);
          d[i] = nr;
          d[i + 1] = ng;
          d[i + 2] = nb;
        }
      }
    }
  }

  function isBlueCastEnabled() {
    const toggle = document.querySelector('.blue-cast-toggle, #blueCastToggleSidebar, #blueCastToggleExport, #blueCastToggle');
    return toggle ? toggle.checked : false;
  }


  function structuralMapsPayload(target = activeTarget()) {
    if (!refs.structuralToggle?.checked || !target?.structuralMaps) return null;
    return {
      controlnet: {
        canny: target.structuralMaps.cannyDataUrl,
        depth: target.structuralMaps.depthDataUrl,
        model: 'depth-anything/Depth-Anything-V2-Small-hf',
        enabled: true
      }
    };
  }

  function drawImageToCanvas(canvas, img, maxSize = 512) {
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return ctx;
  }

  function extractCannyBrowser(img) {
    const canvas = document.createElement('canvas'), ctx = drawImageToCanvas(canvas, img);
    if (window.cv?.Canny) {
      const src = cv.imread(canvas), gray = new cv.Mat(), blurred = new cv.Mat(), edges = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 1.2, 1.2, cv.BORDER_DEFAULT); cv.Canny(blurred, edges, 100, 200); cv.imshow(canvas, edges);
      src.delete(); gray.delete(); blurred.delete(); edges.delete();
      return canvas;
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height), d = imageData.data, out = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 1; y < canvas.height - 1; y++) for (let x = 1; x < canvas.width - 1; x++) {
      const i = (y * canvas.width + x) * 4, lum = j => .299 * d[j] + .587 * d[j + 1] + .114 * d[j + 2];
      const gx = -lum(i - canvas.width * 4 - 4) + lum(i - canvas.width * 4 + 4) - 2 * lum(i - 4) + 2 * lum(i + 4) - lum(i + canvas.width * 4 - 4) + lum(i + canvas.width * 4 + 4);
      const gy = -lum(i - canvas.width * 4 - 4) - 2 * lum(i - canvas.width * 4) - lum(i - canvas.width * 4 + 4) + lum(i + canvas.width * 4 - 4) + 2 * lum(i + canvas.width * 4) + lum(i + canvas.width * 4 + 4);
      const v = Math.hypot(gx, gy) > 100 ? 255 : 0; out.data[i] = out.data[i + 1] = out.data[i + 2] = v; out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0); return canvas;
  }

  function extractDepthPreviewBrowser(img) {
    const canvas = document.createElement('canvas'), ctx = drawImageToCanvas(canvas, img);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height), d = imageData.data;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4, luma = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2], vertical = 255 * (1 - y / Math.max(1, canvas.height - 1));
      const v = clamp(luma * .55 + vertical * .45); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0); return canvas;
  }

  function copyCanvas(src, dest) {
    dest.width = src.width; dest.height = src.height; dest.getContext('2d').drawImage(src, 0, 0);
  }

  function updateStructuralMaps() {
    const target = activeTarget();
    if (!refs.structuralToggle?.checked) { refs.structuralPreview?.classList.add('hidden'); return; }
    refs.structuralPreview?.classList.remove('hidden');
    if (!target) { refs.structuralStatus.textContent = 'Load a target to generate maps'; return; }
    refs.structuralStatus.textContent = 'Generating…';
    clearTimeout(state.structuralTimer);
    state.structuralTimer = setTimeout(() => {
      try {
        const canny = extractCannyBrowser(target.img), depth = extractDepthPreviewBrowser(target.img);
        copyCanvas(canny, refs.cannyCanvas); copyCanvas(depth, refs.depthCanvas);
        target.structuralMaps = { cannyDataUrl: canny.toDataURL('image/png'), depthDataUrl: depth.toDataURL('image/png') };
        target.controlNetPayload = structuralMapsPayload(target);
        refs.structuralStatus.textContent = 'Generated and attached to pipeline payload';
      } catch (err) {
        console.warn('Structural map extraction failed:', err);
        refs.structuralStatus.textContent = 'Map extraction failed; using standard pipeline';
        target.structuralMaps = null; target.controlNetPayload = null;
      }
    }, 20);
  }

  function processPixels(imageData, w, h, srcStats, refStats, params) {
    const d = imageData.data, luts = { master: curveLUT(state.curves.master), r: curveLUT(state.curves.r), g: curveLUT(state.curves.g), b: curveLUT(state.curves.b) };
    let seed = 1337; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - .5; };
    for (let y = 0; y < h; y++) {
      const ny = h > 1 ? y / (h - 1) : .5;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4; if (d[i + 3] < 20) continue; const [r, g, b] = transformRGB(d[i], d[i + 1], d[i + 2], srcStats, refStats, params, luts, params.grain ? rand() : 0, w > 1 ? x / (w - 1) : .5, ny);
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
    applyDetailMatch(imageData, w, h, srcStats, refStats, params);
    
    if (isBlueCastEnabled()) {
      applyFixBlueCast(imageData, params);
    }
    return imageData;
  }

  function drawPreview() {
    const target = activeTarget(); if (!target || !state.referenceStats) return;
    renderTargetDiagnosis(target); syncTrimControls(); updateStructuralMaps();
    const max = state.previewMax, scale = Math.min(1, max / Math.max(target.img.naturalWidth, target.img.naturalHeight));
    const w = Math.round(target.img.naturalWidth * scale), h = Math.round(target.img.naturalHeight * scale);
    [refs.beforeCanvas, refs.afterCanvas].forEach(c => { c.width = w; c.height = h; });
    const bctx = refs.beforeCanvas.getContext('2d', { willReadFrequently: true }), actx = refs.afterCanvas.getContext('2d', { willReadFrequently: true });
    bctx.drawImage(target.img, 0, 0, w, h); actx.drawImage(target.img, 0, 0, w, h);
    const data = actx.getImageData(0, 0, w, h); processPixels(data, w, h, target.stats, state.referenceStats, getParams(target)); actx.putImageData(data, 0, 0);
    state.afterStats = analyzeImageData(data, w, h); drawHistogram(refs.targetHistogram, target.stats.hist, 'y', state.afterStats.hist);
    refs.compareWrap.classList.remove('updating');
    const exportMode = refs.upscale2x.checked ? 'AI Super-Resolution on export' : 'export keeps original resolution';
    const controlNetNote = structuralMapsPayload(target) ? ' • ControlNet Canny + Depth maps attached' : '';
    refs.resultNote.textContent = `Automatic ${capitalize(state.finishPreset)} finish • Edge-aware luminosity${controlNetNote} • Target ${state.targets.indexOf(target) + 1} of ${state.targets.length} • AFTER is on the right • ${exportMode}`;
    updateBatchSummary(); syncCompareSize(); drawCurve();
  }

  function scheduleProcess() {
    clearTimeout(state.processTimer);
    refs.compareWrap.classList.add('updating');
    state.processTimer = setTimeout(() => { if (state.referenceStats && activeTarget()) drawPreview(); }, 120);
  }
  function syncCompareSize() {
    const c = refs.beforeCanvas; if (!c.width) return;
    requestAnimationFrame(() => {
      const rect = c.getBoundingClientRect(), wrap = refs.compareWrap.getBoundingClientRect(); refs.afterCanvas.style.position = 'absolute';
      refs.afterCanvas.style.left = (rect.left - wrap.left) + 'px'; refs.afterCanvas.style.top = (rect.top - wrap.top) + 'px'; refs.afterCanvas.style.width = rect.width + 'px'; refs.afterCanvas.style.height = rect.height + 'px';
    });
  }

  function updateBatchSummary() {
    const tuned = state.targets.filter(t => t.tuned).length;
    refs.batchSummary.textContent = `${state.targets.length} target${state.targets.length === 1 ? '' : 's'} • ${tuned} auto-finished`;
  }

  function syncTrimControls() {
    const t = activeTarget(), c = t?.correction || defaultCorrection();
    controls.trimExposure.value = c.exposure; controls.trimContrast.value = c.contrast; controls.trimWarmth.value = c.warmth; controls.trimTint.value = c.tint; updateOutputs();
  }

  function writeTrimFromControls() {
    const t = activeTarget(); if (!t) return;
    const c = { exposure: +controls.trimExposure.value, contrast: +controls.trimContrast.value, warmth: +controls.trimWarmth.value, tint: +controls.trimTint.value };
    t.correction = c; t.tuned = false;
    renderTargetStrip(); updateBatchSummary(); scheduleProcess();
  }

  function autoTuneTarget(target) {
    if (!target || !state.referenceStats) return;
    const r = state.referenceStats, t = target.stats;
    const medianEv = Math.log2((r.p50 + .035) / (t.p50 + .035));
    const contrastRatio = r.stdY / Math.max(.08, t.stdY);
    const tempDelta = r.temperature - t.temperature, tintDelta = r.tint - t.tint;
    target.correction = {
      exposure: Math.round(clamp(medianEv * 18, -18, 18)),
      contrast: Math.round(clamp((contrastRatio - 1) * 14, -10, 10)),
      warmth: Math.round(clamp(tempDelta * 180, -12, 12)),
      tint: Math.round(clamp(tintDelta * 170, -10, 10))
    };
    target.tuned = true;
  }

  function autoTuneCurrent() {
    const t = activeTarget(); if (!t) return; autoTuneTarget(t);
    syncTrimControls(); renderTargetStrip(); drawPreview();
  }

  function autoTuneAll() {
    if (!state.referenceStats) return;
    for (const t of state.targets) autoTuneTarget(t);
    syncTrimControls(); renderTargetStrip(); drawPreview();
  }

  function resetCurrentCorrection() {
    const t = activeTarget(); if (!t) return; t.correction = defaultCorrection(); t.tuned = false;
    syncTrimControls(); renderTargetStrip(); drawPreview();
  }

  function setActiveTarget(id, shouldScroll = false) {
    if (!state.targets.some(t => t.id === id)) return;
    state.activeTargetId = id; renderTargetStrip(); syncTrimControls(); if (state.referenceStats) drawPreview();
    if (shouldScroll) refs.compareWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function selectRelative(delta) {
    if (!state.targets.length) return; const current = state.targets.findIndex(t => t.id === state.activeTargetId); const next = (Math.max(0, current) + delta + state.targets.length) % state.targets.length; setActiveTarget(state.targets[next].id);
  }

  function renderTargetStack() {
    refs.targetStack.innerHTML = '';
    const recent = state.targets.slice(-3);
    recent.forEach(t => { const img = document.createElement('img'); img.src = t.url; img.alt = ''; refs.targetStack.appendChild(img); });
    if (state.targets.length) {
      const count = document.createElement('span'); count.className = 'stack-count'; count.textContent = `${state.targets.length} target${state.targets.length === 1 ? '' : 's'}`; refs.targetStack.appendChild(count);
      refs.targetDrop.querySelector('.dropzone').classList.add('has-targets'); refs.targetUploadFooter.classList.remove('hidden');
    } else {
      refs.targetDrop.querySelector('.dropzone').classList.remove('has-targets'); refs.targetUploadFooter.classList.add('hidden');
    }
    refs.targetCountLabel.textContent = `${state.targets.length} target${state.targets.length === 1 ? '' : 's'} loaded`;
  }

  function renderTargetStrip() {
    refs.targetStrip.innerHTML = '';
    state.targets.forEach((t, index) => {
      const item = document.createElement('div'); item.className = `target-thumb${t.id === state.activeTargetId ? ' active' : ''}${t.tuned ? ' tuned' : ''}`; item.tabIndex = 0; item.setAttribute('role', 'button'); item.setAttribute('aria-label', `Open ${t.name}`);
      item.innerHTML = `<img src="${t.url}" alt=""><span class="thumb-status" title="${t.tuned ? 'Auto tuned' : 'Not auto tuned'}"></span><button class="thumb-remove" type="button" aria-label="Remove target">×</button><span class="thumb-label">${index + 1}. ${escapeHtml(t.name)}</span>`;
      item.addEventListener('click', e => { if (!e.target.classList.contains('thumb-remove')) setActiveTarget(t.id); });
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTarget(t.id); } });
      item.querySelector('.thumb-remove').addEventListener('click', e => { e.stopPropagation(); removeTarget(t.id); });
      refs.targetStrip.appendChild(item);
    });
    updateBatchSummary(); renderTargetStack();
  }

  function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }

  function removeTarget(id) {
    const idx = state.targets.findIndex(t => t.id === id); if (idx < 0) return;
    const [removed] = state.targets.splice(idx, 1); if (removed?.url) URL.revokeObjectURL(removed.url);
    if (state.activeTargetId === id) state.activeTargetId = state.targets[Math.min(idx, state.targets.length - 1)]?.id || null;
    renderTargetStrip(); updateStructuralMaps();
    if (!state.targets.length) { refs.workspace.classList.add('hidden'); refs.beforeCanvas.width = refs.afterCanvas.width = 0; }
    else if (state.referenceStats) drawPreview();
  }

  function showWorkspaceIfReady(scroll = false) {
    if (state.targets.length && state.referenceStats) {
      for (const target of state.targets) if (!target.tuned) autoTuneTarget(target);
      refs.workspace.classList.remove('hidden'); renderReferenceAnalysis(state.referenceStats); renderTargetStrip(); drawPreview();
      if (scroll) setTimeout(() => refs.workspace.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }

  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => resolve({ img, url }); img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not load ${file.name}`)); }; img.src = url;
    });
  }

  function renderReferenceStack() {
    refs.referenceStack.innerHTML = ''; const recent = state.references.slice(-3); recent.forEach(r => { const img = document.createElement('img'); img.src = r.url; img.alt = ''; refs.referenceStack.appendChild(img); });
    const countValue = state.references.length || state.referenceStats?.referenceCount || 0;
    if (countValue || state.loadedProfile) {
      const count = document.createElement('span'); count.className = 'stack-count'; count.textContent = state.loadedProfile && !state.references.length ? `Saved profile • ${countValue || 1} ref${countValue === 1 ? '' : 's'}` : `${countValue} reference${countValue === 1 ? '' : 's'}`; refs.referenceStack.appendChild(count);
      refs.referenceDrop.querySelector('.dropzone').classList.add('has-references'); refs.referenceUploadFooter.classList.remove('hidden');
    } else { refs.referenceDrop.querySelector('.dropzone').classList.remove('has-references'); refs.referenceUploadFooter.classList.add('hidden'); }
    refs.referenceCountLabel.textContent = state.loadedProfile && !state.references.length ? `Saved profile loaded • ${countValue || 1} reference${countValue === 1 ? '' : 's'}` : `${countValue} reference${countValue === 1 ? '' : 's'} loaded`;
  }

  function rebuildReferenceProfile(scroll = false) {
    state.referenceStats = aggregateReferenceStats(state.references.map(r => r.stats)); state.loadedProfile = null; for (const t of state.targets) { t.correction = defaultCorrection(); t.tuned = false; }
    renderReferenceStack(); if (state.referenceStats) renderReferenceAnalysis(state.referenceStats); renderTargetStrip(); showWorkspaceIfReady(scroll);
  }

  function clearReferences() {
    for (const r of state.references) if (r.url) URL.revokeObjectURL(r.url); state.references = []; state.referenceStats = null; state.loadedProfile = null; refs.referenceInput.value = ''; renderReferenceStack(); refs.workspace.classList.add('hidden');
  }

  async function loadReferenceFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/')); if (!files.length) return; if (state.loadedProfile && !state.references.length) { state.referenceStats = null; state.loadedProfile = null; }
    const existing = new Set(state.references.map(r => `${r.name}|${r.size}|${r.lastModified}`)); let added = 0;
    for (const file of files) { const key = `${file.name}|${file.size}|${file.lastModified}`; if (existing.has(key)) continue; try { const { img, url } = await loadImageElement(file); const stats = hydrateStats(analyzeImage(img)); state.references.push({ id: `r${++state.referenceSeq}`, name: file.name, size: file.size, lastModified: file.lastModified, img, url, stats }); existing.add(key); added++; } catch (err) { console.warn(err); } }
    refs.referenceInput.value = ''; if (added) rebuildReferenceProfile(true); else renderReferenceStack();
  }

  async function loadTargetFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    const existing = new Set(state.targets.map(t => `${t.name}|${t.size}|${t.lastModified}`));
    let added = 0;
    for (const file of files) {
      const key = `${file.name}|${file.size}|${file.lastModified}`; if (existing.has(key)) continue;
      try {
        const { img, url } = await loadImageElement(file); const stats = hydrateStats(analyzeImage(img));
        const target = { id: `t${++state.targetSeq}`, name: file.name, size: file.size, lastModified: file.lastModified, img, url, stats, correction: defaultCorrection(), tuned: false };
        state.targets.push(target); existing.add(key); added++; if (!state.activeTargetId) state.activeTargetId = target.id;
      } catch (err) { console.warn(err); }
    }
    refs.targetInput.value = ''; renderTargetStrip(); showWorkspaceIfReady(added > 0 && !!state.referenceStats);
  }

  function bindDrop(card, input, kind) {
    ['dragenter', 'dragover'].forEach(ev => card.addEventListener(ev, e => { e.preventDefault(); card.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => card.addEventListener(ev, e => { e.preventDefault(); card.classList.remove('drag'); }));
    card.addEventListener('drop', e => kind === 'reference' ? loadReferenceFiles(e.dataTransfer.files) : loadTargetFiles(e.dataTransfer.files));
    input.addEventListener('change', () => kind === 'reference' ? loadReferenceFiles(input.files) : loadTargetFiles(input.files));
  }

  function setPasteDestination(kind, announce = true) {
    state.pasteDestination = kind === 'target' ? 'target' : 'reference';
    const isReference = state.pasteDestination === 'reference';
    refs.referenceDrop.classList.toggle('paste-active', isReference);
    refs.targetDrop.classList.toggle('paste-active', !isReference);
    refs.pasteToReferencesBtn.setAttribute('aria-pressed', String(isReference));
    refs.pasteToTargetsBtn.setAttribute('aria-pressed', String(!isReference));
    refs.pasteDestinationLabel.textContent = isReference ? 'References' : 'Targets';
    if (announce) {
      refs.pasteHelper.classList.remove('paste-success');
      refs.pasteHelper.classList.add('paste-ready');
      setTimeout(() => refs.pasteHelper.classList.remove('paste-ready'), 900);
    }
  }

  function pastedImageFiles(event) {
    const files = [];
    const clipboard = event.clipboardData;
    if (!clipboard) return files;
    for (const item of Array.from(clipboard.items || [])) {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
      const blob = item.getAsFile();
      if (!blob) continue;
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png';
      files.push(new File([blob], `pasted-screenshot-${++state.pasteSeq}.${ext}`, { type: blob.type || 'image/png', lastModified: Date.now() }));
    }
    if (!files.length) {
      for (const file of Array.from(clipboard.files || [])) if (file.type.startsWith('image/')) files.push(file);
    }
    return files;
  }

  async function handlePaste(event) {
    const el = event.target;
    if (el?.matches?.('input:not([type="range"]), textarea, [contenteditable="true"]')) return;
    const files = pastedImageFiles(event);
    if (!files.length) return;
    event.preventDefault();
    const destination = state.pasteDestination;
    if (destination === 'reference') await loadReferenceFiles(files);
    else await loadTargetFiles(files);
    refs.pasteHelper.classList.remove('paste-ready');
    refs.pasteHelper.classList.add('paste-success');
    refs.pasteDestinationLabel.textContent = destination === 'reference' ? 'References — pasted' : 'Targets — pasted';
    setTimeout(() => {
      refs.pasteHelper.classList.remove('paste-success');
      refs.pasteDestinationLabel.textContent = state.pasteDestination === 'reference' ? 'References' : 'Targets';
    }, 1600);
  }

  function initHsl() {
    refs.hslMixer.innerHTML = HSL_BANDS.map(([name, h]) => `<div class="hsl-row"><div class="hsl-name"><span class="swatch" style="--h:${h}"></span>${name}</div>${['h','s','l'].map(k => `<div class="hsl-control"><input type="range" data-band="${name}" data-kind="${k}" min="${k === 'h' ? -30 : -50}" max="${k === 'h' ? 30 : 50}" value="0"><output>0</output></div>`).join('')}</div>`).join('');
    refs.hslMixer.querySelectorAll('input').forEach(el => el.addEventListener('input', () => { state.hsl[el.dataset.band][el.dataset.kind] = +el.value; el.nextElementSibling.value = el.value; scheduleProcess(); }));
  }

  function drawCurve() {
    const c = refs.curveCanvas, ctx = c.getContext('2d'), w = c.width, h = c.height, pad = 18, iw = w - pad * 2, ih = h - pad * 2;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#10100e'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#292923'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const x = pad + iw * i / 4, y = pad + ih * i / 4; ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke(); ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke(); }
    const ys = state.curves[state.activeCurve], stroke = state.activeCurve === 'r' ? '#e78383' : state.activeCurve === 'g' ? '#83d99a' : state.activeCurve === 'b' ? '#86a9ee' : '#d8f077';
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 128; i++) { const xNorm = i / 128, yNorm = evalCurve(xNorm, ys), x = pad + xNorm * iw, y = pad + (1 - yNorm) * ih; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    for (let i = 0; i < 5; i++) { const x = pad + curveXs[i] * iw, y = pad + (1 - ys[i]) * ih; ctx.fillStyle = '#11110f'; ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, i === 0 || i === 4 ? 4 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }

  function curvePointFromEvent(e) {
    const rect = refs.curveCanvas.getBoundingClientRect(), sx = refs.curveCanvas.width / rect.width, sy = refs.curveCanvas.height / rect.height, pad = 18, iw = refs.curveCanvas.width - pad * 2, ih = refs.curveCanvas.height - pad * 2;
    const x = (e.clientX - rect.left) * sx, y = (e.clientY - rect.top) * sy, ys = state.curves[state.activeCurve]; let best = -1, dist = 1e9;
    for (let i = 1; i < 4; i++) { const px = pad + curveXs[i] * iw, py = pad + (1 - ys[i]) * ih, d = Math.hypot(x - px, y - py); if (d < dist) { dist = d; best = i; } }
    return { best, dist, yNorm: clamp01(1 - (y - pad) / ih) };
  }

  function updateCurveDrag(e) {
    if (state.dragPoint < 1) return;
    const rect = refs.curveCanvas.getBoundingClientRect(), sy = refs.curveCanvas.height / rect.height, pad = 18, ih = refs.curveCanvas.height - pad * 2, y = (e.clientY - rect.top) * sy;
    const ys = state.curves[state.activeCurve], i = state.dragPoint, min = ys[i - 1] + .01, max = ys[i + 1] - .01; ys[i] = clamp(1 - (y - pad) / ih, min, max); drawCurve(); scheduleProcess();
  }

  function resetCurves() { state.curves = { master: defaultCurve(), r: defaultCurve(), g: defaultCurve(), b: defaultCurve() }; drawCurve(); }
  function resetHsl() {
    for (const [name] of HSL_BANDS) state.hsl[name] = { h: 0, s: 0, l: 0 };
    refs.hslMixer.querySelectorAll('input').forEach(el => { el.value = 0; el.nextElementSibling.value = 0; });
  }
  function syncHslUI() { refs.hslMixer.querySelectorAll('input').forEach(el => { const v = state.hsl?.[el.dataset.band]?.[el.dataset.kind] ?? 0; el.value = v; el.nextElementSibling.value = v; }); }

  function resetSharedEdits() {
    const defs = { ...FINISH_PRESETS.natural, exposure: 0, contrast: 0, shadows: 0, highlights: 0, warmth: 0, tint: 0, saturation: 0, grain: 0 };
    delete defs.label;
    for (const [id, v] of Object.entries(defs)) controls[id].value = v;
    state.finishPreset = 'natural'; document.querySelectorAll('.finish-preset').forEach(button => button.classList.toggle('active', button.dataset.preset === 'natural')); refs.finishPresetLabel.textContent = FINISH_PRESETS.natural.label;
    resetCurves(); resetHsl(); updateOutputs(); drawPreview();
  }

  let picaResizer = null;
  function outputCanvasLimit() { return matchMedia('(max-width: 720px), (pointer: coarse)').matches ? 40000000 : 100000000; }
  function validateUpscaleSize(w, h) {
    const outW = w * 2, outH = h * 2, pixels = outW * outH;
    if (outW > 16384 || outH > 16384 || pixels > outputCanvasLimit()) {
      throw new Error(`2x Upscale would create a ${outW.toLocaleString()} × ${outH.toLocaleString()} image, which is too large for this browser. Turn off 2x Upscale and export at the original resolution.`);
    }
  }
  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed.')), type, quality));
  }

  async function renderFullTargetBlob(target, type, quality = 1, upscale = false, onProgress = null) {
    const w = target.img.naturalWidth, h = target.img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(target.img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h); processPixels(data, w, h, target.stats, state.referenceStats, getParams(target)); ctx.putImageData(data, 0, 0);
    if (!upscale) return canvasBlob(c, type, quality);
    if (!window.AIUpscaler) throw new Error('AI Super-Resolution engine not loaded. Please reload the page.');
    const out = await window.AIUpscaler.upscaleCanvas(c, onProgress);
    c.width = 1; c.height = 1;
    return canvasBlob(out, type, quality);
  }

  async function exportCurrent(type, quality = 1) {
    const target = activeTarget(); if (!target || !state.referenceStats) return;
    const btn = type === 'image/png' ? refs.exportBtn : refs.exportJpgBtn, old = btn.textContent; btn.disabled = true; btn.textContent = 'Processing…';
    const upscale = refs.upscale2x.checked;
    if (upscale) {
      refs.batchProgress.classList.remove('hidden');
      refs.batchProgressBar.style.width = '0%';
      refs.batchProgressText.textContent = 'Initializing AI Super-Resolution…';
    }
    try {
      await new Promise(r => setTimeout(r, 20));
      const blob = await renderFullTargetBlob(target, type, quality, upscale, (pct, text) => {
        if (upscale) {
          refs.batchProgressBar.style.width = `${pct}%`;
          refs.batchProgressText.textContent = text;
        }
      });
      const ext = type === 'image/png' ? 'png' : 'jpg', suffix = upscale ? '_4x_ai' : '';
      downloadBlob(blob, `${cleanBaseName(target.name)}_colour-match-v5${suffix}.${ext}`);
    } catch (err) { alert(err.message); }
    finally {
      btn.disabled = false; btn.textContent = old;
      if (upscale) setTimeout(() => refs.batchProgress.classList.add('hidden'), 2200);
    }
  }

  function exportLut() {
    const target = activeTarget(); if (!state.referenceStats || !target) return;
    const size = 32, params = { ...getParams(target), grain: 0, detail: 0 }, luts = { master: curveLUT(state.curves.master), r: curveLUT(state.curves.r), g: curveLUT(state.curves.g), b: curveLUT(state.curves.b) };
    let out = `TITLE "Colour Match v5 — ${cleanBaseName(target.name)}"\nLUT_3D_SIZE ${size}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n`;
    for (let bz = 0; bz < size; bz++) for (let gy = 0; gy < size; gy++) for (let rx = 0; rx < size; rx++) {
      const r = rx / (size - 1) * 255, g = gy / (size - 1) * 255, b = bz / (size - 1) * 255;
      const [R, G, B] = transformRGB(r, g, b, target.stats, state.referenceStats, params, luts, 0, .5, .5); out += `${(R / 255).toFixed(6)} ${(G / 255).toFixed(6)} ${(B / 255).toFixed(6)}\n`;
    }
    downloadBlob(new Blob([out], { type: 'text/plain' }), `${cleanBaseName(target.name)}_colour-match-v5.cube`);
    refs.resultNote.textContent = 'LUT exported for the active target. Local depth, texture and grain are excluded because a 3D LUT cannot encode spatial adjustments.';
  }

  function serializeStats(s) {
    const copy = cloneDeep({ ...s, hist: undefined }); delete copy.hist; return copy;
  }

  function saveProfile() {
    if (!state.referenceStats) return;
    const profile = {
      version: 5, app: 'Colour Match', createdAt: new Date().toISOString(), finishPreset: state.finishPreset,
      referenceStats: serializeStats(state.referenceStats),
      controls: Object.fromEntries(sharedControlIds.map(id => [id, +controls[id].value])),
      descriptor: descriptor(state.referenceStats), curves: state.curves, hsl: state.hsl,
      notes: { multiReferenceMedianProfile: true, adaptiveToneEqualizer: true, detailMatch: true, threeWayResidualTransfer: true, automaticEditorialFinish: true, referenceColourDensity: true, highlightRolloff: true, localDepth: true }
    };
    downloadBlob(new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }), 'colour-match-v5-profile.json');
  }

  async function loadProfile() {
    const file = refs.loadProfileInput.files?.[0]; if (!file) return;
    try {
      const p = JSON.parse(await file.text()); if (!p.referenceStats) throw new Error('Invalid Colour Match profile.');
      for (const r of state.references) if (r.url) URL.revokeObjectURL(r.url); state.references = []; state.referenceStats = hydrateStats(p.referenceStats); state.loadedProfile = p;
      const defaults = FINISH_PRESETS.natural; for (const [id,v] of Object.entries(defaults)) if (controls[id]) controls[id].value = v;
      if (p.controls) for (const [id, v] of Object.entries(p.controls)) if (controls[id]) controls[id].value = v;
      state.finishPreset = FINISH_PRESETS[p.finishPreset] ? p.finishPreset : 'natural'; document.querySelectorAll('.finish-preset').forEach(button => button.classList.toggle('active', button.dataset.preset === state.finishPreset)); refs.finishPresetLabel.textContent = FINISH_PRESETS[state.finishPreset].label;
      if (p.curves) state.curves = p.curves; if (p.hsl) state.hsl = p.hsl;
      updateOutputs(); syncHslUI(); renderReferenceStack(); renderReferenceAnalysis(state.referenceStats); drawCurve(); refs.loadProfileInput.value = '';
      for (const t of state.targets) { t.correction = defaultCorrection(); t.tuned = false; } renderTargetStrip(); showWorkspaceIfReady(true);
    } catch (err) { alert(err.message || 'That file does not look like a Colour Match profile.'); }
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
    return table;
  })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear()), dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosTime, dosDate };
  }
  function writeU16(view, offset, value) { view.setUint16(offset, value, true); }
  function writeU32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

  function buildZip(files) {
    const encoder = new TextEncoder(), { dosTime, dosDate } = dosDateTime(), locals = [], centrals = [];
    let offset = 0, centralSize = 0;
    for (const file of files) {
      const name = encoder.encode(file.name), data = file.data, crc = crc32(data), local = new Uint8Array(30 + name.length + data.length), lv = new DataView(local.buffer);
      writeU32(lv, 0, 0x04034b50); writeU16(lv, 4, 20); writeU16(lv, 6, 0); writeU16(lv, 8, 0); writeU16(lv, 10, dosTime); writeU16(lv, 12, dosDate); writeU32(lv, 14, crc); writeU32(lv, 18, data.length); writeU32(lv, 22, data.length); writeU16(lv, 26, name.length); writeU16(lv, 28, 0); local.set(name, 30); local.set(data, 30 + name.length); locals.push(local);
      const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
      writeU32(cv, 0, 0x02014b50); writeU16(cv, 4, 20); writeU16(cv, 6, 20); writeU16(cv, 8, 0); writeU16(cv, 10, 0); writeU16(cv, 12, dosTime); writeU16(cv, 14, dosDate); writeU32(cv, 16, crc); writeU32(cv, 20, data.length); writeU32(cv, 24, data.length); writeU16(cv, 28, name.length); writeU16(cv, 30, 0); writeU16(cv, 32, 0); writeU16(cv, 34, 0); writeU16(cv, 36, 0); writeU32(cv, 38, 0); writeU32(cv, 42, offset); central.set(name, 46); centrals.push(central);
      offset += local.length; centralSize += central.length;
    }
    const end = new Uint8Array(22), ev = new DataView(end.buffer); writeU32(ev, 0, 0x06054b50); writeU16(ev, 4, 0); writeU16(ev, 6, 0); writeU16(ev, 8, files.length); writeU16(ev, 10, files.length); writeU32(ev, 12, centralSize); writeU32(ev, 16, offset); writeU16(ev, 20, 0);
    return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
  }

  async function exportAllZip() {
    if (!state.referenceStats || !state.targets.length) return;
    const type = refs.batchFormat.value, ext = type === 'image/png' ? 'png' : 'jpg', quality = type === 'image/jpeg' ? .94 : 1, upscale = refs.upscale2x.checked;
    const old = refs.exportAllBtn.textContent; refs.exportAllBtn.disabled = true; refs.exportAllBtn.textContent = 'Processing…'; refs.batchProgress.classList.remove('hidden');
    const files = [], usedNames = new Map();
    try {
      for (let i = 0; i < state.targets.length; i++) {
        const target = state.targets[i];
        if (!upscale) {
          const pct = Math.round(i / state.targets.length * 100);
          refs.batchProgressBar.style.width = `${pct}%`;
          refs.batchProgressText.textContent = `Processing ${i + 1} of ${state.targets.length}: ${target.name}`;
        }
        await new Promise(r => setTimeout(r, 16));
        const blob = await renderFullTargetBlob(target, type, quality, upscale, (pct, text) => {
          if (upscale) {
            const overallPct = Math.round(((i + pct / 100) / state.targets.length) * 100);
            refs.batchProgressBar.style.width = `${overallPct}%`;
            refs.batchProgressText.textContent = `Target ${i + 1}/${state.targets.length}: ${text}`;
          }
        });
        const data = new Uint8Array(await blob.arrayBuffer());
        const base = cleanBaseName(target.name); const count = (usedNames.get(base) || 0) + 1; usedNames.set(base, count); const suffix = count > 1 ? `-${count}` : '';
        files.push({ name: `${base}${suffix}_colour-match-v5${upscale ? '_4x_ai' : ''}.${ext}`, data });
      }
      refs.batchProgressBar.style.width = '100%'; refs.batchProgressText.textContent = 'Packaging ZIP…'; await new Promise(r => setTimeout(r, 20));
      downloadBlob(buildZip(files), `colour-match-v5-${state.targets.length}-targets${upscale ? '-4x-ai' : ''}.zip`); refs.batchProgressText.textContent = `Done • ${state.targets.length} files exported`;
    } catch (err) { alert(`Batch export failed: ${err.message}`); }
    finally { refs.exportAllBtn.disabled = false; refs.exportAllBtn.textContent = old; setTimeout(() => refs.batchProgress.classList.add('hidden'), 2200); }
  }

  function setPreviewMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.seg').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    if (mode === 'split') { refs.afterLayer.style.width = '100%'; refs.afterLayer.style.clipPath = `inset(0 0 0 ${refs.splitSlider.value}%)`; refs.afterLayer.style.display = 'grid'; refs.splitLine.style.display = 'block'; refs.splitSlider.style.display = 'block'; document.querySelector('.before-badge').style.display = 'block'; document.querySelector('.after-badge').style.display = 'block'; }
    else if (mode === 'before') { refs.afterLayer.style.display = 'none'; refs.splitLine.style.display = 'none'; refs.splitSlider.style.display = 'none'; document.querySelector('.after-badge').style.display = 'none'; document.querySelector('.before-badge').style.display = 'block'; }
    else { refs.afterLayer.style.display = 'grid'; refs.afterLayer.style.width = '100%'; refs.afterLayer.style.clipPath = 'none'; refs.splitLine.style.display = 'none'; refs.splitSlider.style.display = 'none'; document.querySelector('.before-badge').style.display = 'none'; document.querySelector('.after-badge').style.display = 'block'; }
  }

  bindDrop(refs.referenceDrop, refs.referenceInput, 'reference'); bindDrop(refs.targetDrop, refs.targetInput, 'target'); setPasteDestination('reference', false); initHsl(); applyFinishPreset('natural', false); drawCurve(); renderReferenceStack();
  document.querySelectorAll('.finish-preset').forEach(button => button.addEventListener('click', () => applyFinishPreset(button.dataset.preset)));
  sharedControlIds.forEach(id => controls[id].addEventListener('input', () => { updateOutputs(); scheduleProcess(); }));
  trimControlIds.forEach(id => controls[id].addEventListener('input', () => { updateOutputs(); writeTrimFromControls(); }));
  refs.splitSlider.addEventListener('input', () => { refs.afterLayer.style.width = '100%'; refs.afterLayer.style.clipPath = `inset(0 0 0 ${refs.splitSlider.value}%)`; refs.splitLine.style.left = refs.splitSlider.value + '%'; });
  document.querySelectorAll('.seg').forEach(btn => btn.addEventListener('click', () => setPreviewMode(btn.dataset.mode)));
  document.querySelectorAll('.curve-tab').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('.curve-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); state.activeCurve = btn.dataset.channel; drawCurve(); }));
  refs.curveCanvas.addEventListener('pointerdown', e => { const p = curvePointFromEvent(e); if (p.dist < 34) { state.dragPoint = p.best; refs.curveCanvas.setPointerCapture(e.pointerId); updateCurveDrag(e); } });
  refs.curveCanvas.addEventListener('pointermove', e => { if (state.dragPoint >= 1) updateCurveDrag(e); }); refs.curveCanvas.addEventListener('pointerup', () => { state.dragPoint = -1; }); refs.curveCanvas.addEventListener('pointercancel', () => { state.dragPoint = -1; });
  refs.resetCurveBtn.addEventListener('click', () => { resetCurves(); scheduleProcess(); }); refs.autoTuneBtn.addEventListener('click', autoTuneCurrent); refs.autoTuneAllBtn.addEventListener('click', autoTuneAll);
  refs.mobileAutoTuneBtn.addEventListener('click', autoTuneCurrent); refs.mobileAutoTuneAllBtn.addEventListener('click', autoTuneAll);
  refs.resetBtn.addEventListener('click', resetSharedEdits); refs.resetCurrentBtn.addEventListener('click', resetCurrentCorrection);
  if (refs.newTargetBtn) refs.newTargetBtn.addEventListener('click', () => refs.targetInput.click()); if (refs.addTargetsBtn) refs.addTargetsBtn.addEventListener('click', () => refs.targetInput.click()); if (refs.newReferenceBtn) refs.newReferenceBtn.addEventListener('click', () => refs.referenceInput.click()); if (refs.addReferencesBtn) refs.addReferencesBtn.addEventListener('click', () => refs.referenceInput.click()); if (refs.clearReferencesBtn) refs.clearReferencesBtn.addEventListener('click', clearReferences);
  refs.prevTargetBtn.addEventListener('click', () => selectRelative(-1)); refs.nextTargetBtn.addEventListener('click', () => selectRelative(1));
  refs.exportBtn.addEventListener('click', () => exportCurrent('image/png')); refs.exportJpgBtn.addEventListener('click', () => exportCurrent('image/jpeg', .94)); refs.exportAllBtn.addEventListener('click', exportAllZip); refs.exportLutBtn.addEventListener('click', exportLut);
  refs.upscale2x.addEventListener('change', () => { if (activeTarget() && state.referenceStats) drawPreview(); });
  refs.structuralToggle?.addEventListener('change', () => { for (const t of state.targets) { t.structuralMaps = null; t.controlNetPayload = null; } updateStructuralMaps(); if (activeTarget() && state.referenceStats) drawPreview(); });
  const blueCastToggles = document.querySelectorAll('.blue-cast-toggle, #blueCastToggleSidebar, #blueCastToggleExport, #blueCastToggle');
  blueCastToggles.forEach(toggle => {
    toggle.addEventListener('change', e => {
      const isChecked = e.target.checked;
      blueCastToggles.forEach(t => { t.checked = isChecked; });
      if (activeTarget() && state.referenceStats) drawPreview();
    });
  });
  refs.saveProfileBtn.addEventListener('click', saveProfile); refs.loadProfileInput.addEventListener('change', loadProfile); window.addEventListener('resize', syncCompareSize);
  refs.pasteToReferencesBtn.addEventListener('click', e => { e.preventDefault(); setPasteDestination('reference'); refs.pasteToReferencesBtn.focus(); });
  refs.pasteToTargetsBtn.addEventListener('click', e => { e.preventDefault(); setPasteDestination('target'); refs.pasteToTargetsBtn.focus(); });
  refs.referenceDrop.querySelector('.card-head-copy').addEventListener('click', () => setPasteDestination('reference'));
  async function loadDefaultReferences() {
    const defaultFiles = [
      { path: 'references/reference-1.png', name: 'reference-1.png' },
      { path: 'references/reference-2.png', name: 'reference-2.png' },
      { path: 'references/reference-3.jpg', name: 'reference-3.jpg' }
    ];
    try {
      const files = [];
      for (const item of defaultFiles) {
        const resp = await fetch(item.path);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        files.push(new File([blob], item.name, { type: blob.type || (item.name.endsWith('.jpg') ? 'image/jpeg' : 'image/png') }));
      }
      if (files.length) await loadReferenceFiles(files);
    } catch (err) {
      console.warn('Could not load default reference photos:', err);
    }
  }

  document.addEventListener('paste', handlePaste);
  loadDefaultReferences();
})();
