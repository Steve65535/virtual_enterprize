use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

// ── Data Structures ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ApiProvider {
    id: String,
    name: String,
    base_url: String,
    api_key: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct EmployeeConfig {
    id: String,
    name: String,
    role: String,
    memory_limit: String,
    cpu_limit: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct AppConfig {
    api_providers: Vec<ApiProvider>,
    employees: Vec<EmployeeConfig>,
    default_image: Option<String>,
    template_path: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct EmployeeStatus {
    id: String,
    name: String,
    role: String,
    status: String,
    memory_limit: String,
    cpu_limit: String,
}

// ── Global State ───────────────────────────────────────────────────────────────

lazy_static::lazy_static! {
    static ref WATCHERS: Mutex<HashMap<String, RecommendedWatcher>> = Mutex::new(HashMap::new());
}

// ── Internal Helpers ───────────────────────────────────────────────────────────

fn config_path(app: &AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("/tmp/openclaw_config"));
    let _ = fs::create_dir_all(&data_dir);
    data_dir.join("config.json")
}

fn load_config_file(path: &Path) -> AppConfig {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config_file(path: &Path, config: &AppConfig) -> Result<(), String> {
    let data = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

fn container_name(id: &str) -> String {
    format!("openclaw_{}", id)
}

fn vol_dir(id: &str) -> String {
    format!("/tmp/openclaw_{}", id)
}

fn container_status(id: &str) -> String {
    Command::new("docker")
        .args(["inspect", "--format", "{{.State.Status}}", &container_name(id)])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "stopped".to_string())
}

fn read_dir_recursive(dir: &Path, root: &Path) -> Result<Vec<FileNode>, std::io::Error> {
    let mut nodes = Vec::new();
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string();
            let is_dir = path.is_dir();
            let children = if is_dir { Some(read_dir_recursive(&path, root)?) } else { None };
            nodes.push(FileNode { name, path: rel, is_dir, children });
        }
    }
    nodes.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(nodes)
}

/// Recursively copy all contents of `src` into `dst` (like `cp -r src/. dst/`).
fn copy_dir_contents(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_contents(&entry.path(), &target)?;
        } else {
            fs::copy(&entry.path(), &target)?;
        }
    }
    Ok(())
}

// ── Config Commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn load_config(app: AppHandle) -> AppConfig {
    load_config_file(&config_path(&app))
}

#[tauri::command]
fn save_providers(app: AppHandle, providers: Vec<ApiProvider>) -> Result<(), String> {
    let path = config_path(&app);
    let mut config = load_config_file(&path);
    config.api_providers = providers;
    save_config_file(&path, &config)
}

#[tauri::command]
fn save_sandbox_settings(
    app: AppHandle,
    default_image: String,
    template_path: String,
) -> Result<(), String> {
    let path = config_path(&app);
    let mut config = load_config_file(&path);
    config.default_image = if default_image.is_empty() { None } else { Some(default_image) };
    config.template_path = if template_path.is_empty() { None } else { Some(template_path) };
    save_config_file(&path, &config)
}

// ── Employee CRUD ──────────────────────────────────────────────────────────────

#[tauri::command]
fn list_employees(app: AppHandle) -> Vec<EmployeeStatus> {
    let config = load_config_file(&config_path(&app));
    config.employees.iter().map(|e| EmployeeStatus {
        id: e.id.clone(),
        name: e.name.clone(),
        role: e.role.clone(),
        status: container_status(&e.id),
        memory_limit: e.memory_limit.clone(),
        cpu_limit: e.cpu_limit.clone(),
    }).collect()
}

#[tauri::command]
fn add_employee(
    app: AppHandle,
    name: String,
    role: String,
    memory_limit: String,
    cpu_limit: String,
) -> Result<EmployeeConfig, String> {
    let path = config_path(&app);
    let mut config = load_config_file(&path);

    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string();

    let emp = EmployeeConfig { id: id.clone(), name, role, memory_limit, cpu_limit };
    config.employees.push(emp.clone());
    save_config_file(&path, &config)?;

    // Copy template into the new volume directory — runs in background, never blocks UI
    if let Some(tpl) = config.template_path {
        let vol = vol_dir(&id);
        std::thread::spawn(move || {
            let src = PathBuf::from(&tpl);
            let dst = PathBuf::from(&vol);
            if src.is_dir() {
                if let Err(e) = copy_dir_contents(&src, &dst) {
                    eprintln!("[openclaw] template copy error: {e}");
                }
            }
        });
    }

    Ok(emp)
}

#[tauri::command]
fn update_employee(
    app: AppHandle,
    id: String,
    name: String,
    role: String,
    memory_limit: String,
    cpu_limit: String,
) -> Result<(), String> {
    let path = config_path(&app);
    let mut config = load_config_file(&path);
    let emp = config.employees.iter_mut().find(|e| e.id == id).ok_or("Employee not found")?;
    emp.name = name;
    emp.role = role;
    emp.memory_limit = memory_limit;
    emp.cpu_limit = cpu_limit;
    save_config_file(&path, &config)
}

#[tauri::command]
fn remove_employee(app: AppHandle, id: String) -> Result<(), String> {
    let _ = Command::new("docker").args(["rm", "-f", &container_name(&id)]).output();
    { WATCHERS.lock().unwrap().remove(&id); }
    let path = config_path(&app);
    let mut config = load_config_file(&path);
    config.employees.retain(|e| e.id != id);
    save_config_file(&path, &config)
}

// ── Sandbox Commands ───────────────────────────────────────────────────────────

#[tauri::command]
async fn start_sandbox(
    app: AppHandle,
    instance_id: String,
    memory_limit: String,
    cpu_limit: String,
) -> Result<String, String> {
    let vol = vol_dir(&instance_id);
    let _ = fs::create_dir_all(&vol);

    let base_image = {
        let config = load_config_file(&config_path(&app));
        config.default_image.unwrap_or_else(|| "ubuntu:22.04".to_string())
    };

    // FS watcher — dedicated OS thread, not on the async executor
    let app_h = app.clone();
    let wid = instance_id.clone();
    let vol_path = vol.clone();
    let iid_cb = instance_id.clone();

    std::thread::spawn(move || {
        let mut watcher = match notify::recommended_watcher(move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                let _ = app_h.emit("fs-event", format!(
                    "{{\"instance_id\":\"{}\",\"kind\":\"{:?}\"}}",
                    iid_cb, event.kind
                ));
            }
        }) {
            Ok(w) => w,
            Err(_) => return,
        };
        if watcher.watch(Path::new(&vol_path), RecursiveMode::Recursive).is_ok() {
            WATCHERS.lock().unwrap().insert(wid, watcher);
        }
    });

    // Docker run — blocking, pushed to thread pool so it never freezes the UI
    let name = container_name(&instance_id);
    let vol_mount = format!("{}:/workspace", vol);

    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new("docker")
            .args([
                "run", "-d",
                "--name", &name,
                "--memory", &memory_limit,
                "--memory-swap", &memory_limit,
                "--cpus", &cpu_limit,
                "-v", &vol_mount,
                "-w", "/workspace",
                &base_image,
                "tail", "-f", "/dev/null",
            ])
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn stop_sandbox(instance_id: String) -> Result<String, String> {
    { WATCHERS.lock().unwrap().remove(&instance_id); }

    let cname = container_name(&instance_id);
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new("docker").args(["rm", "-f", &cname]).output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn exec_sandbox(instance_id: String, cmd: String) -> Result<String, String> {
    let cname = container_name(&instance_id);
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new("docker").args(["exec", &cname, "sh", "-c", &cmd]).output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if output.status.success() {
        Ok(stdout)
    } else {
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

// ── File System Commands ───────────────────────────────────────────────────────

#[tauri::command]
fn read_sandbox_dir(instance_id: String) -> Result<Vec<FileNode>, String> {
    let path = PathBuf::from(vol_dir(&instance_id));
    if !path.exists() { return Ok(Vec::new()); }
    read_dir_recursive(&path, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file(instance_id: String, file_path: String) -> Result<String, String> {
    let vol = PathBuf::from(vol_dir(&instance_id));
    let full = vol.join(&file_path);
    let canonical = full.canonicalize().map_err(|e| e.to_string())?;
    let vol_canonical = vol.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(&vol_canonical) {
        return Err("Access denied: path traversal detected".to_string());
    }
    fs::read_to_string(&canonical).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(instance_id: String, file_path: String, content: String) -> Result<(), String> {
    let vol = PathBuf::from(vol_dir(&instance_id));
    let full = vol.join(&file_path);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let cp = parent.canonicalize().map_err(|e| e.to_string())?;
        let vc = vol.canonicalize().map_err(|e| e.to_string())?;
        if !cp.starts_with(&vc) {
            return Err("Access denied: path traversal detected".to_string());
        }
    }
    fs::write(&full, content).map_err(|e| e.to_string())
}

// ── Entry Point ────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_providers,
            save_sandbox_settings,
            list_employees,
            add_employee,
            update_employee,
            remove_employee,
            start_sandbox,
            stop_sandbox,
            exec_sandbox,
            read_sandbox_dir,
            read_file,
            write_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
