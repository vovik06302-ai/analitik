'use strict';

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const SMOKE = process.argv.includes('--smoke-test');
const RELEASES_URL = 'https://github.com/vovik06302-ai/analitik/releases';

if (SMOKE) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pearl-smoke-')));
}

let mainWindow = null;
let serverOrigin = '';

const ENV_TEMPLATE = [
  '# Ключи и настройки Pearl AI Analyst.',
  '# После изменения закройте и снова откройте приложение.',
  '',
  'GEMINI_API_KEY=',
  'ANTHROPIC_API_KEY=',
  'OLLAMA_URL=http://localhost:11434',
  '',
].join('\r\n');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('timeout')));
  });
}

async function waitForServer(origin, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const code = await httpGet(origin + '/');
      if (code > 0 && code < 500) return;
    } catch {
      // сервер ещё запускается
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Сервер не запустился за отведённое время.');
}

function envFilePath() {
  return path.join(app.getPath('userData'), '.env');
}

function ensureEnvFile() {
  const file = envFilePath();
  if (fs.existsSync(file)) return false;
  fs.writeFileSync(file, ENV_TEMPLATE, 'utf8');
  return true;
}

function openEnvFile() {
  ensureEnvFile();
  if (process.platform === 'win32') {
    spawn('notepad.exe', [envFilePath()], { detached: true, stdio: 'ignore' }).unref();
  } else {
    shell.openPath(envFilePath());
  }
}

async function startBackend() {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  // База данных (папка data) и файл .env берутся из текущей папки процесса.
  process.chdir(userData);
  const createdEnv = ensureEnvFile();

  const port = await getFreePort();
  serverOrigin = `http://127.0.0.1:${port}`;
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';
  process.env.DIST_DIR = path.join(app.getAppPath(), 'dist');

  const serverFile = path.join(app.getAppPath(), 'build-electron', 'server.mjs');
  await import(pathToFileURL(serverFile).href);
  await waitForServer(serverOrigin, 30000);
  return createdEnv;
}

function buildMenu() {
  const template = [
    {
      label: 'Файл',
      submenu: [
        { label: 'Изменить ключи (.env)', click: openEnvFile },
        { label: 'Открыть папку с данными', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        {
          label: 'Перезапустить приложение',
          click: () => {
            app.relaunch();
            app.exit(0);
          },
        },
        { role: 'quit', label: 'Выход' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Обновить' },
        { role: 'resetZoom', label: 'Масштаб 100%' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { role: 'togglefullscreen', label: 'Во весь экран' },
      ],
    },
    {
      label: 'Справка',
      submenu: [{ label: 'Релизы на GitHub', click: () => shell.openExternal(RELEASES_URL) }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Pearl AI Analyst',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(serverOrigin)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(serverOrigin);
}

async function runSmokeTest() {
  const timer = setTimeout(() => app.exit(2), 60000);
  try {
    await startBackend();
    const root = await httpGet(serverOrigin + '/');
    const history = await httpGet(serverOrigin + '/api/history');
    if (root !== 200 || history !== 200) {
      console.error(`Smoke test: / -> ${root}, /api/history -> ${history}`);
      app.exit(1);
      return;
    }
    clearTimeout(timer);
    console.log('Smoke test OK');
    app.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err);
    app.exit(1);
  }
}

if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (SMOKE) {
      await runSmokeTest();
      return;
    }
    app.setAppUserModelId('com.pearl.aianalyst');
    buildMenu();
    try {
      const createdEnv = await startBackend();
      createWindow();
      if (createdEnv) {
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Pearl AI Analyst',
          message: 'Для работы Gemini нужен ключ API.',
          detail:
            'Откроется файл .env. Впишите ключ после GEMINI_API_KEY=, сохраните файл и перезапустите приложение. Ключ можно добавить и позже: Файл → Изменить ключи.',
          buttons: ['Открыть файл', 'Позже'],
          defaultId: 0,
          cancelId: 1,
        });
        if (response === 0) openEnvFile();
      }
    } catch (err) {
      dialog.showErrorBox('Pearl AI Analyst', `Не удалось запустить программу:\n${err && err.message ? err.message : err}`);
      app.exit(1);
    }
  });

  app.on('window-all-closed', () => app.quit());
}
