import { useCallback, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import { LayoutWrapper, MainContent } from "./Layout.styled";
import ProviderOnboardingWizard from "./onboarding/ProviderOnboardingWizard";
import Spinner from "./Spinner";
import { provider as providerApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import type { ProviderConfig } from "@/types/api";

const logger = createLogger("layout");

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [providers, setProviders] = useState<ProviderConfig[] | null>(null);
  const [contentKey, setContentKey] = useState(0);

  const loadProviders = useCallback(async () => {
    try {
      setProviders(await providerApi.listProviders());
    } catch (error) {
      logger.error("Failed to load providers for onboarding:", error);
      setProviders([]);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  function handleOnboardingComplete(created: ProviderConfig) {
    setProviders([created]);
    setContentKey((key) => key + 1);
  }

  return (
    <LayoutWrapper>
      <Sidebar />
      <MainContent key={contentKey}>
        {providers === null ? <Spinner /> : children}
      </MainContent>
      {providers !== null && providers.length === 0 ? (
        <ProviderOnboardingWizard onComplete={handleOnboardingComplete} />
      ) : null}
    </LayoutWrapper>
  );
}
