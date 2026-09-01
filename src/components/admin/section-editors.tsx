import { useId, type ReactElement } from "react";

import type {
  CodexProject,
  CodexSection,
  CodexTimelineEntry,
  ContactSection,
  ContentLink,
  HomeSection,
  ResumeCompany,
  ResumePoint,
  ResumeProject,
  ResumeSection,
  SectionHeading,
  ShowcaseSection,
  SkillGroup,
  SkillItem,
  SkillsSection,
  SiteContentSections
} from "../../../shared/site-content-schema.ts";
import { createEditorId, insertListItem, moveListItem, removeListItem } from "./editor-helpers.ts";

export type AdminSectionKey = keyof SiteContentSections;

type FieldProps = {
  label: string;
  value: string;
  onChange(value: string): void;
  multiline?: boolean;
  type?: "text" | "email" | "tel" | "url";
  placeholder?: string;
};

function Field({ label, value, onChange, multiline = false, type = "text", placeholder }: FieldProps) {
  const id = useId();
  return (
    <label htmlFor={id} className="admin-editor-field">
      <span>{label}</span>
      {multiline ? (
        <textarea id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function itemLabel(label: string, index: number) {
  return label + " " + (index + 1);
}

type ListActionsProps = {
  label: string;
  index: number;
  length: number;
  onMove(offset: -1 | 1): void;
  onDelete(): void;
};

function ListActions({ label, index, length, onMove, onDelete }: ListActionsProps) {
  return (
    <div className="admin-editor-list-actions" aria-label={label}>
      <button type="button" disabled={index === 0} onClick={() => onMove(-1)}>上移</button>
      <button type="button" disabled={index === length - 1} onClick={() => onMove(1)}>下移</button>
      <button type="button" onClick={() => {
        if (window.confirm("确认删除" + label + "？")) onDelete();
      }}>删除</button>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick(): void }) {
  return <button type="button" onClick={onClick}>添加{label}</button>;
}

function HeadingFields<T extends SectionHeading>({ value, onChange }: { value: T; onChange(value: T): void }) {
  return (
    <>
      <Field label="眉标题" value={value.eyebrow} onChange={(eyebrow) => onChange({ ...value, eyebrow })} />
      <Field label="栏目标题" value={value.title} onChange={(title) => onChange({ ...value, title })} />
      <Field label="栏目说明" multiline value={value.copy} onChange={(copy) => onChange({ ...value, copy })} />
    </>
  );
}

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((current, currentIndex) => currentIndex === index ? item : current);
}

type PrimitiveListProps = {
  label: string;
  items: string[];
  starter: string;
  multiline?: boolean;
  onChange(items: string[]): void;
};

function PrimitiveList({ label, items, starter, multiline = false, onChange }: PrimitiveListProps) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {items.map((item, index) => (
        <div key={index} className="admin-editor-list-item">
          <Field label={itemLabel(label, index)} multiline={multiline} value={item} onChange={(next) => onChange(replaceAt(items, index, next))} />
          <ListActions
            label={itemLabel(label, index)}
            index={index}
            length={items.length}
            onMove={(offset) => onChange(moveListItem(items, index, offset))}
            onDelete={() => onChange(removeListItem(items, index))}
          />
        </div>
      ))}
      <AddButton label={label} onClick={() => onChange(insertListItem(items, items.length, starter))} />
    </fieldset>
  );
}

function HomeEditor({ value, onChange }: { value: HomeSection; onChange(value: HomeSection): void }) {
  return (
    <div className="admin-section-fields">
      <Field label="眉标题" value={value.eyebrow} onChange={(eyebrow) => onChange({ ...value, eyebrow })} />
      <PrimitiveList label="主标题行" items={value.titleLines} starter="新标题" onChange={(titleLines) => onChange({ ...value, titleLines })} />
      <Field label="副标题" multiline value={value.subtitle} onChange={(subtitle) => onChange({ ...value, subtitle })} />
      <Field label="主要按钮文字" value={value.primaryActionLabel} onChange={(primaryActionLabel) => onChange({ ...value, primaryActionLabel })} />
      <Field label="次要按钮文字" value={value.secondaryActionLabel} onChange={(secondaryActionLabel) => onChange({ ...value, secondaryActionLabel })} />
    </div>
  );
}

function newContentLink(): ContentLink {
  return { id: createEditorId(), label: "新链接", href: "https://example.com" };
}

function newTimelineEntry(): CodexTimelineEntry {
  return { id: createEditorId(), date: "日期未定", status: "planned", title: "新时间线事项", detail: "请填写事项说明。" };
}

function newCodexProject(): CodexProject {
  return {
    id: createEditorId(),
    title: "新项目",
    stage: "规划中",
    updated: "日期未定",
    summary: "请填写项目简介。",
    milestones: ["新里程碑"],
    next: "请填写下一步。",
    links: [],
    visibility: "暂未公开",
    timeline: []
  };
}

function StatusField({ value, onChange }: { value: CodexTimelineEntry["status"]; onChange(value: CodexTimelineEntry["status"]): void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="admin-editor-field">
      <span>状态</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as CodexTimelineEntry["status"])}>
        <option value="completed">已完成</option>
        <option value="current">进行中</option>
        <option value="planned">计划中</option>
      </select>
    </label>
  );
}

function CodexEditor({ value, onChange }: { value: CodexSection; onChange(value: CodexSection): void }) {
  const updateProject = (index: number, project: CodexProject) => onChange({ ...value, projects: replaceAt(value.projects, index, project) });
  return (
    <div className="admin-section-fields">
      <HeadingFields value={value} onChange={onChange} />
      <fieldset>
        <legend>项目列表</legend>
        {value.projects.map((project, projectIndex) => (
          <fieldset key={project.id} className="admin-editor-list-item">
            <legend>{itemLabel("项目", projectIndex)}</legend>
            <ListActions
              label={itemLabel("项目", projectIndex)}
              index={projectIndex}
              length={value.projects.length}
              onMove={(offset) => onChange({ ...value, projects: moveListItem(value.projects, projectIndex, offset) })}
              onDelete={() => onChange({ ...value, projects: removeListItem(value.projects, projectIndex) })}
            />
            <Field label="项目标题" value={project.title} onChange={(title) => updateProject(projectIndex, { ...project, title })} />
            <Field label="项目阶段" value={project.stage} onChange={(stage) => updateProject(projectIndex, { ...project, stage })} />
            <Field label="更新时间" value={project.updated} onChange={(updated) => updateProject(projectIndex, { ...project, updated })} />
            <Field label="项目简介" multiline value={project.summary} onChange={(summary) => updateProject(projectIndex, { ...project, summary })} />
            <Field label="下一步" multiline value={project.next} onChange={(next) => updateProject(projectIndex, { ...project, next })} />
            <Field label="公开状态" value={project.visibility} onChange={(visibility) => updateProject(projectIndex, { ...project, visibility })} />
            <PrimitiveList
              label="里程碑"
              items={project.milestones}
              starter="新里程碑"
              multiline
              onChange={(milestones) => updateProject(projectIndex, { ...project, milestones })}
            />
            <fieldset>
              <legend>项目链接</legend>
              {project.links.map((link, index) => (
                <div key={link.id} className="admin-editor-list-item">
                  <Field label={itemLabel("链接名称", index)} value={link.label} onChange={(label) => updateProject(projectIndex, {
                    ...project,
                    links: replaceAt(project.links, index, { ...link, label })
                  })} />
                  <Field label={itemLabel("链接地址", index)} type="url" value={link.href} onChange={(href) => updateProject(projectIndex, {
                    ...project,
                    links: replaceAt(project.links, index, { ...link, href })
                  })} />
                  <ListActions
                    label={itemLabel("项目链接", index)}
                    index={index}
                    length={project.links.length}
                    onMove={(offset) => updateProject(projectIndex, { ...project, links: moveListItem(project.links, index, offset) })}
                    onDelete={() => updateProject(projectIndex, { ...project, links: removeListItem(project.links, index) })}
                  />
                </div>
              ))}
              <AddButton label="项目链接" onClick={() => updateProject(projectIndex, {
                ...project,
                links: insertListItem(project.links, project.links.length, newContentLink())
              })} />
            </fieldset>
            <fieldset>
              <legend>时间线</legend>
              {project.timeline.map((entry, index) => (
                <fieldset key={entry.id} className="admin-editor-list-item">
                  <legend>{itemLabel("时间线事项", index)}</legend>
                  <Field label="日期" value={entry.date} onChange={(date) => updateProject(projectIndex, {
                    ...project,
                    timeline: replaceAt(project.timeline, index, { ...entry, date })
                  })} />
                  <StatusField value={entry.status} onChange={(status) => updateProject(projectIndex, {
                    ...project,
                    timeline: replaceAt(project.timeline, index, { ...entry, status })
                  })} />
                  <Field label="事项标题" value={entry.title} onChange={(title) => updateProject(projectIndex, {
                    ...project,
                    timeline: replaceAt(project.timeline, index, { ...entry, title })
                  })} />
                  <Field label="事项详情" multiline value={entry.detail} onChange={(detail) => updateProject(projectIndex, {
                    ...project,
                    timeline: replaceAt(project.timeline, index, { ...entry, detail })
                  })} />
                  <ListActions
                    label={itemLabel("时间线事项", index)}
                    index={index}
                    length={project.timeline.length}
                    onMove={(offset) => updateProject(projectIndex, { ...project, timeline: moveListItem(project.timeline, index, offset) })}
                    onDelete={() => updateProject(projectIndex, { ...project, timeline: removeListItem(project.timeline, index) })}
                  />
                </fieldset>
              ))}
              <AddButton label="时间线事项" onClick={() => updateProject(projectIndex, {
                ...project,
                timeline: insertListItem(project.timeline, project.timeline.length, newTimelineEntry())
              })} />
            </fieldset>
          </fieldset>
        ))}
        <AddButton label="项目" onClick={() => onChange({
          ...value,
          projects: insertListItem(value.projects, value.projects.length, newCodexProject())
        })} />
      </fieldset>
    </div>
  );
}

function ShowcaseEditor({ value, onChange }: { value: ShowcaseSection; onChange(value: ShowcaseSection): void }) {
  return (
    <div className="admin-section-fields">
      <HeadingFields value={value} onChange={onChange} />
      <Field label="卡片标题" value={value.cardTitle} onChange={(cardTitle) => onChange({ ...value, cardTitle })} />
      <Field label="卡片说明" multiline value={value.cardDescription} onChange={(cardDescription) => onChange({ ...value, cardDescription })} />
      <PrimitiveList label="标签" items={value.tags} starter="新标签" onChange={(tags) => onChange({ ...value, tags })} />
      <Field label="下载按钮文字" value={value.downloadLabel} onChange={(downloadLabel) => onChange({ ...value, downloadLabel })} />
      <Field label="下载文件目标" value={value.downloadHref} placeholder="files/example.pdf" onChange={(downloadHref) => onChange({ ...value, downloadHref })} />
    </div>
  );
}

function newSkillItem(): SkillItem {
  return { id: createEditorId(), label: "新技能" };
}

function newSkillGroup(): SkillGroup {
  return { id: createEditorId(), title: "新技能组", items: [newSkillItem()] };
}

function SkillsEditor({ value, onChange }: { value: SkillsSection; onChange(value: SkillsSection): void }) {
  const updateGroup = (index: number, group: SkillGroup) => onChange({ ...value, groups: replaceAt(value.groups, index, group) });
  return (
    <div className="admin-section-fields">
      <HeadingFields value={value} onChange={onChange} />
      <fieldset>
        <legend>技能组</legend>
        {value.groups.map((group, groupIndex) => (
          <fieldset key={group.id} className="admin-editor-list-item">
            <legend>{itemLabel("技能组", groupIndex)}</legend>
            <Field label="技能组标题" value={group.title} onChange={(title) => updateGroup(groupIndex, { ...group, title })} />
            <ListActions
              label={itemLabel("技能组", groupIndex)}
              index={groupIndex}
              length={value.groups.length}
              onMove={(offset) => onChange({ ...value, groups: moveListItem(value.groups, groupIndex, offset) })}
              onDelete={() => onChange({ ...value, groups: removeListItem(value.groups, groupIndex) })}
            />
            <fieldset>
              <legend>技能项</legend>
              {group.items.map((item, itemIndex) => (
                <div key={item.id} className="admin-editor-list-item">
                  <Field label={itemLabel("技能项", itemIndex)} value={item.label} onChange={(label) => updateGroup(groupIndex, {
                    ...group,
                    items: replaceAt(group.items, itemIndex, { ...item, label })
                  })} />
                  <ListActions
                    label={itemLabel("技能项", itemIndex)}
                    index={itemIndex}
                    length={group.items.length}
                    onMove={(offset) => updateGroup(groupIndex, { ...group, items: moveListItem(group.items, itemIndex, offset) })}
                    onDelete={() => updateGroup(groupIndex, { ...group, items: removeListItem(group.items, itemIndex) })}
                  />
                </div>
              ))}
              <AddButton label="技能项" onClick={() => updateGroup(groupIndex, {
                ...group,
                items: insertListItem(group.items, group.items.length, newSkillItem())
              })} />
            </fieldset>
          </fieldset>
        ))}
        <AddButton label="技能组" onClick={() => onChange({
          ...value,
          groups: insertListItem(value.groups, value.groups.length, newSkillGroup())
        })} />
      </fieldset>
    </div>
  );
}

function newResumePoint(): ResumePoint {
  return { id: createEditorId(), text: "新经历要点" };
}

function newResumeProject(): ResumeProject {
  return { id: createEditorId(), title: "新项目经历", time: "时间待填写", summary: "请填写项目说明。", points: [newResumePoint()] };
}

function newResumeCompany(): ResumeCompany {
  return { id: createEditorId(), company: "新公司", period: "时间待填写", role: "职位待填写", projects: [newResumeProject()] };
}

function ResumeEditor({ value, onChange }: { value: ResumeSection; onChange(value: ResumeSection): void }) {
  const updateCompany = (index: number, company: ResumeCompany) => onChange({ ...value, companies: replaceAt(value.companies, index, company) });
  return (
    <div className="admin-section-fields">
      <HeadingFields value={value} onChange={onChange} />
      <fieldset>
        <legend>公司经历</legend>
        {value.companies.map((company, companyIndex) => {
          const updateProject = (projectIndex: number, project: ResumeProject) => updateCompany(companyIndex, {
            ...company,
            projects: replaceAt(company.projects, projectIndex, project)
          });
          return (
            <fieldset key={company.id} className="admin-editor-list-item">
              <legend>{itemLabel("公司", companyIndex)}</legend>
              <Field label="公司名称" value={company.company} onChange={(companyName) => updateCompany(companyIndex, { ...company, company: companyName })} />
              <Field label="任职时间" value={company.period} onChange={(period) => updateCompany(companyIndex, { ...company, period })} />
              <Field label="职位" value={company.role} onChange={(role) => updateCompany(companyIndex, { ...company, role })} />
              <ListActions
                label={itemLabel("公司", companyIndex)}
                index={companyIndex}
                length={value.companies.length}
                onMove={(offset) => onChange({ ...value, companies: moveListItem(value.companies, companyIndex, offset) })}
                onDelete={() => onChange({ ...value, companies: removeListItem(value.companies, companyIndex) })}
              />
              <fieldset>
                <legend>项目经历</legend>
                {company.projects.map((project, projectIndex) => (
                  <fieldset key={project.id} className="admin-editor-list-item">
                    <legend>{itemLabel("项目经历", projectIndex)}</legend>
                    <Field label="项目名称" value={project.title} onChange={(title) => updateProject(projectIndex, { ...project, title })} />
                    <Field label="项目时间" value={project.time} onChange={(time) => updateProject(projectIndex, { ...project, time })} />
                    <Field label="项目说明" multiline value={project.summary} onChange={(summary) => updateProject(projectIndex, { ...project, summary })} />
                    <ListActions
                      label={itemLabel("项目经历", projectIndex)}
                      index={projectIndex}
                      length={company.projects.length}
                      onMove={(offset) => updateCompany(companyIndex, { ...company, projects: moveListItem(company.projects, projectIndex, offset) })}
                      onDelete={() => updateCompany(companyIndex, { ...company, projects: removeListItem(company.projects, projectIndex) })}
                    />
                    <fieldset>
                      <legend>经历要点</legend>
                      {project.points.map((point, pointIndex) => (
                        <div key={point.id} className="admin-editor-list-item">
                          <Field label={itemLabel("经历要点", pointIndex)} multiline value={point.text} onChange={(text) => updateProject(projectIndex, {
                            ...project,
                            points: replaceAt(project.points, pointIndex, { ...point, text })
                          })} />
                          <ListActions
                            label={itemLabel("经历要点", pointIndex)}
                            index={pointIndex}
                            length={project.points.length}
                            onMove={(offset) => updateProject(projectIndex, { ...project, points: moveListItem(project.points, pointIndex, offset) })}
                            onDelete={() => updateProject(projectIndex, { ...project, points: removeListItem(project.points, pointIndex) })}
                          />
                        </div>
                      ))}
                      <AddButton label="经历要点" onClick={() => updateProject(projectIndex, {
                        ...project,
                        points: insertListItem(project.points, project.points.length, newResumePoint())
                      })} />
                    </fieldset>
                  </fieldset>
                ))}
                <AddButton label="项目经历" onClick={() => updateCompany(companyIndex, {
                  ...company,
                  projects: insertListItem(company.projects, company.projects.length, newResumeProject())
                })} />
              </fieldset>
            </fieldset>
          );
        })}
        <AddButton label="公司经历" onClick={() => onChange({
          ...value,
          companies: insertListItem(value.companies, value.companies.length, newResumeCompany())
        })} />
      </fieldset>
    </div>
  );
}

function ContactEditor({ value, onChange }: { value: ContactSection; onChange(value: ContactSection): void }) {
  return (
    <div className="admin-section-fields">
      <Field label="眉标题" value={value.eyebrow} onChange={(eyebrow) => onChange({ ...value, eyebrow })} />
      <Field label="联系标题" value={value.title} onChange={(title) => onChange({ ...value, title })} />
      <Field label="联系信息摘要" value={value.details} onChange={(details) => onChange({ ...value, details })} />
      <Field label="弹窗标题" value={value.modalTitle} onChange={(modalTitle) => onChange({ ...value, modalTitle })} />
      <Field label="弹窗地区" value={value.modalRegion} onChange={(modalRegion) => onChange({ ...value, modalRegion })} />
      <Field label="弹窗说明" multiline value={value.modalDescription} onChange={(modalDescription) => onChange({ ...value, modalDescription })} />
      <Field label="电话号码" type="tel" value={value.phone} onChange={(phone) => onChange({ ...value, phone })} />
      <Field label="电子邮箱" type="email" value={value.email} onChange={(email) => onChange({ ...value, email })} />
    </div>
  );
}

export type TypedSectionEditorProps = {
  section: AdminSectionKey;
  value: SiteContentSections[AdminSectionKey];
  onChange(value: SiteContentSections[AdminSectionKey]): void;
};

export function TypedSectionEditor({ section, value, onChange }: TypedSectionEditorProps): ReactElement {
  switch (section) {
    case "home":
      return <HomeEditor value={value as HomeSection} onChange={onChange} />;
    case "codex":
      return <CodexEditor value={value as CodexSection} onChange={onChange} />;
    case "showcase":
      return <ShowcaseEditor value={value as ShowcaseSection} onChange={onChange} />;
    case "skills":
      return <SkillsEditor value={value as SkillsSection} onChange={onChange} />;
    case "resume":
      return <ResumeEditor value={value as ResumeSection} onChange={onChange} />;
    case "contact":
      return <ContactEditor value={value as ContactSection} onChange={onChange} />;
  }
}
