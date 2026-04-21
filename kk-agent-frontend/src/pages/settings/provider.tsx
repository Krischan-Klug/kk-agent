import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { provider as providerApi } from "@/lib/api";
import type {
  ModelInfo,
  ModelSettings,
  ProviderConfig,
} from "@/types/api";
import { useToggleSet } from "@/hooks/useToggleSet";
import Card from "@/components/Card";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import SettingsLayout from "@/components/SettingsLayout";
import ProviderCard from "@/components/provider/ProviderCard";
import CreateProviderModal from "@/components/provider/CreateProviderModal";
import { DEFAULT_PROVIDER_BASE_URL } from "@/components/provider/constants";

const Grid = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
`;

const HeaderActions = styled.div`
  margin-bottom: var(--space-md);
`;

export default function SettingsProviderPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelSettings, setModelSettings] = useState<Record<string, ModelSettings>>({});
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [loading, setLoading] = useState(true);
  const expanded = useToggleSet();
  const testing = useToggleSet();
  const [showCreate, setShowCreate] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [newName, setNewName] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState(DEFAULT_PROVIDER_BASE_URL);
  const [newApiKey, setNewApiKey] = useState("");

  const loadData = useCallback(async () => {
    try {
      const providerList = await providerApi.listProviders();
      setProviders(providerList);

      const preferredProviderId = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("providerId") ?? ""
        : "";

      const nextSelectedId = providerList[0]?.id
        ? providerList.find((provider) => provider.id === selectedProviderId)?.id
          ?? providerList.find((provider) => provider.id === preferredProviderId)?.id
          ?? providerList[0].id
        : "";
      if (nextSelectedId) {
        const modelsData = await providerApi.getModels(nextSelectedId);
        setModels(modelsData.models);
        setModelSettings(modelsData.modelSettings ?? {});
      } else {
        setModels([]);
        setModelSettings({});
      }
      setSelectedProviderId(nextSelectedId);
    } catch (err) {
      console.error("[provider-load]", err);
    } finally {
      setLoading(false);
    }
  }, [selectedProviderId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function resetCreateForm() {
    setNewName("");
    setNewBaseUrl(DEFAULT_PROVIDER_BASE_URL);
    setNewApiKey("");
  }

  async function handleCreate() {
    if (!newName.trim() || !newBaseUrl.trim()) return;
    try {
      const created = await providerApi.addProvider({
        name: newName.trim(),
        baseUrl: newBaseUrl.trim(),
        apiKey: newApiKey || undefined,
      });
      setProviders((prev) => [...prev, created]);
      setShowCreate(false);
      resetCreateForm();
    } catch (err) {
      console.error("[provider-create]", err);
    }
  }

  async function loadProviderModels(providerId: string) {
    const modelsData = await providerApi.getModels(providerId);
    setModels(modelsData.models);
    setModelSettings(modelsData.modelSettings ?? {});
    setSelectedProviderId(modelsData.providerId ?? providerId);
  }

  async function handleDelete(id: string) {
    try {
      await providerApi.removeProvider(id);
      const nextProviders = providers.filter((provider) => provider.id !== id);
      setProviders(nextProviders);
      if (selectedProviderId === id && nextProviders[0]) {
        await loadProviderModels(nextProviders[0].id);
      } else if (nextProviders.length === 0) {
        setSelectedProviderId("");
        setModels([]);
        setModelSettings({});
      }
    } catch (err) {
      console.error("[provider-delete]", err);
    }
  }

  async function handleTest(id: string) {
    testing.add(id);
    try {
      const result = await providerApi.testProvider(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, error: (err as Error).message } }));
    } finally {
      testing.remove(id);
    }
  }

  async function handleProviderFieldChange(id: string, field: keyof ProviderConfig, value: string) {
    try {
      const updated = await providerApi.updateProvider(id, {
        [field]: value || undefined,
      });
      setProviders((prev) => prev.map((provider) => (provider.id === id ? updated : provider)));
    } catch (err) {
      console.error("[provider-update]", err);
    }
  }

  async function handleModelSettingsSave(modelId: string, settings: ModelSettings) {
    if (!selectedProviderId) return;
    setModelSettings((prev) => ({ ...prev, [modelId]: settings }));
    try {
      await providerApi.setModelSettings(selectedProviderId, modelId, settings);
    } catch (err) {
      console.error("[provider-model-settings]", err);
    }
  }

  return (
    <SettingsLayout>
      {loading ? (
        <Spinner />
      ) : (
        <>
          <HeaderActions>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              + Provider hinzufuegen
            </Button>
          </HeaderActions>
          <Grid>
            {providers.length === 0 ? (
              <Card>
                <span style={{ color: "var(--text-muted)" }}>Keine lokalen Provider konfiguriert. Fuege einen hinzu.</span>
              </Card>
            ) : (
              providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  isSelected={provider.id === selectedProviderId}
                  isExpanded={expanded.has(provider.id)}
                  isTesting={testing.has(provider.id)}
                  testResult={testResults[provider.id]}
                  models={provider.id === selectedProviderId ? models : []}
                  modelSettings={provider.id === selectedProviderId ? modelSettings : {}}
                  onToggleExpand={() => expanded.toggle(provider.id)}
                  onSelect={() => void loadProviderModels(provider.id)}
                  onTest={() => void handleTest(provider.id)}
                  onDelete={() => void handleDelete(provider.id)}
                  onFieldChange={(field, value) => void handleProviderFieldChange(provider.id, field, value)}
                  onModelSettingsSave={handleModelSettingsSave}
                />
              ))
            )}
          </Grid>
          <CreateProviderModal
            open={showCreate}
            name={newName}
            baseUrl={newBaseUrl}
            apiKey={newApiKey}
            onNameChange={setNewName}
            onBaseUrlChange={setNewBaseUrl}
            onApiKeyChange={setNewApiKey}
            onCreate={handleCreate}
            onClose={() => {
              setShowCreate(false);
              resetCreateForm();
            }}
          />
        </>
      )}
    </SettingsLayout>
  );
}
