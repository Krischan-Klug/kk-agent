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
      credentials: {
        set: (id: string, value: string) => Promise<boolean>;
        setMany: (values: Record<string, string>) => Promise<boolean>;
        remove: (id: string) => Promise<boolean>;
        removeMany: (ids: string[]) => Promise<boolean>;
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
