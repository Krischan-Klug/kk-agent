export {};

declare global {
  interface Window {
    kkAgentDesktop?: {
      isDesktop: boolean;
      apiBaseUrl: string;
      apiToken?: string;
      platform?: string;
      appVersion?: string;
    };
  }
}
