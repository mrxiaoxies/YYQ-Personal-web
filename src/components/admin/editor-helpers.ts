import type {
  SiteContentDocument,
  SiteContentSections,
  SiteContentUpdate
} from "../../../shared/site-content-schema.ts";

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export type EditorDraftBinding = {
  [K in keyof SiteContentSections]: {
    section: K;
    value: SiteContentSections[K];
  }
}[keyof SiteContentSections];

export type EditorRenderDraftSelection<K extends keyof SiteContentSections> = {
  bindingMatchesSection: boolean;
  disabled: boolean;
  value: SiteContentSections[K];
};

export function selectEditorRenderDraft<K extends keyof SiteContentSections>(
  binding: EditorDraftBinding,
  section: K,
  document: SiteContentDocument,
  busy: boolean
): EditorRenderDraftSelection<K> {
  const bindingMatchesSection = binding.section === section;
  return {
    bindingMatchesSection,
    disabled: busy || !bindingMatchesSection,
    value: bindingMatchesSection
      ? binding.value as SiteContentSections[K]
      : deepClone(document.sections[section])
  };
}

export function buildContentUpdate<K extends keyof SiteContentSections>(
  document: SiteContentDocument,
  section: K,
  draft: SiteContentSections[K],
  expectedVersion = document.version
): SiteContentUpdate {
  return {
    expectedVersion,
    sections: {
      ...deepClone(document.sections),
      [section]: deepClone(draft)
    }
  };
}

export type EditorVersionState = {
  baseVersion: string;
  dirty: boolean;
  externalConflict: boolean;
};

export type IncomingDocumentInput = {
  baseVersion: string;
  currentSection: keyof SiteContentSections;
  dirty: boolean;
  incomingSection: keyof SiteContentSections;
  incomingVersion: string;
};

export type IncomingDocumentDecision = EditorVersionState & {
  replaceDraft: boolean;
};

export function acceptEditorVersion(version: string): EditorVersionState {
  return {
    baseVersion: version,
    dirty: false,
    externalConflict: false
  };
}

export function decideIncomingDocument(input: IncomingDocumentInput): IncomingDocumentDecision {
  if (input.currentSection !== input.incomingSection) {
    return {
      ...acceptEditorVersion(input.incomingVersion),
      replaceDraft: true
    };
  }
  if (input.baseVersion === input.incomingVersion) {
    return {
      baseVersion: input.baseVersion,
      dirty: input.dirty,
      externalConflict: false,
      replaceDraft: false
    };
  }
  return {
    baseVersion: input.baseVersion,
    dirty: input.dirty,
    externalConflict: true,
    replaceDraft: false
  };
}

export type EditorOperationToken = {
  id: number;
  section: keyof SiteContentSections;
};

export function isEditorOperationCurrent(
  token: EditorOperationToken,
  activeToken: EditorOperationToken | null,
  currentSection: keyof SiteContentSections,
  mounted: boolean
): boolean {
  return mounted &&
    activeToken !== null &&
    token.id === activeToken.id &&
    token.section === activeToken.section &&
    token.section === currentSection;
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
