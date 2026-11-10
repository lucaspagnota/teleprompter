// Janela do app. Todo o resto (importar, editar, ler) roda em src/, que também abre direto no navegador.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function abrir() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#000000',
    title: 'Teleprompter',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  // Links externos não abrem dentro do app.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

Menu.setApplicationMenu(null);
app.whenReady().then(abrir);
app.on('window-all-closed', () => app.quit());
