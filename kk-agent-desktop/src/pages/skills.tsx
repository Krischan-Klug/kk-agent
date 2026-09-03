import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import styled from "styled-components";
import { skills as skillsApi } from "@/lib/api";
import { reportError } from "@/lib/errorReporting";
import type { SkillDefinition } from "kk-agent-contract";
import { PageBody } from "@/components/Layout.styled";
import { MasterDetailLayout } from "@/components/MasterDetail.styled";
import Button from "@/components/Button";
import { ActionsRow, MutedText, Section, SectionTitle, SurfaceBox } from "@/components/PageForm";
import Spinner from "@/components/Spinner";
import SkillList from "@/components/skill/SkillList";

const UploadSection = styled.section<{ $dragOver: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: 10px var(--space-md);
  margin-bottom: var(--space-md);
  border: 1px dashed ${({ $dragOver }) => ($dragOver ? "var(--accent)" : "var(--border)")};
  border-radius: var(--radius-md);
  background: ${({ $dragOver }) => ($dragOver ? "var(--bg-surface)" : "var(--bg-elevated)")};

  @media (max-width: 620px) {
    align-items: flex-start;
    flex-wrap: wrap;
  }
`;

const UploadCopy = styled.div`
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  min-width: 0;

  ${MutedText} {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  @media (max-width: 620px) {
    display: contents;

    ${MutedText} {
      white-space: normal;
    }
  }
`;

const Detail = styled.div`
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
`;

const Title = styled.h2`
  margin: 0;
  color: var(--text-primary);
`;

const Code = styled.code`
  overflow-wrap: anywhere;
`;

const ResourceList = styled.ul`
  margin: 0;
  padding-left: var(--space-lg);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
`;

type SkillUploadFile = { file: File; path: string };
type FileSystemEntry = { isDirectory: boolean; isFile: boolean; name: string };
type FileSystemFileEntry = FileSystemEntry & {
  isFile: true;
  file: (callback: (file: File) => void, error?: (err: DOMException) => void) => void;
};
type FileSystemDirectoryReader = {
  readEntries: (callback: (entries: FileSystemEntry[]) => void, error?: (err: DOMException) => void) => void;
};
type FileSystemDirectoryEntry = FileSystemEntry & {
  isDirectory: true;
  createReader: () => FileSystemDirectoryReader;
};
type DragItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

function normalizeUploadPath(path: string, fallbackName: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "").trim();
  return normalized || fallbackName;
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function collectEntryFiles(entry: FileSystemEntry, basePath = ""): Promise<SkillUploadFile[]> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry);
    return [{ file, path: normalizeUploadPath(`${basePath}${entry.name}`, file.name) }];
  }

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const collected: SkillUploadFile[] = [];
  while (true) {
    const entries = await readDirectoryEntries(reader);
    if (entries.length === 0) break;
    for (const child of entries) {
      collected.push(...await collectEntryFiles(child, `${basePath}${entry.name}/`));
    }
  }
  return collected;
}

async function extractDroppedFiles(items: DataTransferItemList): Promise<SkillUploadFile[]> {
  const collected: SkillUploadFile[] = [];
  for (const item of Array.from(items)) {
    const entry = (item as DragItemWithEntry).webkitGetAsEntry?.();
    if (entry) {
      collected.push(...await collectEntryFiles(entry));
    } else {
      const file = item.getAsFile();
      if (file) collected.push({ file, path: file.name });
    }
  }
  return collected;
}

function filesFromInput(fileList: FileList): SkillUploadFile[] {
  return Array.from(fileList).map((file) => ({
    file,
    path: normalizeUploadPath(file.webkitRelativePath || file.name, file.name),
  }));
}

function SkillDetail({ skill, deleting, onDelete }: {
  skill: SkillDefinition | null;
  deleting: boolean;
  onDelete: () => void;
}) {
  if (!skill) {
    return <Detail><MutedText>No skills discovered.</MutedText></Detail>;
  }

  return (
    <Detail>
      <Section>
        <Title>{skill.name}</Title>
        <MutedText>{skill.description}</MutedText>
      </Section>
      <Section>
        <SectionTitle>Location</SectionTitle>
        <SurfaceBox><Code>{skill.path}</Code></SurfaceBox>
        <MutedText>{skill.source} · {skill.mutable ? "managed" : "read-only"}</MutedText>
      </Section>
      {(skill.license || skill.compatibility || skill.allowedTools) && (
        <Section>
          <SectionTitle>Standard metadata</SectionTitle>
          {skill.license && <MutedText>License: {skill.license}</MutedText>}
          {skill.compatibility && <MutedText>Compatibility: {skill.compatibility}</MutedText>}
          {skill.allowedTools && <MutedText>Allowed tools: {skill.allowedTools}</MutedText>}
        </Section>
      )}
      {Object.keys(skill.metadata).length > 0 && (
        <Section>
          <SectionTitle>Metadata</SectionTitle>
          <SurfaceBox><Code>{JSON.stringify(skill.metadata, null, 2)}</Code></SurfaceBox>
        </Section>
      )}
      <Section>
        <SectionTitle>Resources</SectionTitle>
        {skill.resources.length === 0 ? (
          <MutedText>No bundled resources.</MutedText>
        ) : (
          <ResourceList>{skill.resources.map((resource) => <li key={resource}>{resource}</li>)}</ResourceList>
        )}
      </Section>
      {skill.diagnostics.length > 0 && (
        <Section>
          <SectionTitle>Diagnostics</SectionTitle>
          {skill.diagnostics.map((diagnostic, index) => (
            <MutedText key={`${diagnostic.level}-${index}`}>{diagnostic.level}: {diagnostic.message}</MutedText>
          ))}
        </Section>
      )}
      {skill.mutable && (
        <ActionsRow>
          <Button type="button" variant="secondary" disabled={deleting} onClick={onDelete}>
            {deleting ? "Deleting..." : "Delete imported skill"}
          </Button>
        </ActionsRow>
      )}
    </Detail>
  );
}

export default function SkillsPage() {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);

  const sortedSkills = useMemo(
    () => [...skills].sort((left, right) => left.name.localeCompare(right.name)),
    [skills],
  );
  const selectedSkill = sortedSkills.find((skill) => skill.id === selectedId) ?? sortedSkills[0] ?? null;

  const loadSkills = useCallback(async (preferredId?: string | null) => {
    try {
      const skillList = await skillsApi.list();
      setSkills(skillList);
      setSelectedId((current) => {
        const desired = preferredId === undefined ? current : preferredId;
        return desired && skillList.some((skill) => skill.id === desired) ? desired : skillList[0]?.id ?? null;
      });
    } catch (error) {
      reportError("Failed to load skills", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSkills(); }, [loadSkills]);

  async function importFiles(files: SkillUploadFile[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const imported = await skillsApi.importBundle(files);
      await loadSkills(imported.skill.id);
    } catch (error) {
      reportError("Failed to import skill bundle", error);
    } finally {
      setUploading(false);
      setDragOver(false);
      if (directoryInputRef.current) directoryInputRef.current.value = "";
    }
  }

  async function deleteSelectedSkill() {
    if (!selectedSkill?.mutable) return;
    setDeleting(true);
    try {
      await skillsApi.delete(selectedSkill.id);
      await loadSkills(null);
    } catch (error) {
      reportError("Failed to delete skill", error);
    } finally {
      setDeleting(false);
    }
  }

  async function handleDirectoryChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) await importFiles(filesFromInput(event.target.files));
  }

  if (loading) return <Spinner />;

  return (
    <PageBody>
      <UploadSection
        $dragOver={dragOver}
        onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          void extractDroppedFiles(event.dataTransfer.items).then(importFiles).catch((error) => {
            reportError("Failed to read dropped skill bundle", error);
            setDragOver(false);
          });
        }}
      >
        <UploadCopy>
          <strong>Import Agent Skill</strong>
          <MutedText>Upload a skill folder with one <code>SKILL.md</code>.</MutedText>
        </UploadCopy>
        <ActionsRow>
          <Button type="button" variant="secondary" disabled={uploading} onClick={() => directoryInputRef.current?.click()}>
            {uploading ? "Importing..." : "Upload folder"}
          </Button>
        </ActionsRow>
        <input
          ref={directoryInputRef}
          type="file"
          multiple
          onChange={(event) => { void handleDirectoryChange(event); }}
          style={{ display: "none" }}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
      </UploadSection>
      <MasterDetailLayout>
        <SkillList skills={sortedSkills} selectedId={selectedSkill?.id ?? null} onSelect={setSelectedId} />
        <SkillDetail skill={selectedSkill} deleting={deleting} onDelete={() => { void deleteSelectedSkill(); }} />
      </MasterDetailLayout>
    </PageBody>
  );
}
