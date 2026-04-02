import styled from "styled-components";
import type { AttachmentDisplayMeta } from "@/types/api";
import {
  formatAttachmentSize,
  getAttachmentEmoji,
  isImageAttachment,
} from "./attachmentDisplay";

const Strip = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
`;

const ImageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-sm);
`;

const ImageCard = styled.figure`
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius-md) - 2px);
  background: color-mix(in srgb, var(--bg-elevated) 88%, black 12%);
`;

const PreviewImage = styled.img`
  display: block;
  width: 100%;
  max-height: 260px;
  object-fit: cover;
  background: var(--bg-elevated);
`;

const ImageMeta = styled.figcaption`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border-top: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  font-family: var(--font-mono);
`;

const FileList = styled.div`
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
`;

const FileChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 6px var(--space-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
`;

const FileIcon = styled.span`
  font-size: 18px;
  line-height: 1;
`;

const FileMeta = styled.span`
  display: inline-flex;
  align-items: baseline;
  min-width: 0;
  gap: var(--space-xs);
`;

const FileName = styled.span`
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
`;

const FileSize = styled.span`
  color: var(--text-muted);
`;

type Props = {
  attachments: AttachmentDisplayMeta[];
};

export default function MessageAttachments({ attachments }: Props) {
  if (!attachments.length) return null;

  const imageAttachments = attachments.filter(isImageAttachment);
  const fileAttachments = attachments.filter((attachment) => !isImageAttachment(attachment));

  return (
    <Strip>
      {imageAttachments.length > 0 && (
        <ImageGrid>
          {imageAttachments.map((attachment, index) => (
            <ImageCard key={`${attachment.filename}-${index}`}>
              {attachment.previewDataUrl && (
                <PreviewImage src={attachment.previewDataUrl} alt={attachment.filename} />
              )}
              <ImageMeta>
                <span>{attachment.filename}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {formatAttachmentSize(attachment.size)}
                </span>
              </ImageMeta>
            </ImageCard>
          ))}
        </ImageGrid>
      )}

      {fileAttachments.length > 0 && (
        <FileList>
          {fileAttachments.map((attachment, index) => (
            <FileChip key={`${attachment.filename}-${index}`}>
              <FileIcon aria-hidden="true">{getAttachmentEmoji(attachment)}</FileIcon>
              <FileMeta>
                <FileName title={attachment.filename}>{attachment.filename}</FileName>
                <FileSize>{formatAttachmentSize(attachment.size)}</FileSize>
              </FileMeta>
            </FileChip>
          ))}
        </FileList>
      )}
    </Strip>
  );
}
