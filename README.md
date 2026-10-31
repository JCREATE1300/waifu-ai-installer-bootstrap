# Waifu AI Bootstrap Installer

This project creates a lightweight bootstrap installer for the private app repo:

- JCREATE1300/waifu-ai-desktop

It does the following:

1. Checks the latest successful `Windows Installer` GitHub Actions run
2. Finds the newest artifact from that run
3. Downloads the artifact zip
4. Extracts it
5. Finds the Windows `.exe` installer
6. Launches the installer automatically

## Setup

Create a GitHub personal access token with read access to the private repo and store it as a repo secret named:

- `APP_REPO_TOKEN`

In your local shell or CI environment, set:

```bash
export APP_REPO_OWNER=JCREATE1300
export APP_REPO_NAME=waifu-ai-desktop
export APP_REPO_TOKEN=your_token_here