import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const SCRIPT_PATH = path.join(process.cwd(), "scripts", "extract-depth-anything-v2.py");
const PYTHON_BIN = process.env.DEPTH_ANYTHING_PYTHON ?? "python3";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

async function hasExtractor() {
  try {
    await access(SCRIPT_PATH);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(PYTHON_BIN, [
        "-c",
        "import PIL, numpy, torch, transformers; from preprocessors import StructuralPreprocessor",
      ], { cwd: process.cwd(), stdio: "ignore" });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error("Depth dependencies unavailable."))));
    });
    return true;
  } catch {
    return false;
  }
}

function runExtractor(image: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [SCRIPT_PATH], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8") || `Depth extractor exited with code ${code}.`));
    });

    child.stdin.end(image);
  });
}

export async function GET() {
  return Response.json({ available: await hasExtractor() });
}

export async function POST(request: Request) {
  if (!(await hasExtractor())) {
    return Response.json({ error: "Depth Anything V2 extractor is not installed on this backend." }, { status: 503 });
  }

  const formData = await request.formData();
  const imageFile = formData.get("image");
  if (!(imageFile instanceof File)) {
    return Response.json({ error: "Upload an image file in the 'image' form field." }, { status: 400 });
  }

  const image = Buffer.from(await imageFile.arrayBuffer());
  if (!image.length) {
    return Response.json({ error: "Uploaded image is empty." }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Uploaded image is too large." }, { status: 413 });
  }

  try {
    const png = await runExtractor(image);
    return new Response(png, {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Depth Anything V2 extraction failed." },
      { status: 503 },
    );
  }
}
