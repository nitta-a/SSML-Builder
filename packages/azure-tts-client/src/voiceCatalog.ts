const AZURE_VOICE_API_VERSION = "2025-10-01";

export interface FetchAzureVoiceCatalogOptions {
  apiKey: string;
  region: string | string[];
}

export interface AzureVoiceCatalogVoice {
  name: string;
  locale: string;
  secondaryLocales?: readonly string[];
  styles?: readonly string[];
  supportedTags?: readonly string[];
  unsupportedTags?: readonly string[];
  models?: readonly string[];
  regions: readonly string[];
  status?: "ga" | "preview" | "deprecated";
}

export interface FetchedAzureVoiceCatalogMetadata {
  voiceCount: number;
  generatedAt: string;
  apiVersion: string;
  regions: readonly string[];
}

export interface AzureVoiceCatalog {
  voices: readonly AzureVoiceCatalogVoice[];
  metadata: FetchedAzureVoiceCatalogMetadata;
}

interface AzureVoiceApiRecord {
  Locale?: unknown;
  Name?: unknown;
  SecondaryLocaleList?: unknown;
  ShortName?: unknown;
  Status?: unknown;
  StyleList?: unknown;
  SupportedTags?: unknown;
  UnsupportedTags?: unknown;
  Models?: unknown;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(stringValue).filter((item): item is string => item !== undefined))];
}

function normalizeStatus(value: unknown): AzureVoiceCatalogVoice["status"] {
  const status = stringValue(value)?.toLowerCase();
  if (status === "preview" || status === "deprecated" || status === "ga") return status;
  return undefined;
}

function normalizeRegions(region: string | string[]): string[] {
  const regions = Array.isArray(region) ? region : [region];
  const result = [...new Set(regions.map((item) => item.trim()).filter(Boolean))];
  if (result.length === 0) throw new TypeError("At least one Azure Speech region is required.");
  return result;
}

async function fetchRegionVoices(region: string, apiKey: string): Promise<AzureVoiceApiRecord[]> {
  const endpoint = `https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });
  if (!response.ok) {
    throw new Error(`Azure List Voices API request failed for region "${region}" with HTTP ${response.status}.`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error(`Azure List Voices API returned an invalid response for "${region}".`);
  return payload.filter((item): item is AzureVoiceApiRecord => Boolean(item && typeof item === "object"));
}

/** Fetches and deduplicates the current Azure Speech voice catalog for one or more regions. */
export async function fetchAzureVoiceCatalog(options: FetchAzureVoiceCatalogOptions): Promise<AzureVoiceCatalog> {
  if (!options || typeof options.apiKey !== "string" || !options.apiKey.trim())
    throw new TypeError("An Azure Speech API key is required.");
  const regions = normalizeRegions(options.region);
  const payloads = await Promise.all(regions.map((region) => fetchRegionVoices(region, options.apiKey)));
  const voices = new Map<string, AzureVoiceCatalogVoice>();

  for (let regionIndex = 0; regionIndex < payloads.length; regionIndex += 1) {
    const region = regions[regionIndex];
    for (const record of payloads[regionIndex]) {
      const name = stringValue(record.ShortName) ?? stringValue(record.Name);
      const locale = stringValue(record.Locale);
      if (!name || !locale) continue;
      const key = name.toLowerCase();
      const existing = voices.get(key);
      const secondaryLocales = stringList(record.SecondaryLocaleList);
      const styles = stringList(record.StyleList);
      const status = normalizeStatus(record.Status);
      const supportedTags = stringList(record.SupportedTags);
      const unsupportedTags = stringList(record.UnsupportedTags);
      const models = stringList(record.Models);
      const merged: AzureVoiceCatalogVoice = {
        name: existing?.name ?? name,
        locale: existing?.locale ?? locale,
        regions: [...new Set([...(existing?.regions ?? []), region])],
      };
      const mergedSecondaryLocales = [...new Set([...(existing?.secondaryLocales ?? []), ...secondaryLocales])];
      if (mergedSecondaryLocales.length > 0) merged.secondaryLocales = mergedSecondaryLocales;
      const mergedStyles = [...new Set([...(existing?.styles ?? []), ...styles])];
      if (mergedStyles.length > 0) merged.styles = mergedStyles;
      const mergedSupportedTags = [...new Set([...(existing?.supportedTags ?? []), ...supportedTags])];
      if (mergedSupportedTags.length > 0) merged.supportedTags = mergedSupportedTags;
      const mergedUnsupportedTags = [...new Set([...(existing?.unsupportedTags ?? []), ...unsupportedTags])];
      if (mergedUnsupportedTags.length > 0) merged.unsupportedTags = mergedUnsupportedTags;
      const mergedModels = [...new Set([...(existing?.models ?? []), ...models])];
      if (mergedModels.length > 0) merged.models = mergedModels;
      if (status) merged.status = status;
      else if (existing?.status) merged.status = existing.status;
      voices.set(key, merged);
    }
  }

  const sortedVoices = [...voices.values()].sort((first, second) => first.name.localeCompare(second.name));
  return {
    voices: sortedVoices,
    metadata: {
      voiceCount: sortedVoices.length,
      generatedAt: new Date().toISOString(),
      apiVersion: AZURE_VOICE_API_VERSION,
      regions,
    },
  };
}
