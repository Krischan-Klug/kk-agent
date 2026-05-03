import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import styled from "styled-components";
import { mcp as mcpApi, skills as skillsApi, tools as toolsApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import type { McpListItem, SkillDefinition } from "@/types/api";
import { PageBody } from "@/components/Layout.styled";
import { MasterDetailLayout } from "@/components/MasterDetail.styled";
import Button from "@/components/Button";
import { ActionsRow, MutedText } from "@/components/PageForm";
import Spinner from "@/components/Spinner";
import CreateSkillModal from "@/components/skill/CreateSkillModal";
import SkillEditor, {
  EMPTY_SKILL_DRAFT,
  skillToDraft,
  toCreateBody,
  toUpdateBody,
  type SkillDraft,
} from "@/components/skill/SkillEditor";
import SkillList from "@/components/skill/SkillList";

const logger = createLogger("skills");

const UploadSection = styled.section<{ $dragOver: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  margin-bottom: var(--space-md);
  border: 1px dashed ${({ $dragOver }) => ($dragOver ? "var(--accent)" : "var(--border)")};
  border-radius: var(--radius-md);
  background: ${({ $dragOver }) => ($dragOver ? "var(--bg-surface)" : "var(--bg-elevated)")};
`;

type SkillUploadFile = {
  file: File;
  path: string;
};

type FileSystemEntry = {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
  fullPath: string;
};

type FileSystemFileEntry = FileSystemEntry & {
  isFile: true;
  file: (callback: (file: File) => void, error?: (err: DOMException) => void) => void;
};

type FileSystemDirectoryReader = {
  readEntries: (
    callback: (entries: FileSystemEntry[]) => void,
    error?: (err: DOMException) => void,
  ) => void;
};

type FileSystemDirectoryEntry = FileSystemEntry & {
  isDirectory: true;
  createReader: () => FileSystemDirectoryReader;
};

type DragItemWithEntry = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

function buildDraftMap(skillList: SkillDefinition[]): Record<string, SkillDraft> {
  return Object.fromEntries(skillList.map((skill) => [skill.id, skillToDraft(skill)]));
}

function normalizeUploadPath(path: string, fallbackName: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/, "").trim();
  return normalized || fallbackName;
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function collectEntryFiles(entry: FileSystemEntry, basePath = ""): Promise<SkillUploadFile[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await fileFromEntry(fileEntry);
    return [{ file, path: normalizeUploadPath(`${basePath}${entry.name}`, file.name) }];
  }

  const directoryEntry = entry as FileSystemDirectoryEntry;
  const reader = directoryEntry.createReader();
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
    const itemWithEntry = item as DragItemWithEntry;
    const entry = itemWithEntry.webkitGetAsEntry?.();
    if (entry) {
      collected.push(...await collectEntryFiles(entry));
      continue;
    }
    const file = item.getAsFile();
    if (file) collected.push({ file, path: file.name });
  }
  return collected;
}

function filesFromInput(fileList: FileList): SkillUploadFile[] {
  return Array.from(fileList).map((file) => ({
    file,
    path: normalizeUploadPath(file.webkitRelativePath || file.name, file.name),
  }));
}

export default function SkillsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [internalTools, setInternalTools] = useState<McpListItem[]>([]);
  const [mcps, setMcps] = useState<McpListItem[]>([]);
  const [editDrafts, setEditDrafts] = useState<Record<string, SkillDraft>>({});
  const [createDraft, setCreateDraft] = useState<SkillDraft | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const createDraftRef = useRef<SkillDraft | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);

  const sortedSkills = useMemo(
    () => [...skills].sort((left, right) => left.name.localeCompare(right.name)),
    [skills],
  );

  const usageBySkillId = useMemo(() => {
    const map = new Map<string, { tools: string[]; mcps: string[] }>();
    const ensure = (id: string) => {
      let entry = map.get(id);
      if (!entry) {
        entry = { tools: [], mcps: [] };
        map.set(id, entry);
      }
      return entry;
    };

    for (const tool of internalTools) {
      for (const skillId of tool.skillIds ?? []) ensure(skillId).tools.push(tool.name);
    }
    for (const mcp of mcps) {
      for (const skillId of mcp.skillIds ?? []) ensure(skillId).mcps.push(mcp.name);
    }

    return map;
  }, [internalTools, mcps]);

  const selectedSkill = createDraft ? null : sortedSkills.find((skill) => skill.id === selectedId) ?? null;
  const activeDraft = createDraft ?? (selectedSkill ? editDrafts[selectedSkill.id] ?? skillToDraft(selectedSkill) : null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    createDraftRef.current = createDraft;
  }, [createDraft]);

  const loadAll = useCallback(async (nextSelectedId?: string | null) => {
    try {
      const [skillList, toolList, mcpList] = await Promise.all([
        skillsApi.list(),
        toolsApi.list(),
        mcpApi.list(),
      ]);

      const sorted = [...skillList].sort((left, right) => left.name.localeCompare(right.name));
      setSkills(sorted);
      setInternalTools(toolList);
      setMcps(mcpList);
      setEditDrafts(buildDraftMap(sorted));

      if (createDraftRef.current) return;
      if (sorted.length === 0) {
        setSelectedId(null);
        return;
      }

      const desiredId = nextSelectedId === undefined ? selectedIdRef.current : nextSelectedId;
      if (desiredId && sorted.some((skill) => skill.id === desiredId)) {
        setSelectedId(desiredId);
        return;
      }

      setSelectedId(sorted[0].id);
    } catch (err) {
      logger.error("Failed to load skills:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function importFiles(files: SkillUploadFile[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const imported = await skillsApi.importBundle(files);
      await loadAll(imported.skill.id);
    } catch (err) {
      logger.error("Failed to import skill bundle:", err);
    } finally {
      setUploading(false);
      setDragOver(false);
      if (directoryInputRef.current) directoryInputRef.current.value = "";
    }
  }

  function selectSkill(id: string) {
    setCreateDraft(null);
    setSelectedId(id);
  }

  function handleDraftChange(nextDraft: SkillDraft) {
    if (createDraft) {
      setCreateDraft(nextDraft);
      return;
    }

    if (!selectedSkill) return;
    setEditDrafts((previous) => ({
      ...previous,
      [selectedSkill.id]: nextDraft,
    }));
  }

  function startCreate() {
    const trimmedName = newName.trim();
    setCreateDraft({
      ...EMPTY_SKILL_DRAFT,
      name: trimmedName,
    });
    setSelectedId(null);
    setShowCreate(false);
    setNewName("");
  }

  async function handleSave() {
    if (!activeDraft) return;

    setSaving(true);
    try {
      if (createDraft) {
        const created = await skillsApi.create(toCreateBody(createDraft));
        await skillsApi.updateLinks(created.id, {
          toolIds: createDraft.linkedToolIds,
          mcpIds: createDraft.linkedMcpIds,
        });
        setCreateDraft(null);
        await loadAll(created.id);
        return;
      }

      if (!selectedSkill) return;
      await skillsApi.update(selectedSkill.id, toUpdateBody(activeDraft));
      await skillsApi.updateLinks(selectedSkill.id, {
        toolIds: activeDraft.linkedToolIds,
        mcpIds: activeDraft.linkedMcpIds,
      });
      await loadAll(selectedSkill.id);
    } catch (err) {
      logger.error(createDraft ? "Failed to create skill:" : "Failed to save skill:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedSkill) return;

    setSaving(true);
    try {
      await skillsApi.delete(selectedSkill.id);
      await loadAll(null);
    } catch (err) {
      logger.error("Failed to delete skill:", err);
    } finally {
      setSaving(false);
    }
  }

  function cancelCreate() {
    setCreateDraft(null);
    if (sortedSkills.length > 0) {
      setSelectedId(sortedSkills[0].id);
    }
  }

  async function handleDirectoryChange(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    await importFiles(filesFromInput(fileList));
  }

  if (loading) return <Spinner />;

  return (
    <PageBody>
      <UploadSection
        $dragOver={dragOver}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          void extractDroppedFiles(event.dataTransfer.items).then(importFiles).catch((error) => {
            logger.error("Failed to read dropped skill bundle:", error);
            setDragOver(false);
          });
        }}
      >
        <strong>Skill-Bundle importieren</strong>
        <MutedText>
          Ziehe einen Skill-Ordner hierher oder waehle ihn ueber den Upload-Button aus. Erforderlich ist ein Bundle mit genau einem <code>SKILL.md</code>.
        </MutedText>
        <ActionsRow>
          <Button
            type="button"
            variant="secondary"
            onClick={() => directoryInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Importiert..." : "Bundle hochladen"}
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
        <SkillList
          skills={sortedSkills}
          selectedId={selectedId}
          createDraftName={createDraft?.name}
          usageBySkillId={usageBySkillId}
          onSelect={selectSkill}
          onCreate={() => setShowCreate(true)}
        />
        <SkillEditor
          skill={selectedSkill}
          draft={activeDraft}
          isCreateMode={createDraft !== null}
          saving={saving}
          internalTools={internalTools}
          mcps={mcps}
          usage={selectedSkill ? usageBySkillId.get(selectedSkill.id) : undefined}
          onChange={handleDraftChange}
          onSave={() => void handleSave()}
          onDelete={() => void handleDelete()}
          onCancelCreate={cancelCreate}
        />
      </MasterDetailLayout>
      <CreateSkillModal
        open={showCreate}
        name={newName}
        onNameChange={setNewName}
        onCreate={startCreate}
        onClose={() => setShowCreate(false)}
      />
    </PageBody>
  );
}
