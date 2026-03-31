import { useEffect, useState } from "react";
import styled from "styled-components";
import { provider as providerApi } from "@/lib/api";
import { logUiError } from "@/lib/uiLogger";
import type { AuthMethod, ModelInfo, ModelSettings, ProviderConfig, ProviderType } from "@/types/api";
import { useToggleSet } from "@/hooks/useToggleSet";
import { PageTitle } from "@/components/Layout.styled";
import Card from "@/components/Card";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import ProviderCard from "@/components/provider/ProviderCard";
import CreateProviderModal from "@/components/provider/CreateProviderModal";
import { AUTH_OPTIONS, DEFAULT_BASE_URLS } from "@/components/provider/constants";

const Grid = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
`;

const HeaderActions = styled.div`
  margin-bottom: var(--space-md);
`;

export default function ProviderPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelSettings, setModelSettings] = useState<Record<string, ModelSettings>>({});
  const [activeProviderId, setActiveProviderId] = useState("");
  const [loading, setLoading] = useState(true);
  const expanded = useToggleSet();
  const testing = useToggleSet();
  const [showCreate, setShowCreate] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [newType, setNewType] = useState<ProviderType>("lmstudio");
  const [newName, setNewName] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState(DEFAULT_BASE_URLS.lmstudio);
  const [newAuth, setNewAuth] = useState<AuthMethod>("none");
  const [newApiKey, setNewApiKey] = useState("");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      const [providerList, modelsData] = await Promise.all([providerApi.listProviders(), providerApi.getModels()]);
      setProviders(providerList);
      setModels(modelsData.models);
      setModelSettings(modelsData.modelSettings ?? {});
      setActiveProviderId(modelsData.activeProviderId ?? "");
    } catch (err) {
      logUiError("provider-load", err);
    } finally {
      setLoading(false);
    }
  }

  function resetCreateForm() {
    setNewType("lmstudio");
    setNewName("");
    setNewBaseUrl(DEFAULT_BASE_URLS.lmstudio);
    setNewAuth("none");
    setNewApiKey("");
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const created = await providerApi.addProvider({
        name: newName.trim(),
        type: newType,
        baseUrl: newBaseUrl,
        authMethod: newAuth,
        apiKey: newAuth === "api-key" ? newApiKey : undefined,
      });
      setProviders((prev) => [...prev, created]);
      setShowCreate(false);
      resetCreateForm();
    } catch (err) {
      logUiError("provider-create", err);
    }
  }

  async function handleActivate(id: string) {
    try {
      const result = await providerApi.activateProvider(id);
      setActiveProviderId(result.activeProviderId);
      const modelsData = await providerApi.getModels();
      setModels(modelsData.models);
      setModelSettings(modelsData.modelSettings ?? {});
    } catch (err) {
      logUiError("provider-activate", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await providerApi.removeProvider(id);
      setProviders((prev) => prev.filter((provider) => provider.id !== id));
      if (activeProviderId === id) {
        const modelsData = await providerApi.getModels();
        setActiveProviderId(modelsData.activeProviderId ?? "");
        setModels(modelsData.models);
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

  async function handleProviderFieldChange(id: string, field: string, value: string) {
    try {
      const updated = await providerApi.updateProvider(id, { [field]: value });
      setProviders((prev) => prev.map((provider) => (provider.id === id ? updated : provider)));
    } catch (err) {
      logUiError("provider-update", err);
    }
  }

  async function handleModelSettingsSave(modelId: string, settings: ModelSettings) {
    setModelSettings((prev) => ({ ...prev, [modelId]: settings }));
    try {
      await providerApi.setModelSettings(modelId, settings);
    } catch (err) {
      logUiError("provider-model-settings", err);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle>Provider</PageTitle>
      <HeaderActions>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          + Provider hinzufügen
        </Button>
      </HeaderActions>
      <Grid>
        {providers.length === 0 ? (
          <Card>
            <span style={{ color: "var(--text-muted)" }}>Keine Provider konfiguriert. Füge einen hinzu.</span>
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
              models={models}
              modelSettings={modelSettings}
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
        type={newType}
        name={newName}
        baseUrl={newBaseUrl}
        auth={newAuth}
        apiKey={newApiKey}
        onTypeChange={setNewType}
        onNameChange={setNewName}
        onBaseUrlChange={setNewBaseUrl}
        onAuthChange={setNewAuth}
        onApiKeyChange={setNewApiKey}
        onCreate={handleCreate}
        onClose={() => {
          setShowCreate(false);
          resetCreateForm();
        }}
      />
    </div>
  );
}
