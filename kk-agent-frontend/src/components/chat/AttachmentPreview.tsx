import styled from "styled-components";
import type { PendingAttachment } from "@/hooks/useAttachments";
import { formatAttachmentSize, getAttachmentEmoji } from "./attachmentDisplay";

const Strip = styled.div`
  display: flex;
  gap: var(--space-sm);
  padding: 0 var(--space-md) var(--space-xs);
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Chip = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  flex-shrink: 0;
`;

const Thumbnail = styled.img`
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 3px;
`;

const FileName = styled.span`
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11px;
`;

const RemoveBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bg-hover);
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;
  line-height: 1;

  &:hover {
    background: var(--danger);
    color: var(--text-primary);
  }
`;

type Props = {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
};

export default function AttachmentPreview({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null;

  return (
    <Strip>
      {attachments.map((attachment) => (
        <Chip key={attachment.id}>
          {attachment.previewUrl ? (
            <Thumbnail src={attachment.previewUrl} alt={attachment.filename} />
          ) : (
            <span>{getAttachmentEmoji(attachment)}</span>
          )}
          <FileName title={attachment.filename}>{attachment.filename}</FileName>
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
            {formatAttachmentSize(attachment.size)}
          </span>
          <RemoveBtn onClick={() => onRemove(attachment.id)} aria-label="Entfernen">
            &times;
          </RemoveBtn>
        </Chip>
      ))}
    </Strip>
  );
}
