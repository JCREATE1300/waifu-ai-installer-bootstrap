# Waifu AI Bootstrap Installer

This project creates a small bootstrap installer that:

1. checks the latest successful `Windows Installer` workflow on `JCREATE1300/waifu-ai-desktop`
2. downloads the newest artifact zip from GitHub
3. extracts the installer from the zip
4. launches the downloaded EXE installer

## Setup

Set the environment variables before launching:

```bash
export GITHUB_TOKEN=your_token_here
export GITHUB_OWNER=JCREATE1300
export GITHUB_REPO=waifu-ai-desktop