#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::process::Command;
use tempfile::tempdir;

#[tauri::command]
fn download_and_run(url: String) -> Result<String, String> {
    let temp = tempdir().map_err(|e| e.to_string())?;
    let file_name = "waifu-ai-installer.exe";
    let download_path = temp.path().join(file_name);

    let response = reqwest::blocking::get(&url)
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let bytes = response.bytes().map_err(|e| e.to_string())?;
    fs::write(&download_path, bytes).map_err(|e| e.to_string())?;

    let installed = download_path.to_string_lossy().to_string();

    let child = Command::new(&download_path)
        .args(["/S"])
        .spawn();

    match child {
        Ok(_) => Ok(format!("Started installer: {installed}")),
        Err(e) => Err(format!("Failed to launch installer: {e}")),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![download_and_run])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
