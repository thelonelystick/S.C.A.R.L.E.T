import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';

export const createTray = (window: BrowserWindow): Tray => {
  const tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('SCARLET');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open SCARLET', click: () => window.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
  tray.on('double-click', () => window.show());
  return tray;
};
