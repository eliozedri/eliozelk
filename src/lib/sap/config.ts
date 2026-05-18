export type SapMode = "disabled" | "readonly" | "write_test" | "write_prod";

export interface SapConfig {
  mode: SapMode;
  serviceLayerUrl: string;
  companyDb: string;
  username: string;
  password: string;
}

export interface SapEnvStatus {
  mode: SapMode;
  allPresent: boolean;
  missing: string[];
}

export function getSapEnvStatus(): SapEnvStatus {
  const mode = (process.env.SAP_B1_MODE ?? "disabled") as SapMode;
  if (mode === "disabled") return { mode, allPresent: false, missing: [] };

  const required: [string, string | undefined][] = [
    ["SAP_B1_SERVICE_LAYER_URL", process.env.SAP_B1_SERVICE_LAYER_URL],
    ["SAP_B1_COMPANY_DB", process.env.SAP_B1_COMPANY_DB],
    ["SAP_B1_USERNAME", process.env.SAP_B1_USERNAME],
    ["SAP_B1_PASSWORD", process.env.SAP_B1_PASSWORD],
  ];
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  return { mode, allPresent: missing.length === 0, missing };
}

export function loadSapConfig(): SapConfig {
  const { mode, allPresent, missing } = getSapEnvStatus();

  if (mode === "disabled") throw new SapDisabledError();
  if (mode === "write_test" || mode === "write_prod") throw new SapModeBlockedError(mode);
  if (!allPresent) throw new SapConfigError(`Missing SAP env vars: ${missing.join(", ")}`);

  return {
    mode,
    serviceLayerUrl: process.env.SAP_B1_SERVICE_LAYER_URL!.replace(/\/$/, ""),
    companyDb: process.env.SAP_B1_COMPANY_DB!,
    username: process.env.SAP_B1_USERNAME!,
    password: process.env.SAP_B1_PASSWORD!,
  };
}

export class SapDisabledError extends Error {
  readonly code = "SAP_DISABLED" as const;
  constructor() { super("SAP integration is disabled (SAP_B1_MODE=disabled)"); }
}

export class SapModeBlockedError extends Error {
  readonly code = "SAP_MODE_BLOCKED" as const;
  constructor(mode: SapMode) { super(`SAP mode '${mode}' is reserved and not yet enabled`); }
}

export class SapConfigError extends Error {
  readonly code = "SAP_CONFIG_ERROR" as const;
  constructor(message: string) { super(message); }
}

export class SapAuthError extends Error {
  readonly code = "SAP_AUTH_ERROR" as const;
  readonly isNetworkError: boolean;
  constructor(message: string, isNetworkError = false) {
    super(message);
    this.isNetworkError = isNetworkError;
  }
}

export class SapRequestError extends Error {
  readonly code = "SAP_REQUEST_ERROR" as const;
  readonly httpStatus?: number;
  constructor(message: string, httpStatus?: number) {
    super(message);
    this.httpStatus = httpStatus;
  }
}
