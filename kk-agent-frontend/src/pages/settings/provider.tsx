import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { provider as providerApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { getProviderVerificationSnapshot, removeProviderVerification, verifyProviders } from "@/lib/providerVerification";
import type {
  ModelInfo,
  ModelSettings,
  ProviderConfig,
} from "@/types/api";
import { useToggleSet } from "@/hooks/useToggleSet";
import Card from "@/components/Card";
import Button from "@/components/Button";
import SettingsLayout from "@/components/SettingsLayout";
import ProviderCard from "@/components/provider/ProviderCard";
import CreateProviderModal from "@/components/provider/CreateProviderModal";
import { DEFAULT_PROVIDER_BASE_URL } from "@/components/provider/constants";
import { toModelRef } from "@/lib/modelRefs";

const logger = createLogger("settings/provider");

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
  const [loading, setLoading] = useState(true);
  const expanded = useToggleSet();
  const testing = useToggleSet();
  const { add: markTesting, remove: clearTesting, setValues: setTestingValues, has: isTestingProvider } = testing;
  const [showCreate, setShowCreate] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>(getProviderVerificationSnapshot);
  const [newName, setNewName] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState(DEFAULT_PROVIDER_BASE_URL);
  const [newApiKey, setNewApiKey] = useState("");

  const runProviderVerification = useCallback(async (providerIds: string[]) => {
    if (providerIds.length === 0) {
      setTestingValues(new Set());
      return;
    }

    setTestingValues(new Set(providerIds));
    await verifyProviders(providerIds, providerApi.testProvider, (id, result) => {
      setTestResults((prev) => ({ ...prev, [id]: result }));
      clearTesting(id);
    });
  }, [clearTesting, setTestingValues]);

  const loadData = useCallback(async () => {
    try {
      const providerList = await providerApi.listProviders();
      setProviders(providerList);
      setTestResults((prev) => ({ ...prev, ...getProviderVerificationSnapshot() }));
      if (providerList.length > 0) {
        const modelsData = await providerApi.getModels();
        setModels(modelsData.models);
        setModelSettings(modelsData.modelSettings ?? {});
        void runProviderVerification(providerList.map((provider) => provider.id));
      } else {
        setModels([]);
        setModelSettings({});
        setTestingValues(new Set());
      }
    } catch (err) {
      logger.error("Failed to load providers:", err);
    } finally {
      setLoading(false);
    }
  }, [runProviderVerification, setTestingValues]);

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
      void loadData();
      setShowCreate(false);
      resetCreateForm();
    } catch (err) {
      logger.error("Failed to create provider:", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await providerApi.removeProvider(id);
      const nextProviders = providers.filter((provider) => provider.id !== id);
      setProviders(nextProviders);
      setModels((prev) => prev.filter((model) => model.providerId !== id));
      setModelSettings((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(`${id}::`))));
      setTestResults((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)));
      clearTesting(id);
      removeProviderVerification(id);
    } catch (err) {
      logger.error("Failed to delete provider:", err);
    }
  }

  async function handleTest(id: string) {
    markTesting(id);
    try {
      const [result] = Object.values(await verifyProviders([id], providerApi.testProvider));
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, error: err instanceof Error ? err.message : String(err) } }));
    } finally {
      clearTesting(id);
    }
  }

  async function handleProviderFieldChange(id: string, field: keyof ProviderConfig, value: string) {
    try {
      const updated = await providerApi.updateProvider(id, {
        [field]: value || undefined,
      });
      setProviders((prev) => prev.map((provider) => (provider.id === id ? updated : provider)));
      if (field === "baseUrl" || field === "apiKey") void loadData();
    } catch (err) {
      logger.error("Failed to update provider:", err);
    }
  }

  async function handleModelSettingsSave(model: ModelInfo, settings: ModelSettings) {
    const modelRef = toModelRef(model);
    setModelSettings((prev) => ({ ...prev, [modelRef]: settings }));
    try {
      await providerApi.setModelSettings(model.providerId, model.id, settings);
    } catch (err) {
      logger.error("Failed to save model settings:", err);
    }
  }

  function getProviderModels(providerId: string): ModelInfo[] {
    return models.filter((model) => model.providerId === providerId);
  }

  return (
    <SettingsLayout loading={loading}>
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
                isExpanded={expanded.has(provider.id)}
                isTesting={isTestingProvider(provider.id)}
                testResult={testResults[provider.id]}
                models={getProviderModels(provider.id)}
                modelSettings={modelSettings}
                onToggleExpand={() => expanded.toggle(provider.id)}
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
    </SettingsLayout>
  );
}
