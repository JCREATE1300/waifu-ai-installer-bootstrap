const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const AdmZip = require("adm-zip");

const OWNER = process.env.GITHUB_OWNER || "JCREATE1300";
const REPO = process.env.GITHUB_REPO || "waifu-ai-desktop";
const TOKEN = process.env.GITHUB_TOKEN || "";

function apiHeaders(extra = {}) {
  const headers = { Accept: "application/vnd.github+json", ...extra };
  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }
  return headers;
}

function logToRenderer(win, message) {
  win.webContents.send("status", message);
}

async function githubRequest(url) {
  const response = await fetch(url, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${text}`);
  }

  return response.json();
}

async function getLatestSuccessRun() {
  const runsUrl = `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs?per_page=10`;
  const data = await githubRequest(runsUrl);

  const run = (data.workflow_runs || []).find(
    r =>
      r.name === "Windows Installer" &&
      r.status === "completed" &&
      r.conclusion === "success"
  );

  if (!run) {
    throw new Error("No successful Windows Installer workflow run found.");
  }

  return run;
}

async function getLatestArtifact(runId) {
  const artifactsUrl = `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts`;
  const data = await githubRequest(artifactsUrl);

  const artifact = (data.artifacts || []).find(
    a =>
      a.name &&
      (
        a.name.toLowerCase().includes("waifu-ai") ||
        a.name.toLowerCase().includes("windows") ||
        a.name.toLowerCase().includes("installer")
      )
  );

  if (!artifact) {
    throw new Error("No installer artifact found on the latest successful workflow run.");
  }

  return artifact;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFile(url, destPath, onProgress) {
  const response = await fetch(url, {
    headers: apiHeaders({
      "X-GitHub-Api-Version": "2022-11-28"
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to download installer: ${response.status} ${text}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);

  if (onProgress) {
    onProgress(buffer.length);
  }
}

function isWindowsInstaller(fileName) {
  return fileName.toLowerCase().endsWith(".exe");
}

async function installLatestArtifact(win) {
  const tempRoot = path.join(os.tmpdir(), "waifu-ai-bootstrap");
  fs.mkdirSync(tempRoot, { recursive: true });

  const run = await getLatestSuccessRun();
  logToRenderer(win, `Found newest successful build: #${run.run_number}`);
  await wait(500);

  const artifact = await getLatestArtifact(run.id);
  logToRenderer(win, `Downloading artifact: ${artifact.name}`);
  const zipPath = path.join(tempRoot, `${artifact.name}.zip`);
  const zipUrl = `https://api.github.com/repos/${OWNER}/${REPO}/actions/artifacts/${artifact.id}/zip`;

  await downloadFile(zipUrl, zipPath, size => {
    logToRenderer(win, `Downloaded ${Math.round(size / 1024)} KB`);
  });

  const extractDir = path.join(tempRoot, "artifact");
  fs.mkdirSync(extractDir, { recursive: true });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractDir, true);

  const candidates = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else if (isWindowsInstaller(item.name)) {
        candidates.push(full);
      }
    }
  }

  walk(extractDir);

  if (!candidates.length) {
    throw new Error("No .exe installer file found inside the downloaded artifact.");
  }

  candidates.sort((a, b) => b.length - a.length);
  const installerPath = candidates[0];

  logToRenderer(win, `Launching installer: ${path.basename(installerPath)}`);
  await wait(800);

  const child = spawn(installerPath, ["/S"], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();

  logToRenderer(win, "Installer started successfully.");
  await wait(1200);

  app.quit();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 620,
    height: 420,
    frame: false,
    resizable: false,
    fullscreenable: false,
    rounded: true,
    titleBarStyle: "hidden",
    backgroundColor: "#0f172a",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile("index.html");

  win.webContents.on("did-finish-load", async () => {
    logToRenderer(win, "Checking for the latest installer...");
    try {
      await installLatestArtifact(win);
    } catch (error) {
      logToRenderer(win, "Install failed.");
      logToRenderer(win, error.message || "Unknown error.");
      console.error(error);
      setTimeout(() => app.quit(), 5000);
    }
  });

  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});