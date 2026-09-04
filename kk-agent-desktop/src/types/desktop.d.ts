export {};

declare global {
  interface Window {
    kkAgentDesktop?: {
      isDesktop: boolean;
      apiBaseUrl: string;
      apiToken?: string;
      platform?: string;
      appVersion?: string;
      external: {
        open: (url: string) => Promise<boolean>;
      };
      windowControls: {
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<boolean>;
        isMaximized: () => Promise<boolean>;
        close: () => Promise<void>;
        onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
      };
    };
  }
}
