import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { createWindow } from './window';
import { createTray } from './tray';

const isDevelopment = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

const boot = (): void => {
  mainWindow = createWindow(isDevelopment);
  createTray(mainWindow);
};

app.whenReady().then(() => {
  ipcMain.handle('window:minimize-to-tray', () => {
    mainWindow?.hide();
  });

  boot();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      boot();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

export const getRendererPath = (): string => path.join(__dirname, '../../dist/index.html');
