import { useCallback, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import TitleBar from "./TitleBar";
import { LayoutBody, LayoutWrapper, MainContent } from "./Layout.styled";
import ProviderOnboardingWizard from "./onboarding/ProviderOnboardingWizard";
import Spinner from "./Spinner";
import { provider as providerApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { verifyProviders } from "@/lib/providerVerification";
import type { ProviderConfig } from "@/types/api";

const logger = createLogger("layout");

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [providers, setProviders] = useState<ProviderConfig[] | null>(null);
  const [contentKey, setContentKey] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);

  const loadProviders = useCallback(async () => {
    try {
      const providerList = await providerApi.listProviders();
      setProviders(providerList);
      if (providerList.length > 0) {
        void verifyProviders(providerList.map((provider) => provider.id), providerApi.testProvider);
      }
    } catch (error) {
      logger.error("Failed to load providers for onboarding:", error);
      setProviders([]);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    setIsDesktop(window.kkAgentDesktop?.isDesktop === true);
  }, []);

  function handleOnboardingComplete(created: ProviderConfig) {
    setProviders([created]);
    setContentKey((key) => key + 1);
  }

  return (
    <LayoutWrapper>
      {isDesktop ? <TitleBar /> : null}
      <LayoutBody>
        <Sidebar />
        <MainContent key={contentKey}>
          {providers === null ? <Spinner /> : children}
        </MainContent>
      </LayoutBody>
      {providers !== null && providers.length === 0 ? (
        <ProviderOnboardingWizard onComplete={handleOnboardingComplete} />
      ) : null}
    </LayoutWrapper>
  );
}
