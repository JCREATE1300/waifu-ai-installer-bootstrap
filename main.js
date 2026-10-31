const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const AdmZip = require("adm-zip");

const OWNER = process.env.APP_REPO_OWNER || "JCREATE1300";
const REPO = process.env.APP_REPO_NAME || "waifu-ai-desktop";
const TOKEN = process.env.APP_REPO_TOKEN || "";

function apiHeaders(extra = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra
  };

  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }

  return headers;
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

function log(win, message) {
  if (win && win.webContents) {
    win.webContents.send("status", message);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLatestSuccessfulInstallerRun() {
  const runsUrl = `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs?per_page=20`;
  const data = await githubRequest(runsUrl);

  const run = (data.workflow_runs || []).find(
    (r) =>
      r.name === "Windows Installer" &&
      r.status === "completed" &&
      r.conclusion === "success"
  );

  if (!run) {
    throw new Error("No successful Windows Installer workflow run was found.");
  }

  return run;
}

async function getLatestArtifactFromRun(runId) {
  const artifactsUrl = `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts`;
  const data = await githubRequest(artifactsUrl);

  const artifacts = data.artifacts || [];

  const artifact = artifacts
    .filter((a) => a.name && /waifu|windows|installer/i.test(a.name))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  if (!artifact) {
    throw new Error("No matching installer artifact was found for the latest successful run.");
  }

  return artifact;
}

async function downloadToFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Artifact download failed (${response.status}): ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));
}

function getInstallerFromArtifactDir(rootDir) {
  const candidates = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && full.toLowerCase().endsWith(".exe")) {
        candidates.push(full);
      }
    }
  }

  walk(rootDir);

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

async function installLatestBootstrap(win) {
  const tempRoot = path.join(os.tmpdir(), "waifu-ai-bootstrap");
  fs.mkdirSync(tempRoot, { recursive: true });

  const latestRun = await getLatestSuccessfulInstallerRun();
  log(win, `Found latest successful workflow run: #${latestRun.run_number}`);

  const artifact = await getLatestArtifactFromRun(latestRun.id);
  log(win, `Downloading artifact: ${artifact.name}`);

  const zipPath = path.join(tempRoot, `${artifact.name}.zip`);
  const zipUrl = `https://api.github.com/repos/${OWNER}/${REPO}/actions/artifacts/${artifact.id}/zip`;

  await downloadToFile(zipUrl, zipPath);

  const extractDir = path.join(tempRoot, "artifact");
  fs.mkdirSync(extractDir, { recursive: true });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractDir, true);

  const installerPath = getInstallerFromArtifactDir(extractDir);

  if (!installerPath) {
    throw new Error("No .exe installer file was found inside the downloaded artifact.");
  }

  log(win, `Launching installer: ${path.basename(installerPath)}`);

  const child = spawn(installerPath, ["/S"], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();

  log(win, "Installer started successfully.");
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
    log(win, "Checking for the newest installer...");
    try {
      await installLatestBootstrap(win);
    } catch (error) {
      log(win, "Installation failed.");
      log(win, error.message || "Unknown error.");
      console.error(error);
      setTimeout(() => app.quit(), 5000);
    }
  });

  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});