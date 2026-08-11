export interface TtsConfig {
  endpoint: string;
  subscriptionKey: string;
  region: string;
  outputFormat?: string;
}

export interface AzureTtsClientOptions {
  subscriptionKey: string;
  region: string;
  endpoint?: string;
  outputFormat?: string;
}
