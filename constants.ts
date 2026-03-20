import { TAXONOMY_TAGS } from './src/lib/taxonomy';

export const YES_COLOR = 'rgba(36, 182, 255, 1)'; // YES / positive
export const NO_COLOR = 'rgba(201, 37, 28, 1)'; // NO / negative

/**
 * Catalog tag chips derived from the shared taxonomy.
 * This replaces the legacy CATEGORIES constant.
 */
export const CATEGORIES = TAXONOMY_TAGS.map((t) => ({
  id: t.id,
  labelRU: t.labelRu,
  labelEN: t.labelEn,
}));
