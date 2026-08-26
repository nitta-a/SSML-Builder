export interface TtsConfig {
  signal?: AbortSignal;
  timeoutMs?: number;
  endpoint?: string;
  subscriptionKey: string;
  region: string;
  outputFormat?: string;
}

export interface AzureTtsLogger {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface AzureTtsClientOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  subscriptionKey: string;
  region: string;
  endpoint?: string;
  outputFormat?: string;
  logger?: AzureTtsLogger;
}
