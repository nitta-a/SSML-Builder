import { AZURE_VOICE_CATALOG_METADATA } from "./generated/azureVoiceCatalog.ts";
import type { AzureVoiceCatalogMetadata } from "./generated/azureVoiceCatalog.ts";

/** Returns metadata for the built-in Azure voice catalog snapshot. */
export function getAzureVoiceCatalogMetadata(): AzureVoiceCatalogMetadata {
  return {
    ...AZURE_VOICE_CATALOG_METADATA,
    regions: [...AZURE_VOICE_CATALOG_METADATA.regions],
  };
}

/** Alias for consumers that refer to the bundled catalog as the built-in catalog. */
export const getBuiltInVoiceCatalogMetadata = getAzureVoiceCatalogMetadata;
