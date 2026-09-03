import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { provider as providerApi } from "@/lib/api";
import { reportError } from "@/lib/errorReporting";
import {
  getProviderVerificationSnapshot,
  removeProviderVerification,
  verifyProviders,
} from "@/lib/providerVerification";
import type {
  ModelInfo,
  ModelProfileSummary,
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

const Grid = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
`;

const HeaderActions = styled.div`
  margin-bottom: var(--space-md);
`;

function parseModelsText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function SettingsProviderPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [profiles, setProfiles] = useState<ModelProfileSummary[]>([]);
  const [modelSettings, setModelSettings] = useState<
    Record<string, ModelSettings>
  >({});
  const [loading, setLoading] = useState(true);
  const expanded = useToggleSet();
  const testing = useToggleSet();
  const {
    add: markTesting,
    remove: clearTesting,
    setValues: setTestingValues,
    has: isTestingProvider,
  } = testing;
  const [showCreate, setShowCreate] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; error?: string }>
  >(getProviderVerificationSnapshot);
  const [newName, setNewName] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState(DEFAULT_PROVIDER_BASE_URL);
  const [newApiKey, setNewApiKey] = useState("");
  const [newModels, setNewModels] = useState("");

  const runProviderVerification = useCallback(
    async (providerIds: string[]) => {
      if (providerIds.length === 0) {
        setTestingValues(new Set());
        return;
      }

      setTestingValues(new Set(providerIds));
      await verifyProviders(
        providerIds,
        providerApi.testProvider,
        (id, result) => {
          setTestResults((prev) => ({ ...prev, [id]: result }));
          clearTesting(id);
        },
      );
    },
    [clearTesting, setTestingValues],
  );

  const loadData = useCallback(async () => {
    try {
      const providerList = await providerApi.listProviders();
      setProviders(providerList);
      setTestResults((prev) => ({
        ...prev,
        ...getProviderVerificationSnapshot(),
      }));
      if (providerList.length > 0) {
        const modelsData = await providerApi.getModels();
        setModels(modelsData.models);
        setProfiles(modelsData.profiles);
        setModelSettings(modelsData.modelSettings ?? {});
        void runProviderVerification(
          providerList.map((provider) => provider.id),
        );
      } else {
        setModels([]);
        setProfiles([]);
        setModelSettings({});
        setTestingValues(new Set());
      }
    } catch (err) {
      reportError("Failed to load providers", err);
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
    setNewModels("");
  }

  async function handleCreate() {
    if (!newName.trim() || !newBaseUrl.trim()) return;
    try {
      const parsedModels = parseModelsText(newModels);
      const created = await providerApi.addProvider({
        name: newName.trim(),
        baseUrl: newBaseUrl.trim(),
        apiKey: newApiKey || undefined,
        models: parsedModels.length > 0 ? parsedModels : undefined,
      });
      setProviders((prev) => [...prev, created]);
      void loadData();
      setShowCreate(false);
      resetCreateForm();
    } catch (err) {
      reportError("Failed to create provider", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await providerApi.removeProvider(id);
      const nextProviders = providers.filter((provider) => provider.id !== id);
      setProviders(nextProviders);
      setModels((prev) => prev.filter((model) => model.providerId !== id));
      setModelSettings((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([key]) => !key.startsWith(`${id}::`)),
        ),
      );
      setTestResults((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)),
      );
      clearTesting(id);
      removeProviderVerification(id);
    } catch (err) {
      reportError("Failed to delete provider", err);
    }
  }

  async function handleTest(id: string) {
    markTesting(id);
    try {
      const [result] = Object.values(
        await verifyProviders([id], providerApi.testProvider),
      );
      setTestResults((prev) => ({ ...prev, [id]: result }));
      if (!result.ok) reportError("Provider connection failed", result.error ?? "The provider could not be reached.");
    } catch (err) {
      reportError("Failed to test provider", err);
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    } finally {
      clearTesting(id);
    }
  }

  async function handleProviderFieldChange(
    id: string,
    field: keyof ProviderConfig,
    value: string,
  ) {
    try {
      const body: Record<string, unknown> = { [field]: value || undefined };
      if (field === "models") {
        body.models = parseModelsText(value);
      }
      const updated = await providerApi.updateProvider(id, body);
      setProviders((prev) =>
        prev.map((provider) => (provider.id === id ? updated : provider)),
      );
      if (field === "baseUrl" || field === "apiKey") void loadData();
    } catch (err) {
      reportError("Failed to update provider", err);
    }
  }

  async function handleModelSettingsSave(
    model: ModelInfo,
    settings: ModelSettings,
  ) {
    const modelRef = toModelRef(model);
    setModelSettings((prev) => {
      const next = { ...prev };
      if (settings.profileId) next[modelRef] = settings;
      else delete next[modelRef];
      return next;
    });
    try {
      const saved = await providerApi.setModelSettings(model.providerId, model.id, settings);
      setModelSettings((prev) => {
        const next = { ...prev };
        if (saved.settings.profileId) next[modelRef] = saved.settings;
        else delete next[modelRef];
        return next;
      });
      const modelsData = await providerApi.getModels();
      setModels(modelsData.models);
      setProfiles(modelsData.profiles);
      setModelSettings(modelsData.modelSettings ?? {});
    } catch (err) {
      reportError("Failed to save model settings", err);
      void loadData();
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
            + Add Provider
          </Button>
        </HeaderActions>
        <Grid>
          {providers.length === 0 ? (
            <Card>
              <span style={{ color: "var(--text-muted)" }}>
                No local providers configured. Add one.
              </span>
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
                profiles={profiles}
                modelSettings={modelSettings}
                onToggleExpand={() => expanded.toggle(provider.id)}
                onTest={() => void handleTest(provider.id)}
                onDelete={() => void handleDelete(provider.id)}
                onFieldChange={(field, value) =>
                  void handleProviderFieldChange(provider.id, field, value)
                }
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
          models={newModels}
          onNameChange={setNewName}
          onBaseUrlChange={setNewBaseUrl}
          onApiKeyChange={setNewApiKey}
          onModelsChange={setNewModels}
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
