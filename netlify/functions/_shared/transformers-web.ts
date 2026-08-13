import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type TransformersModule = typeof import("@huggingface/transformers");

const WASM_MODULE_FILE = "ort-wasm-simd-threaded.mjs";
const WASM_BINARY_FILE = "ort-wasm-simd-threaded.wasm";

let transformersModulePromise: Promise<TransformersModule> | undefined;

function resolveWasmAssetRoot() {
  const configuredRoot = process.env.RAG_WASM_ASSET_ROOT?.trim();
  if (configuredRoot) return path.resolve(configuredRoot);

  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const sourceLayout = path.resolve(moduleDirectory, "../_assets/onnxruntime");
  if (existsSync(path.join(sourceLayout, WASM_BINARY_FILE))) return sourceLayout;

  // esbuild 将该模块内联到 ask.mjs 后，_assets 与函数入口位于同一级。
  return path.resolve(moduleDirectory, "_assets/onnxruntime");
}

export function loadTransformersWeb(): Promise<TransformersModule> {
  transformersModulePromise ??= (async () => {
    // onnxruntime-web 该版本的 exports 未暴露自身 types.d.ts，但运行时 ESM 入口有效。
    // @ts-expect-error -- upstream package exports/type declaration mismatch
    const ort = await import("onnxruntime-web");
    const assetRoot = resolveWasmAssetRoot();
    const wasmModulePath = path.join(assetRoot, WASM_MODULE_FILE);
    const wasmBinaryPath = path.join(assetRoot, WASM_BINARY_FILE);

    ort.env.wasm.wasmPaths = {
      mjs: pathToFileURL(wasmModulePath).href,
      wasm: wasmBinaryPath
    };
    ort.env.wasm.numThreads = 1;

    const runtimeGlobal = globalThis as typeof globalThis & Record<symbol, unknown>;
    runtimeGlobal[Symbol.for("onnxruntime")] = ort;

    // 必须在注册 WASM ORT 后动态加载，否则 Transformers 会选择 Node 原生后端。
    return (await import("../_vendor/transformers.web.mjs")) as TransformersModule;
  })().catch((error: unknown) => {
    transformersModulePromise = undefined;
    throw error;
  });

  return transformersModulePromise;
}
