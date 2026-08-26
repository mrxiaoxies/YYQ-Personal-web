export const SITE_CONTENT_SCHEMA_VERSION = 1 as const;

const MAX_DOCUMENT_BYTES = 128 * 1024;
const MAX_TEXT = 2_000;
const MAX_SHORT_TEXT = 160;
const MAX_LIST_ITEMS = 60;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

export type SectionHeading = {
  eyebrow: string;
  title: string;
  copy: string;
};

export type HomeSection = {
  eyebrow: string;
  titleLines: string[];
  subtitle: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
};

export type ContentLink = {
  id: string;
  label: string;
  href: string;
};

export type CodexTimelineEntry = {
  id: string;
  date: string;
  status: "completed" | "current" | "planned";
  title: string;
  detail: string;
};

export type CodexProject = {
  id: string;
  title: string;
  stage: string;
  updated: string;
  summary: string;
  milestones: string[];
  next: string;
  links: ContentLink[];
  visibility: string;
  timeline: CodexTimelineEntry[];
};

export type CodexSection = SectionHeading & {
  projects: CodexProject[];
};

export type ShowcaseSection = SectionHeading & {
  cardTitle: string;
  cardDescription: string;
  tags: string[];
  downloadLabel: string;
  downloadHref: string;
};

export type SkillItem = {
  id: string;
  label: string;
};

export type SkillGroup = {
  id: string;
  title: string;
  items: SkillItem[];
};

export type SkillsSection = SectionHeading & {
  groups: SkillGroup[];
};

export type ResumePoint = {
  id: string;
  text: string;
};

export type ResumeProject = {
  id: string;
  title: string;
  time: string;
  summary: string;
  points: ResumePoint[];
};

export type ResumeCompany = {
  id: string;
  company: string;
  period: string;
  role: string;
  projects: ResumeProject[];
};

export type ResumeSection = SectionHeading & {
  companies: ResumeCompany[];
};

export type ContactSection = {
  eyebrow: string;
  title: string;
  details: string;
  modalTitle: string;
  modalRegion: string;
  modalDescription: string;
  phone: string;
  email: string;
};

export type SiteContentSections = {
  home: HomeSection;
  codex: CodexSection;
  showcase: ShowcaseSection;
  skills: SkillsSection;
  resume: ResumeSection;
  contact: ContactSection;
};

export type SiteContentDocument = {
  schemaVersion: typeof SITE_CONTENT_SCHEMA_VERSION;
  version: string;
  updatedAt: string;
  sections: SiteContentSections;
};

export type SiteContentUpdate = {
  expectedVersion: string;
  sections: SiteContentSections;
};

function strictObject(value: unknown, path: string, allowedKeys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new TypeError(`${path}.${key} is not allowed`);
    }
  }

  return record;
}

function requiredText(value: unknown, path: string, maxLength = MAX_TEXT): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`${path} must be a non-empty string no longer than ${maxLength} characters`);
  }

  return value;
}

function optionalText(value: unknown, path: string, maxLength = MAX_TEXT): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string" || value.length > maxLength) {
    throw new TypeError(`${path} must be a string no longer than ${maxLength} characters`);
  }

  return value;
}

function stableId(value: unknown, path: string): string {
  const id = requiredText(value, path, 80);
  if (!ID_PATTERN.test(id)) {
    throw new TypeError(`${path} must be a stable ASCII identifier`);
  }

  return id;
}

function externalUrl(value: unknown, path: string): string {
  const href = requiredText(value, path, MAX_TEXT);
  if (!/^https?:\/\//.test(href)) {
    throw new TypeError(`${path} must begin with http:// or https://`);
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new TypeError(`${path} must be an absolute http or https URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`${path} must use http: or https:`);
  }

  return href;
}

function downloadTarget(value: unknown, path: string): string {
  const target = requiredText(value, path, MAX_TEXT);
  if (
    !target.startsWith("files/") ||
    target.slice("files/".length).length === 0 ||
    target.slice("files/".length).includes("/") ||
    target.includes("..") ||
    target.includes("\\") ||
    target.includes("?") ||
    target.includes("#")
  ) {
    throw new TypeError(`${path} must be a safe files/<name> target`);
  }

  return target;
}

function boundedArray<T>(value: unknown, path: string, parseItem: (item: unknown, index: number) => T): T[] {
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) {
    throw new TypeError(`${path} must be an array with at most ${MAX_LIST_ITEMS} items`);
  }

  return value.map((item, index) => parseItem(item, index));
}

function parseHeading(value: unknown, path: string): SectionHeading {
  const record = strictObject(value, path, ["eyebrow", "title", "copy"]);
  return {
    eyebrow: requiredText(record.eyebrow, `${path}.eyebrow`, MAX_SHORT_TEXT),
    title: requiredText(record.title, `${path}.title`, MAX_SHORT_TEXT),
    copy: optionalText(record.copy, `${path}.copy`, MAX_TEXT)
  };
}

function parseHomeSection(value: unknown): HomeSection {
  const path = "sections.home";
  const record = strictObject(value, path, ["eyebrow", "titleLines", "subtitle", "primaryActionLabel", "secondaryActionLabel"]);
  return {
    eyebrow: requiredText(record.eyebrow, `${path}.eyebrow`, MAX_SHORT_TEXT),
    titleLines: boundedArray(record.titleLines, `${path}.titleLines`, (item, index) => requiredText(item, `${path}.titleLines[${index}]`, MAX_SHORT_TEXT)),
    subtitle: requiredText(record.subtitle, `${path}.subtitle`, MAX_TEXT),
    primaryActionLabel: requiredText(record.primaryActionLabel, `${path}.primaryActionLabel`, MAX_SHORT_TEXT),
    secondaryActionLabel: requiredText(record.secondaryActionLabel, `${path}.secondaryActionLabel`, MAX_SHORT_TEXT)
  };
}

function parseCodexProject(value: unknown, index: number): CodexProject {
  const path = `sections.codex.projects[${index}]`;
  const record = strictObject(value, path, ["id", "title", "stage", "updated", "summary", "milestones", "next", "links", "visibility", "timeline"]);
  return {
    id: stableId(record.id, `${path}.id`),
    title: requiredText(record.title, `${path}.title`, MAX_SHORT_TEXT),
    stage: requiredText(record.stage, `${path}.stage`, MAX_SHORT_TEXT),
    updated: requiredText(record.updated, `${path}.updated`, MAX_SHORT_TEXT),
    summary: requiredText(record.summary, `${path}.summary`),
    milestones: boundedArray(record.milestones, `${path}.milestones`, (item, milestoneIndex) => requiredText(item, `${path}.milestones[${milestoneIndex}]`, MAX_TEXT)),
    next: requiredText(record.next, `${path}.next`),
    links: boundedArray(record.links, `${path}.links`, (item, linkIndex) => {
      const linkPath = `${path}.links[${linkIndex}]`;
      const link = strictObject(item, linkPath, ["id", "label", "href"]);
      return {
        id: stableId(link.id, `${linkPath}.id`),
        label: requiredText(link.label, `${linkPath}.label`, MAX_SHORT_TEXT),
        href: externalUrl(link.href, `${linkPath}.href`)
      };
    }),
    visibility: requiredText(record.visibility, `${path}.visibility`, MAX_SHORT_TEXT),
    timeline: boundedArray(record.timeline, `${path}.timeline`, (item, timelineIndex) => {
      const entryPath = `${path}.timeline[${timelineIndex}]`;
      const entry = strictObject(item, entryPath, ["id", "date", "status", "title", "detail"]);
      const status = requiredText(entry.status, `${entryPath}.status`, MAX_SHORT_TEXT);
      if (status !== "completed" && status !== "current" && status !== "planned") {
        throw new TypeError(`${entryPath}.status must be completed, current, or planned`);
      }
      return {
        id: stableId(entry.id, `${entryPath}.id`),
        date: requiredText(entry.date, `${entryPath}.date`, MAX_SHORT_TEXT),
        status,
        title: requiredText(entry.title, `${entryPath}.title`, MAX_SHORT_TEXT),
        detail: requiredText(entry.detail, `${entryPath}.detail`)
      };
    })
  };
}

function parseCodexSection(value: unknown): CodexSection {
  const path = "sections.codex";
  const record = strictObject(value, path, ["eyebrow", "title", "copy", "projects"]);
  return {
    ...parseHeading({ eyebrow: record.eyebrow, title: record.title, copy: record.copy }, path),
    projects: boundedArray(record.projects, `${path}.projects`, parseCodexProject)
  };
}

function parseShowcaseSection(value: unknown): ShowcaseSection {
  const path = "sections.showcase";
  const record = strictObject(value, path, ["eyebrow", "title", "copy", "cardTitle", "cardDescription", "tags", "downloadLabel", "downloadHref"]);
  return {
    ...parseHeading({ eyebrow: record.eyebrow, title: record.title, copy: record.copy }, path),
    cardTitle: requiredText(record.cardTitle, `${path}.cardTitle`, MAX_SHORT_TEXT),
    cardDescription: requiredText(record.cardDescription, `${path}.cardDescription`),
    tags: boundedArray(record.tags, `${path}.tags`, (item, index) => requiredText(item, `${path}.tags[${index}]`, MAX_SHORT_TEXT)),
    downloadLabel: requiredText(record.downloadLabel, `${path}.downloadLabel`, MAX_SHORT_TEXT),
    downloadHref: downloadTarget(record.downloadHref, `${path}.downloadHref`)
  };
}

function parseSkillsSection(value: unknown): SkillsSection {
  const path = "sections.skills";
  const record = strictObject(value, path, ["eyebrow", "title", "copy", "groups"]);
  return {
    ...parseHeading({ eyebrow: record.eyebrow, title: record.title, copy: record.copy }, path),
    groups: boundedArray(record.groups, `${path}.groups`, (item, groupIndex) => {
      const groupPath = `${path}.groups[${groupIndex}]`;
      const group = strictObject(item, groupPath, ["id", "title", "items"]);
      return {
        id: stableId(group.id, `${groupPath}.id`),
        title: requiredText(group.title, `${groupPath}.title`, MAX_SHORT_TEXT),
        items: boundedArray(group.items, `${groupPath}.items`, (item, itemIndex) => {
          const itemPath = `${groupPath}.items[${itemIndex}]`;
          const skill = strictObject(item, itemPath, ["id", "label"]);
          return {
            id: stableId(skill.id, `${itemPath}.id`),
            label: requiredText(skill.label, `${itemPath}.label`, MAX_SHORT_TEXT)
          };
        })
      };
    })
  };
}

function parseResumeSection(value: unknown): ResumeSection {
  const path = "sections.resume";
  const record = strictObject(value, path, ["eyebrow", "title", "copy", "companies"]);
  return {
    ...parseHeading({ eyebrow: record.eyebrow, title: record.title, copy: record.copy }, path),
    companies: boundedArray(record.companies, `${path}.companies`, (item, companyIndex) => {
      const companyPath = `${path}.companies[${companyIndex}]`;
      const company = strictObject(item, companyPath, ["id", "company", "period", "role", "projects"]);
      return {
        id: stableId(company.id, `${companyPath}.id`),
        company: requiredText(company.company, `${companyPath}.company`, MAX_SHORT_TEXT),
        period: requiredText(company.period, `${companyPath}.period`, MAX_SHORT_TEXT),
        role: requiredText(company.role, `${companyPath}.role`, MAX_SHORT_TEXT),
        projects: boundedArray(company.projects, `${companyPath}.projects`, (projectItem, projectIndex) => {
          const projectPath = `${companyPath}.projects[${projectIndex}]`;
          const project = strictObject(projectItem, projectPath, ["id", "title", "time", "summary", "points"]);
          return {
            id: stableId(project.id, `${projectPath}.id`),
            title: requiredText(project.title, `${projectPath}.title`, MAX_SHORT_TEXT),
            time: requiredText(project.time, `${projectPath}.time`, MAX_SHORT_TEXT),
            summary: requiredText(project.summary, `${projectPath}.summary`),
            points: boundedArray(project.points, `${projectPath}.points`, (pointItem, pointIndex) => {
              const pointPath = `${projectPath}.points[${pointIndex}]`;
              const point = strictObject(pointItem, pointPath, ["id", "text"]);
              return {
                id: stableId(point.id, `${pointPath}.id`),
                text: requiredText(point.text, `${pointPath}.text`, MAX_TEXT)
              };
            })
          };
        })
      };
    })
  };
}

function parseContactSection(value: unknown): ContactSection {
  const path = "sections.contact";
  const record = strictObject(value, path, ["eyebrow", "title", "details", "modalTitle", "modalRegion", "modalDescription", "phone", "email"]);
  return {
    eyebrow: requiredText(record.eyebrow, `${path}.eyebrow`, MAX_SHORT_TEXT),
    title: requiredText(record.title, `${path}.title`, MAX_SHORT_TEXT),
    details: requiredText(record.details, `${path}.details`, MAX_SHORT_TEXT),
    modalTitle: requiredText(record.modalTitle, `${path}.modalTitle`, MAX_SHORT_TEXT),
    modalRegion: requiredText(record.modalRegion, `${path}.modalRegion`, MAX_SHORT_TEXT),
    modalDescription: requiredText(record.modalDescription, `${path}.modalDescription`),
    phone: requiredText(record.phone, `${path}.phone`, MAX_SHORT_TEXT),
    email: requiredText(record.email, `${path}.email`, MAX_SHORT_TEXT)
  };
}

function parseSections(value: unknown): SiteContentSections {
  const path = "sections";
  const record = strictObject(value, path, ["home", "codex", "showcase", "skills", "resume", "contact"]);
  return {
    home: parseHomeSection(record.home),
    codex: parseCodexSection(record.codex),
    showcase: parseShowcaseSection(record.showcase),
    skills: parseSkillsSection(record.skills),
    resume: parseResumeSection(record.resume),
    contact: parseContactSection(record.contact)
  };
}

export function parseSiteContentDocument(value: unknown): SiteContentDocument {
  const record = strictObject(value, "document", ["schemaVersion", "version", "updatedAt", "sections"]);
  if (record.schemaVersion !== SITE_CONTENT_SCHEMA_VERSION) {
    throw new TypeError(`document.schemaVersion must be ${SITE_CONTENT_SCHEMA_VERSION}`);
  }

  return {
    schemaVersion: SITE_CONTENT_SCHEMA_VERSION,
    version: requiredText(record.version, "document.version", MAX_SHORT_TEXT),
    updatedAt: requiredText(record.updatedAt, "document.updatedAt", MAX_SHORT_TEXT),
    sections: parseSections(record.sections)
  };
}

export function parseSiteContentUpdate(value: unknown): SiteContentUpdate {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError("update must be JSON-serializable");
  }
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > MAX_DOCUMENT_BYTES) {
    throw new TypeError(`update must be no larger than ${MAX_DOCUMENT_BYTES} bytes`);
  }

  const record = strictObject(value, "update", ["expectedVersion", "sections"]);
  return {
    expectedVersion: requiredText(record.expectedVersion, "update.expectedVersion", MAX_SHORT_TEXT),
    sections: parseSections(record.sections)
  };
}
