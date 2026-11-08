const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Notes live in the OS user-data folder, outside the app, so updates never touch them.
const dataDir = app.getPath('userData');
const dataFile = path.join(dataDir, 'notes.json');

function loadNotes() {
  if (!fs.existsSync(dataFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    // never overwrite a file we couldn't read — set it aside and start fresh
    fs.renameSync(dataFile, path.join(dataDir, `notes.corrupt-${Date.now()}.json`));
    return {};
  }
}

function saveNotes(notes) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(notes, null, 2), 'utf8');
  fs.renameSync(tmp, dataFile);   // atomic: a crash mid-write can't corrupt notes.json
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    show: false, backgroundColor: '#161b21', title: 'Spiral Notebook',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('notes:load', () => loadNotes());
ipcMain.handle('notes:save', (_e, notes) => { saveNotes(notes); return true; });
ipcMain.on('notes:saveSync', (e, notes) => {
  try { saveNotes(notes); e.returnValue = true; } catch { e.returnValue = false; }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
