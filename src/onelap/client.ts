import { createHash, randomBytes } from "node:crypto";
import type {
  Activity,
  ActivityDetail,
  ActivityListResponse,
  LoginResponse,
  OnelapClientOptions,
} from "./types.js";

const ONELAP_SECRET = "REDACTED_USE_ENV_VAR";
const LOGIN_BASE_URL = "https://www.onelap.cn/api";
const ANALYSIS_BASE_URL = "https://u.onelap.cn/analysis";

export function md5Hex(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export function randomHex(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

export function buildSignature(params: {
  account: string;
  passwordMd5: string;
  nonce: string;
  timestamp: string;
}): string {
  const signStr = `account=${params.account}&nonce=${params.nonce}&password=${params.passwordMd5}&timestamp=${params.timestamp}&key=${ONELAP_SECRET}`;
  return md5Hex(signStr);
}

export class OnelapClient {
  private uid: string | null = null;
  private xsrfToken: string | null = null;
  private oToken: string | null = null;
  private timeout: number;

  constructor(options?: OnelapClientOptions) {
    this.timeout = options?.timeout ?? 30_000;
  }
}
