import styled from "styled-components";
import type { PendingAsset } from "@/hooks/useAssets";
import { formatAssetSize, getAssetLabel } from "./assetDisplay";

const Strip = styled.div`
  display: flex; gap: var(--space-sm); padding: 0 var(--space-md) var(--space-xs); overflow-x: auto;
`;
const Chip = styled.div`
  display: flex; align-items: center; gap: var(--space-xs); padding: var(--space-xs) var(--space-sm);
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--text-secondary); flex-shrink: 0;
`;
const Thumbnail = styled.img`width: 36px; height: 36px; object-fit: cover; border-radius: 3px;`;
const FileName = styled.span`
  max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--font-mono); font-size: 11px;
`;
const RemoveButton = styled.button`
  border: 0; background: var(--bg-hover); color: var(--text-muted); border-radius: 50%; cursor: pointer;
  width: 18px; height: 18px; padding: 0;
`;

export default function AssetPreview({ assets, onRemove }: { assets: PendingAsset[]; onRemove: (id: string) => void }) {
  if (!assets.length) return null;
  return <Strip>{assets.map((asset) => (
    <Chip key={asset.id}>
      {asset.previewUrl ? <Thumbnail src={asset.previewUrl} alt={asset.filename} /> : <span>{getAssetLabel(asset)}</span>}
      <FileName title={asset.filename}>{asset.filename}</FileName>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatAssetSize(asset.size)}</span>
      <RemoveButton onClick={() => onRemove(asset.id)} aria-label={`Remove ${asset.filename}`}>&times;</RemoveButton>
    </Chip>
  ))}</Strip>;
}
