import type { SiteContentDocument } from "../../../shared/site-content-schema.ts";
import { AdminApiError } from "../../lib/admin-api.ts";

export type AdminScreenName = "loading" | "auth" | "home" | "edit";

export type StatsPollingState = {
  authenticated: boolean;
  screen: AdminScreenName;
  visibility: DocumentVisibilityState;
};

export function shouldPollAdminStats(state: StatsPollingState): boolean {
  return state.authenticated && state.screen === "home" && state.visibility === "visible";
}

export function isUnauthorizedAdminError(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError && error.status === 401;
}

const SAFE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  content_conflict: "内容版本已更新，请重新载入最新内容后再试。",
  invalid_credentials: "邮箱或密码不正确。",
  invalid_input: "提交的信息不完整或格式不正确。",
  rate_limited: "尝试次数过多，请稍后再试。",
  setup_complete: "管理员账号已经初始化，请直接登录。",
  service_unavailable: "管理服务暂时不可用，请稍后重试。",
  unauthorized: "登录状态已失效，请重新登录。"
};

export function adminErrorMessage(error: unknown): string {
  if (!(error instanceof AdminApiError)) return "操作未完成，请稍后重试。";
  return SAFE_ERROR_MESSAGES[error.code] ?? "操作未完成，请稍后重试。";
}

type LocalLocation = Pick<Location, "hostname" | "port" | "protocol">;

export function isLocalViteLocation(location: LocalLocation): boolean {
  const hostname = location.hostname.toLowerCase();
  return location.protocol === "http:" &&
    location.port === "5173" &&
    (hostname === "localhost" || hostname === "127.0.0.1");
}

export function replacePublishedDocument(
  current: SiteContentDocument,
  published: SiteContentDocument
): SiteContentDocument {
  return current.version === published.version ? current : published;
}

export function isAdminGenerationCurrent(
  operationGeneration: number,
  currentGeneration: number,
  mounted: boolean
): boolean {
  return mounted && operationGeneration === currentGeneration;
}
