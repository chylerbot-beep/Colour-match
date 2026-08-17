/**
 * DepthAnything In-Browser Engine
 * Powered by ONNX Runtime Web (WebGPU / WASM)
 * Adapted from akbartus/DepthAnything-on-Browser (https://github.com/akbartus/DepthAnything-on-Browser)
 */

class DepthAnythingEngine {
  constructor() {
    this.session = null;
    this.modelUrls = [
      // Primary: Dynamic quantized DepthAnything V2 model (fast, lightweight ~25MB)
      "https://cdn.glitch.me/0f5359e2-6022-421b-88f7-13e276d0fb33/depthanythingv2-vits-dynamic-quant.onnx",
      // Fallback 1: Quantized DepthAnything V1 model
      "https://cdn.glitch.me/0f5359e2-6022-421b-88f7-13e276d0fb33/depthanything-quant.onnx",
      // Fallback 2: Full float model
      "https://cdn.glitch.me/0f5359e2-6022-421b-88f7-13e276d0fb33/depthanythingv2-vits.onnx"
    ];
    this.inputSize = 518; // Optimal ViT patch multiple (518 = 37 * 14)
    this.isInitializing = false;
    this.currentModelUrl = this.modelUrls[0];
  }

  /**
   * Initializes the ONNX inference session with WebGPU and WASM fallbacks
   * @param {Function} [onProgress] - (percent, text)
   */
  async init(onProgress) {
    if (this.session) return this.session;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return this.session;
    }

    this.isInitializing = true;
    if (onProgress) onProgress(10, "Loading Depth Anything AI Model...");

    if (typeof ort !== "undefined" && ort.env && ort.env.wasm) {
      ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4);
      ort.env.wasm.simd = true;
    }

    let lastError = null;
    for (const url of this.modelUrls) {
      try {
        if (onProgress) onProgress(25, "Initializing WebGPU Session...");
        this.session = await ort.InferenceSession.create(url, {
          executionProviders: ["webgpu", "wasm"],
          graphOptimizationLevel: "all",
          logSeverityLevel: 3
        });
        this.currentModelUrl = url;
        console.log(`[DepthEngine] Initialized with WebGPU provider using ${url}`);
        break;
      } catch (errWebGPU) {
        console.warn(`[DepthEngine] WebGPU failed for ${url}, attempting WASM fallback:`, errWebGPU);
        try {
          if (onProgress) onProgress(35, "Fallback to WASM Session...");
          this.session = await ort.InferenceSession.create(url, {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "all",
            logSeverityLevel: 3
          });
          this.currentModelUrl = url;
          console.log(`[DepthEngine] Initialized with WASM provider using ${url}`);
          break;
        } catch (errWasm) {
          lastError = errWasm;
          console.warn(`[DepthEngine] Failed loading model from ${url}:`, errWasm);
        }
      }
    }

    this.isInitializing = false;
    if (!this.session) {
      throw new Error(`Failed to load Depth Anything model from all endpoints: ${lastError?.message || "Unknown error"}`);
    }

    if (onProgress) onProgress(100, "Depth Anything Model Ready");
    return this.session;
  }

  /**
   * Preprocesses ImageData into NCHW Float32Array [1, 3, H, W]
   * Normalizes pixel channels from [0, 255] to [0.0, 1.0]
   */
  preprocessImageData(imageData, width, height) {
    const totalPixels = width * height;
    const floatArr = new Float32Array(3 * totalPixels);
    const data = imageData.data;

    // Planar format: RRR... GGG... BBB...
    const rOffset = 0;
    const gOffset = totalPixels;
    const bOffset = 2 * totalPixels;

    for (let i = 0; i < totalPixels; i++) {
      const srcIdx = i * 4;
      floatArr[rOffset + i] = data[srcIdx] / 255.0;
      floatArr[gOffset + i] = data[srcIdx + 1] / 255.0;
      floatArr[bOffset + i] = data[srcIdx + 2] / 255.0;
    }

    return floatArr;
  }

  /**
   * Postprocesses output depth tensor into normalized depth map & canvas
   */
  postprocessTensor(tensor, outWidth, outHeight) {
    const height = tensor.dims[tensor.dims.length - 2] || this.inputSize;
    const width = tensor.dims[tensor.dims.length - 1] || this.inputSize;
    const tensorData = tensor.data;
    const totalPixels = width * height;

    let minDepth = Infinity;
    let maxDepth = -Infinity;

    for (let i = 0; i < totalPixels; i++) {
      const v = tensorData[i];
      if (v < minDepth) minDepth = v;
      if (v > maxDepth) maxDepth = v;
    }

    const range = (maxDepth - minDepth) > 1e-6 ? (maxDepth - minDepth) : 1;

    // Create raw normalized float array [0..1]
    const rawDepth = new Float32Array(totalPixels);
    const depthImageData = new ImageData(width, height);
    const rgba = depthImageData.data;

    for (let i = 0; i < totalPixels; i++) {
      const norm = (tensorData[i] - minDepth) / range;
      rawDepth[i] = norm;

      const byteVal = Math.round(norm * 255);
      const px = i * 4;
      rgba[px] = byteVal;
      rgba[px + 1] = byteVal;
      rgba[px + 2] = byteVal;
      rgba[px + 3] = 255;
    }

    // Render into canvas
    const rawCanvas = document.createElement("canvas");
    rawCanvas.width = width;
    rawCanvas.height = height;
    rawCanvas.getContext("2d").putImageData(depthImageData, 0, 0);

    // If target dimension differs from tensor dimension, scale nicely
    const finalWidth = outWidth || width;
    const finalHeight = outHeight || height;

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = finalWidth;
    finalCanvas.height = finalHeight;
    const ctx = finalCanvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(rawCanvas, 0, 0, finalWidth, finalHeight);

    const finalImageData = ctx.getImageData(0, 0, finalWidth, finalHeight);
    const finalRawDepth = new Float32Array(finalWidth * finalHeight);
    for (let i = 0; i < finalWidth * finalHeight; i++) {
      finalRawDepth[i] = finalImageData.data[i * 4] / 255.0;
    }

    return {
      canvas: finalCanvas,
      imageData: finalImageData,
      rawDepth: finalRawDepth,
      minDepth,
      maxDepth,
      width: finalWidth,
      height: finalHeight
    };
  }

  /**
   * Generates a Monocular Depth Map for any HTMLCanvasElement or HTMLImageElement
   * @param {HTMLCanvasElement|HTMLImageElement} sourceElement
   * @param {Function} [onProgress]
   * @returns {Promise<{canvas: HTMLCanvasElement, imageData: ImageData, rawDepth: Float32Array, width: number, height: number}>}
   */
  async estimateDepth(sourceElement, onProgress) {
    await this.init(onProgress);

    const origWidth = sourceElement.naturalWidth || sourceElement.width;
    const origHeight = sourceElement.naturalHeight || sourceElement.height;

    if (onProgress) onProgress(40, "Preparing Image Tensor...");

    // Create intermediate 518x518 square canvas as required by DepthAnything
    const modelSize = this.inputSize;
    const inputCanvas = document.createElement("canvas");
    inputCanvas.width = modelSize;
    inputCanvas.height = modelSize;
    const ctx = inputCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(sourceElement, 0, 0, modelSize, modelSize);
    const inputImageData = ctx.getImageData(0, 0, modelSize, modelSize);

    // Convert to Tensor
    const planarData = this.preprocessImageData(inputImageData, modelSize, modelSize);
    const inputTensor = new ort.Tensor("float32", planarData, [1, 3, modelSize, modelSize]);

    if (onProgress) onProgress(60, "Running Depth Inference...");
    const feeds = {};
    const inputName = this.session.inputNames[0] || "image";
    feeds[inputName] = inputTensor;

    const results = await this.session.run(feeds);
    const outputName = this.session.outputNames[0] || "depth";
    const outputTensor = results[outputName] || results.depth;

    if (onProgress) onProgress(90, "Postprocessing Depth Map...");
    const result = this.postprocessTensor(outputTensor, origWidth, origHeight);

    if (onProgress) onProgress(100, "Depth Complete");
    return result;
  }

  /**
   * Colorizes a grayscale depth canvas using Turbo/Inferno colormap
   * @param {HTMLCanvasElement} depthCanvas
   * @param {'turbo'|'inferno'|'grayscale'} [colormap='turbo']
   * @returns {HTMLCanvasElement}
   */
  colorizeDepth(depthCanvas, colormap = "turbo") {
    const w = depthCanvas.width;
    const h = depthCanvas.height;
    const ctx = depthCanvas.getContext("2d");
    const srcData = ctx.getImageData(0, 0, w, h);
    const outCanvas = document.createElement("canvas");
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext("2d");
    const outData = outCtx.createImageData(w, h);

    const d = srcData.data;
    const o = outData.data;
    const len = w * h;

    for (let i = 0; i < len; i++) {
      const idx = i * 4;
      const val = d[idx] / 255.0; // 0..1 (0=Far, 1=Near)

      let r, g, b;
      if (colormap === "turbo") {
        // Turbo Colormap Approximation
        r = Math.min(255, Math.max(0, Math.round(255 * (0.1357 + val * (4.61539 - val * (42.6603 - val * (132.131 - val * (161.055 - val * 65.2686))))))));
        g = Math.min(255, Math.max(0, Math.round(255 * (0.0914 + val * (2.19418 + val * (16.4223 - val * (53.5458 - val * (60.8529 - val * 24.0864))))))));
        b = Math.min(255, Math.max(0, Math.round(255 * (0.1067 + val * (12.5833 - val * (86.8524 - val * (268.622 - val * (397.669 - val * 206.577))))))));
      } else if (colormap === "inferno") {
        // Inferno Colormap Approximation
        r = Math.min(255, Math.max(0, Math.round(255 * Math.pow(val, 0.7) * 1.2)));
        g = Math.min(255, Math.max(0, Math.round(255 * Math.pow(val, 1.8) * 0.9 + Math.pow(val, 4) * 0.3)));
        b = Math.min(255, Math.max(0, Math.round(255 * (Math.sin(val * Math.PI) * 0.8))));
      } else {
        // Grayscale
        r = g = b = d[idx];
      }

      o[idx] = r;
      o[idx + 1] = g;
      o[idx + 2] = b;
      o[idx + 3] = 255;
    }

    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
  }

  /**
   * Initializes interactive 3D Point Cloud / Mesh visualizer in a container
   * Based on akbartus/DepthAnything-on-Browser interactive Three.js demo
   */
  create3DViewer(container, rgbImageOrCanvas, depthCanvas, options = {}) {
    if (typeof THREE === "undefined") {
      throw new Error("Three.js is required for 3D depth visualization.");
    }

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // Clean container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1117);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(0, 0, 2.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    let controls = null;
    if (typeof THREE.OrbitControls !== "undefined") {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxDistance = 10;
      controls.minDistance = 0.2;
    }

    // Sample RGB and Depth pixels
    const sampleW = 240;
    const sampleH = Math.max(2, Math.round(sampleW * ((rgbImageOrCanvas.naturalHeight || rgbImageOrCanvas.height) / (rgbImageOrCanvas.naturalWidth || rgbImageOrCanvas.width))));

    const rgbC = document.createElement("canvas");
    rgbC.width = sampleW; rgbC.height = sampleH;
    const rgbCtx = rgbC.getContext("2d");
    rgbCtx.drawImage(rgbImageOrCanvas, 0, 0, sampleW, sampleH);
    const rgbData = rgbCtx.getImageData(0, 0, sampleW, sampleH).data;

    const depC = document.createElement("canvas");
    depC.width = sampleW; depC.height = sampleH;
    const depCtx = depC.getContext("2d");
    depCtx.drawImage(depthCanvas, 0, 0, sampleW, sampleH);
    const depData = depCtx.getImageData(0, 0, sampleW, sampleH).data;

    const totalPts = sampleW * sampleH;
    const positions = new Float32Array(totalPts * 3);
    const colors = new Float32Array(totalPts * 3);

    const depthScale = options.depthScale || 0.45;
    const pointSize = options.pointSize || 2.5;

    let validCount = 0;
    for (let y = 0; y < sampleH; y++) {
      for (let x = 0; x < sampleW; x++) {
        const idx = (y * sampleW + x) * 4;
        const u = (x / sampleW) - 0.5;
        const v = 0.5 - (y / sampleH);
        const z = (depData[idx] / 255.0 - 0.5) * depthScale;

        const pIdx = validCount * 3;
        positions[pIdx] = u * (sampleW / sampleH);
        positions[pIdx + 1] = v;
        positions[pIdx + 2] = z;

        colors[pIdx] = rgbData[idx] / 255.0;
        colors[pIdx + 1] = rgbData[idx + 1] / 255.0;
        colors[pIdx + 2] = rgbData[idx + 2] / 255.0;

        validCount++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions.subarray(0, validCount * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors.subarray(0, validCount * 3), 3));

    const material = new THREE.PointsMaterial({
      size: pointSize / 100,
      vertexColors: true,
      sizeAttenuation: true
    });

    const pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);

    let animId = null;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (controls) controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const nw = container.clientWidth || width;
      const nh = container.clientHeight || height;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };

    window.addEventListener("resize", handleResize);

    return {
      scene,
      camera,
      renderer,
      controls,
      destroy: () => {
        if (animId) cancelAnimationFrame(animId);
        window.removeEventListener("resize", handleResize);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        while (container.firstChild) container.removeChild(container.firstChild);
      }
    };
  }
}

if (typeof window !== "undefined") {
  window.DepthAnything = new DepthAnythingEngine();
  window.DepthEngine = window.DepthAnything;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = DepthAnythingEngine;
}
