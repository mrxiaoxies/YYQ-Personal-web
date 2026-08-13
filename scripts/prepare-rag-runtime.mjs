import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const transformersRoot = path.join(workspaceRoot, "node_modules", "@huggingface", "transformers");
const ortRoot = path.join(workspaceRoot, "node_modules", "onnxruntime-web");
const vendorRoot = path.join(workspaceRoot, "netlify", "functions", "_vendor");
const assetRoot = path.join(workspaceRoot, "netlify", "functions", "_assets", "onnxruntime");

const transformersSource = path.join(transformersRoot, "dist", "transformers.web.js");
const transformersTarget = path.join(vendorRoot, "transformers.web.mjs");
const deviceRegistrationMarker = "    ONNX = globalThis[ORT_SYMBOL];";
const deviceRegistrationPatch = `${deviceRegistrationMarker}\n    // YYQ Netlify compatibility: the injected runtime is onnxruntime-web/WASM.\n    supportedDevices.push('wasm');\n    defaultDevices = ['wasm'];`;

async function copyRequiredFile(source, target) {
  await copyFile(source, target);
  const fileStats = await stat(target);
  if (!fileStats.isFile() || fileStats.size === 0) {
    throw new Error(`运行文件复制失败：${target}`);
  }
  return fileStats.size;
}

async function main() {
  console.log("[1/3] 准备目录：为 Netlify 函数固定跨平台 WASM 运行文件位置。");
  await mkdir(vendorRoot, { recursive: true });
  await mkdir(assetRoot, { recursive: true });

  console.log("[2/3] 固定 Transformers Web 构建：避免函数打包 218 MB 的原生 ONNX 依赖。");
  let transformersSourceText = await readFile(transformersSource, "utf8");
  if (!transformersSourceText.includes(deviceRegistrationMarker)) {
    throw new Error("Transformers Web 构建结构发生变化，请先人工复核 WASM 兼容补丁。");
  }
  transformersSourceText = transformersSourceText.replace(
    deviceRegistrationMarker,
    deviceRegistrationPatch
  );
  await writeFile(transformersTarget, transformersSourceText, "utf8");
  await copyRequiredFile(
    path.join(transformersRoot, "LICENSE"),
    path.join(vendorRoot, "TRANSFORMERS-LICENSE.txt")
  );

  console.log("[3/3] 固定 ONNX Runtime WASM：只复制 CPU 推理所需的 glue 与二进制文件。");
  const moduleBytes = await copyRequiredFile(
    path.join(ortRoot, "dist", "ort-wasm-simd-threaded.mjs"),
    path.join(assetRoot, "ort-wasm-simd-threaded.mjs")
  );
  const wasmBytes = await copyRequiredFile(
    path.join(ortRoot, "dist", "ort-wasm-simd-threaded.wasm"),
    path.join(assetRoot, "ort-wasm-simd-threaded.wasm")
  );

  const licensePath = path.join(vendorRoot, "ONNXRUNTIME-LICENSE.txt");
  const licenseStats = await stat(licensePath).catch(() => undefined);
  if (!licenseStats?.isFile() || licenseStats.size === 0) {
    throw new Error(`缺少 ONNX Runtime 许可证：${licensePath}`);
  }

  console.log(
    `      已准备 Transformers Web、${moduleBytes} 字节 glue 和 ${(wasmBytes / 1024 / 1024).toFixed(2)} MiB WASM。`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`RAG 运行时准备失败：${message}`);
  process.exitCode = 1;
});

