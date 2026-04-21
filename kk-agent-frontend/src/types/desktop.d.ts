export {};

declare global {
  interface Window {
    kkAgentDesktop?: {
      isDesktop: boolean;
      apiBaseUrl: string;
      platform?: string;
      appVersion?: string;
    };
  }
}
