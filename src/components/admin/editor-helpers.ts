import type {
  SiteContentDocument,
  SiteContentSections,
  SiteContentUpdate
} from "../../../shared/site-content-schema.ts";

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function buildContentUpdate<K extends keyof SiteContentSections>(
  document: SiteContentDocument,
  section: K,
  draft: SiteContentSections[K]
): SiteContentUpdate {
  return {
    expectedVersion: document.version,
    sections: {
      ...deepClone(document.sections),
      [section]: deepClone(draft)
    }
  };
}

export function moveListItem<T>(items: readonly T[], index: number, offset: -1 | 1): T[] {
  const destination = index + offset;
  if (index < 0 || index >= items.length || destination < 0 || destination >= items.length) {
    return [...items];
  }
  const result = [...items];
  [result[index], result[destination]] = [result[destination], result[index]];
  return result;
}

export function removeListItem<T>(items: readonly T[], index: number): T[] {
  if (index < 0 || index >= items.length) return [...items];
  return items.filter((_, itemIndex) => itemIndex !== index);
}

export function insertListItem<T>(items: readonly T[], index: number, item: T): T[] {
  const destination = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, destination), item, ...items.slice(destination)];
}

export function createEditorId(uuid: () => string = () => crypto.randomUUID()): string {
  return uuid();
}
