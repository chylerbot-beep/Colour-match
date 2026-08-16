/**
 * In-Browser AI Super-Resolution Engine using ONNX Runtime Web & WebGPU
 * Uses Real-ESRGAN Compact model with intelligent overlap tiling to prevent VRAM overflow.
 */
class AIUpscalerEngine {
  constructor() {
    this.session = null;
    this.modelUrl = "https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x4.onnx";
    // Fallback lightweight 2x/4x compact model URL or local /models/upscaler.onnx
    this.scale = 4; // Model scale factor
    this.tileSize = 256; // Base tile size for memory safety
    this.tilePadding = 16; // Overlap to prevent visible seams
    this.isInitializing = false;
  }

  async init(onProgress) {
    if (this.session) return this.session;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return this.session;
    }
    this.isInitializing = true;

    if (onProgress) onProgress(0, "Loading AI Super-Resolution Model...");

    try {
      // Configure ONNX Runtime to prioritize WebGPU with CPU/WASM fallback
      if (typeof ort !== 'undefined' && ort.env && ort.env.wasm) {
        ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4);
        ort.env.wasm.simd = true;
      }

      this.session = await ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ["webgpu", "wasm"],
        graphOptimizationLevel: "all"
      });
      console.log("AI Upscaler Session initialized with providers:", this.session);
    } catch (err) {
      console.warn("WebGPU failed, falling back to pure WASM:", err);
      this.session = await ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all"
      });
    } finally {
      this.isInitializing = false;
    }
    return this.session;
  }

  /**
   * Upscales an HTML Canvas using tiled super-resolution
   * @param {HTMLCanvasElement} inputCanvas 
   * @param {Function} onProgress (percent, text)
   * @returns {Promise<HTMLCanvasElement>}
   */
  async upscaleCanvas(inputCanvas, onProgress) {
    await this.init(onProgress);

    const inWidth = inputCanvas.width;
    const inHeight = inputCanvas.height;
    const outWidth = inWidth * this.scale;
    const outHeight = inHeight * this.scale;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    const outCtx = outCanvas.getContext("2d");

    const inCtx = inputCanvas.getContext("2d");

    const xTiles = Math.ceil(inWidth / this.tileSize);
    const yTiles = Math.ceil(inHeight / this.tileSize);
    const totalTiles = xTiles * yTiles;
    let completedTiles = 0;

    for (let y = 0; y < inHeight; y += this.tileSize) {
      for (let x = 0; x < inWidth; x += this.tileSize) {
        const xStart = Math.max(0, x - this.tilePadding);
        const yStart = Math.max(0, y - this.tilePadding);
        const xEnd = Math.min(inWidth, x + this.tileSize + this.tilePadding);
        const yEnd = Math.min(inHeight, y + this.tileSize + this.tilePadding);

        const cropW = xEnd - xStart;
        const cropH = yEnd - yStart;

        const tileImgData = inCtx.getImageData(xStart, yStart, cropW, cropH);

        // Convert ImageData to NCHW Tensor [1, 3, H, W]
        const inputTensor = this.imageDataToTensor(tileImgData);

        // Run Inference
        const feeds = {};
        const inputName = this.session.inputNames[0];
        feeds[inputName] = inputTensor;
        const results = await this.session.run(feeds);
        const outputName = this.session.outputNames[0];
        const outputTensor = results[outputName];

        // Convert output tensor back to ImageData
        const outTileImageData = this.tensorToImageData(outputTensor, cropW * this.scale, cropH * this.scale);

        // Temp canvas to hold the upscaled tile
        const tempTileCanvas = document.createElement("canvas");
        tempTileCanvas.width = cropW * this.scale;
        tempTileCanvas.height = cropH * this.scale;
        tempTileCanvas.getContext("2d").putImageData(outTileImageData, 0, 0);

        // Calculate destination offsets excluding the padding
        const srcCropX = (x - xStart) * this.scale;
        const srcCropY = (y - yStart) * this.scale;
        const validW = Math.min(this.tileSize, inWidth - x) * this.scale;
        const validH = Math.min(this.tileSize, inHeight - y) * this.scale;

        outCtx.drawImage(
          tempTileCanvas,
          srcCropX, srcCropY, validW, validH,
          x * this.scale, y * this.scale, validW, validH
        );

        completedTiles++;
        if (onProgress) {
          const pct = Math.round((completedTiles / totalTiles) * 100);
          onProgress(pct, `Upscaling Tile ${completedTiles}/${totalTiles} (${pct}%)`);
        }
      }
    }

    return outCanvas;
  }

  imageDataToTensor(imageData) {
    const { width, height, data } = imageData;
    const float32Data = new Float32Array(3 * width * height);
    const channelSize = width * height;

    for (let i = 0; i < channelSize; i++) {
      float32Data[i] = data[i * 4] / 255.0;                      // R
      float32Data[channelSize + i] = data[i * 4 + 1] / 255.0;    // G
      float32Data[2 * channelSize + i] = data[i * 4 + 2] / 255.0;// B
    }

    return new ort.Tensor("float32", float32Data, [1, 3, height, width]);
  }

  tensorToImageData(tensor, width, height) {
    const data = tensor.data;
    const channelSize = width * height;
    const imgData = new ImageData(width, height);
    const rgba = imgData.data;

    for (let i = 0; i < channelSize; i++) {
      rgba[i * 4] = Math.min(255, Math.max(0, Math.round(data[i] * 255)));
      rgba[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(data[channelSize + i] * 255)));
      rgba[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(data[2 * channelSize + i] * 255)));
      rgba[i * 4 + 3] = 255;
    }

    return imgData;
  }
}

window.AIUpscaler = new AIUpscalerEngine();
