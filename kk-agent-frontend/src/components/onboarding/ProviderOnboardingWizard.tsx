import { useState } from "react";
import styled from "styled-components";
import type { ProviderConfig } from "@/types/api";
import { provider as providerApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";
import { ActionsRow, MutedText } from "@/components/PageForm";
import ProviderFormFields from "@/components/provider/ProviderFormFields";
import { DEFAULT_PROVIDER_BASE_URL } from "@/components/provider/constants";

const logger = createLogger("onboarding/provider");

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: min(520px, calc(100vw - 48px));
`;

const StatusBox = styled.div<{ $tone: "info" | "success" | "error" }>`
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid
    ${(p) => {
      if (p.$tone === "success") return "var(--success)";
      if (p.$tone === "error") return "var(--danger)";
      return "var(--border)";
    }};
  color: ${(p) => {
    if (p.$tone === "success") return "var(--success)";
    if (p.$tone === "error") return "var(--danger)";
    return "var(--text-secondary)";
  }};
  background: var(--bg-surface);
  font-size: var(--font-size-sm);
`;

type StepState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string; providerId?: string };

type Props = {
  onComplete: (provider: ProviderConfig) => void;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export default function ProviderOnboardingWizard({ onComplete }: Props) {
  const [name, setName] = useState("Local LLM");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_PROVIDER_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<StepState>({ kind: "idle" });

  const canSubmit = name.trim().length > 0 && baseUrl.trim().length > 0 && state.kind !== "saving";

  async function cleanupProvider(providerId: string) {
    try {
      await providerApi.removeProvider(providerId);
    } catch (error) {
      logger.error("Failed to remove incomplete onboarding provider:", error);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    let created: ProviderConfig | undefined;
    setState({ kind: "saving" });
    try {
      created = await providerApi.addProvider({
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
      });

      const testResult = await providerApi.testProvider(created.id);
      if (!testResult.ok) {
        await cleanupProvider(created.id);
        setState({
          kind: "error",
          message: testResult.error || "Provider-Verbindung fehlgeschlagen.",
        });
        return;
      }

      const modelsResult = await providerApi.getModels(created.id);
      if (modelsResult.models.length === 0) {
        await cleanupProvider(created.id);
        setState({
          kind: "error",
          message: "Provider erreichbar, aber es wurden keine Modelle gefunden.",
        });
        return;
      }

      setState({ kind: "success", message: `${modelsResult.models.length} Modell(e) gefunden.` });
      onComplete(created);
    } catch (error) {
      if (created) {
        await cleanupProvider(created.id);
      }
      const message = getErrorMessage(error);
      logger.error("Provider onboarding failed:", error);
      setState({ kind: "error", message });
    }
  }

  return (
    <Modal title="Provider einrichten" onClose={() => {}} showClose={false}>
      <Body>
        <MutedText>
          Lege einen lokalen oder selbst gehosteten LLM-Provider an, damit Sessions gestartet werden koennen.
        </MutedText>
        <ProviderFormFields
          name={name}
          baseUrl={baseUrl}
          apiKey={apiKey}
          onNameChange={setName}
          onBaseUrlChange={setBaseUrl}
          onApiKeyChange={setApiKey}
          autoFocus
        />
        {state.kind === "error" ? <StatusBox $tone="error">{state.message}</StatusBox> : null}
        {state.kind === "success" ? <StatusBox $tone="success">{state.message}</StatusBox> : null}
        <ActionsRow>
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {state.kind === "saving" ? <Spinner size={14} /> : "Speichern & testen"}
          </Button>
        </ActionsRow>
      </Body>
    </Modal>
  );
}
