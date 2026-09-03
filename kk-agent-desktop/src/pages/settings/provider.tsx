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
} from "kk-agent-contract";
import { useToggleSet } from "@/hooks/useToggleSet";
import Card from "@/components/Card";
import Button from "@/components/Button";
import SettingsLayout from "@/components/SettingsLayout";
import ProviderCard from "@/components/provider/ProviderCard";
import CreateProviderModal from "@/components/provider/CreateProviderModal";
import type { ProviderFormValue } from "@/components/provider/ProviderFormFields";
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
  const [profiles, setProfiles] = useState<ModelProfileSummary[]>([]);
  const [modelSettings, setModelSettings] = useState<
    Record<string, ModelSettings>
  >({});
  const [loading, setLoading] = useState(true);
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
  const [createForm, setCreateForm] = useState<ProviderFormValue>({
    name: "",
    baseUrl: DEFAULT_PROVIDER_BASE_URL,
    apiKey: "",
  });

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

  const loadCatalog = useCallback(async () => {
    const providerList = await providerApi.listProviders();
    setProviders(providerList);
    if (providerList.length === 0) {
      setModels([]);
      setProfiles([]);
      setModelSettings({});
    } else {
      try {
        const catalog = await providerApi.getModels();
        setModels(catalog.models);
        setProfiles(catalog.profiles);
        setModelSettings(catalog.modelSettings ?? {});
      } catch (error) {
        setModels([]);
        setProfiles([]);
        setModelSettings({});
        reportError("Failed to load provider models", error);
      }
    }
    return providerList;
  }, []);

  const loadData = useCallback(async () => {
    try {
      const providerList = await loadCatalog();
      setTestResults((prev) => ({ ...prev, ...getProviderVerificationSnapshot() }));
      void runProviderVerification(providerList.map((provider) => provider.id));
    } catch (err) {
      reportError("Failed to load providers", err);
    } finally {
      setLoading(false);
    }
  }, [loadCatalog, runProviderVerification]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function resetCreateForm() {
    setCreateForm({ name: "", baseUrl: DEFAULT_PROVIDER_BASE_URL, apiKey: "" });
  }

  async function handleCreate() {
    if (!createForm.name.trim() || !createForm.baseUrl.trim()) return;
    try {
      const created = await providerApi.addProvider({
        name: createForm.name.trim(),
        baseUrl: createForm.baseUrl.trim(),
        apiKey: createForm.apiKey || undefined,
      });
      await loadCatalog();
      void runProviderVerification([created.id]);
      setShowCreate(false);
      resetCreateForm();
    } catch (err) {
      reportError("Failed to create provider", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await providerApi.removeProvider(id);
      setTestResults((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)),
      );
      clearTesting(id);
      removeProviderVerification(id);
      await loadCatalog();
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

  async function handleProviderSave(id: string, value: ProviderFormValue) {
    await providerApi.updateProvider(id, {
      name: value.name.trim(),
      baseUrl: value.baseUrl.trim(),
      apiKey: value.apiKey,
    });
    removeProviderVerification(id);
    setTestResults((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)));
    await loadCatalog();
    void runProviderVerification([id]);
  }

  async function handleModelSettingsSave(
    model: ModelInfo,
    settings: ModelSettings,
  ) {
    try {
      await providerApi.setModelSettings(model.providerId, model.id, settings);
      await loadCatalog();
    } catch (err) {
      reportError("Failed to save model settings", err);
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
                No providers configured. Add one.
              </span>
            </Card>
          ) : (
            providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isTesting={isTestingProvider(provider.id)}
                testResult={testResults[provider.id]}
                models={getProviderModels(provider.id)}
                profiles={profiles}
                modelSettings={modelSettings}
                onTest={() => void handleTest(provider.id)}
                onDelete={() => void handleDelete(provider.id)}
                onSave={(value) => handleProviderSave(provider.id, value)}
                onModelSettingsSave={handleModelSettingsSave}
              />
            ))
          )}
        </Grid>
        <CreateProviderModal
          open={showCreate}
          value={createForm}
          onChange={setCreateForm}
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
