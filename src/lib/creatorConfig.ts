import type { CreatorConfig } from "@/types";

export const CREATOR_LIMIT_OPTIONS = [
  "Anal",
  "Oral sex",
  "Oral (no swallow)",
  "Masturbation",
  "Toys",
  "Feet content",
  "JOI",
  "BDSM (light)",
  "Dick rating",
  "B/G content",
  "G/G content",
  "Threesome",
  "Squirting",
  "Dom roleplay",
  "Sub roleplay",
];

export function emptyCreatorConfig(modeloId: string): CreatorConfig {
  return {
    modelo_id: modeloId,
    other_languages: [],
    hard_limits: [],
    custom_pricing_enabled: false,
  };
}
