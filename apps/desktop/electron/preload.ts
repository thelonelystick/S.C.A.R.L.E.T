import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('scarlet', {
  platform: process.platform,
  minimizeToTray: (): Promise<void> => ipcRenderer.invoke('window:minimize-to-tray'),
});
