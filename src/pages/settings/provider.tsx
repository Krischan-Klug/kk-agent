import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { provider as providerApi } from "@/lib/api";
import { logUiError } from "@/lib/uiLogger";
import type { ModelInfo, ModelSettings, ProviderConfig } from "@/types/api";
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
  const [activeProviderId, setActiveProviderId] = useState("");
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

      const activeId = providerList[0]?.id
        ? providerList.find((provider) => provider.id === activeProviderId)?.id ?? providerList[0].id
        : "";
      const modelsData = await providerApi.getModels(activeId || undefined);
      setModels(modelsData.models);
      setModelSettings(modelsData.modelSettings ?? {});
      setActiveProviderId(modelsData.activeProviderId ?? activeId);
    } catch (err) {
      logUiError("provider-load", err);
    } finally {
      setLoading(false);
    }
  }, [activeProviderId]);

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
      logUiError("provider-create", err);
    }
  }

  async function loadProviderModels(providerId: string) {
    const modelsData = await providerApi.getModels(providerId);
    setModels(modelsData.models);
    setModelSettings(modelsData.modelSettings ?? {});
    setActiveProviderId(modelsData.activeProviderId ?? providerId);
  }

  async function handleActivate(id: string) {
    try {
      const result = await providerApi.activateProvider(id);
      await loadProviderModels(result.activeProviderId);
    } catch (err) {
      logUiError("provider-activate", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await providerApi.removeProvider(id);
      const nextProviders = providers.filter((provider) => provider.id !== id);
      setProviders(nextProviders);
      if (activeProviderId === id && nextProviders[0]) {
        await loadProviderModels(nextProviders[0].id);
      } else if (nextProviders.length === 0) {
        setActiveProviderId("");
        setModels([]);
        setModelSettings({});
      }
    } catch (err) {
      logUiError("provider-delete", err);
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
      logUiError("provider-update", err);
    }
  }

  async function handleModelSettingsSave(modelId: string, settings: ModelSettings) {
    if (!activeProviderId) return;
    setModelSettings((prev) => ({ ...prev, [modelId]: settings }));
    try {
      await providerApi.setModelSettings(activeProviderId, modelId, settings);
    } catch (err) {
      logUiError("provider-model-settings", err);
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
                  isActive={provider.id === activeProviderId}
                  isExpanded={expanded.has(provider.id)}
                  isTesting={testing.has(provider.id)}
                  testResult={testResults[provider.id]}
                  models={provider.id === activeProviderId ? models : []}
                  modelSettings={provider.id === activeProviderId ? modelSettings : {}}
                  onToggleExpand={() => expanded.toggle(provider.id)}
                  onActivate={() => void handleActivate(provider.id)}
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
