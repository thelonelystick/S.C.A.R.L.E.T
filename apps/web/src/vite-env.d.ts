/// <reference types="vite/client" />

declare global {
  interface Window {
    scarlet: {
      platform: string;
      minimizeToTray: () => Promise<void>;
    };
  }
}

export {};
