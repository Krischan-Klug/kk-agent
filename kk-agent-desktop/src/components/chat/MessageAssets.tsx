import { useEffect, useState } from "react";
import styled from "styled-components";
import type { AssetMeta } from "@/types/api";
import { session as sessionApi } from "@/lib/api";
import { formatAssetSize, getAssetLabel } from "./assetDisplay";

const Strip = styled.div`display: flex; gap: var(--space-sm); flex-wrap: wrap; margin-top: var(--space-sm);`;
const Card = styled.button`
  display: flex; flex-direction: column; min-width: 150px; max-width: 260px; padding: 0; overflow: hidden;
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--text-secondary); text-align: left; cursor: pointer;
  &:hover { border-color: var(--accent); color: var(--text-primary); }
`;
const Preview = styled.img`width: 100%; height: 150px; object-fit: cover; background: var(--bg-surface);`;
const Meta = styled.span`display: flex; align-items: center; gap: var(--space-xs); padding: 7px var(--space-sm); min-width: 0;`;
const Name = styled.span`overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px var(--font-mono); color: var(--text-primary);`;
const Size = styled.span`font-size: 10px; color: var(--text-muted); white-space: nowrap;`;

function AssetPreviewImage({ sessionId, asset }: { sessionId: string; asset: AssetMeta }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    void sessionApi.getAssetBlob(sessionId, asset.id, asset.kind === "pdf" ? 1 : undefined).then((blob) => {
      if (!active) return;
      setUrl(URL.createObjectURL(blob));
    }).catch(() => undefined);
    return () => { active = false; setUrl((current) => { if (current) URL.revokeObjectURL(current); return undefined; }); };
  }, [asset.id, asset.kind, sessionId]);
  return url ? <Preview src={url} alt={asset.filename} /> : null;
}

async function downloadAsset(sessionId: string, asset: AssetMeta): Promise<void> {
  const url = URL.createObjectURL(await sessionApi.getAssetBlob(sessionId, asset.id));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = asset.filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function MessageAssets({ sessionId, assets }: { sessionId: string; assets: AssetMeta[] }) {
  if (!assets.length) return null;
  return <Strip>{assets.map((asset) => (
    <Card key={asset.id} type="button" onClick={() => { void downloadAsset(sessionId, asset); }} title={`Download ${asset.filename}`}>
      {asset.previewAvailable && (asset.kind === "image" || asset.kind === "pdf") && <AssetPreviewImage sessionId={sessionId} asset={asset} />}
      <Meta><span>{getAssetLabel(asset)}</span><Name>{asset.filename}</Name><Size>{formatAssetSize(asset.size)}</Size></Meta>
    </Card>
  ))}</Strip>;
}
