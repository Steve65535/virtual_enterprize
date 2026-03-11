use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};
use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;

//  Data Structures 

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

/// One app gateway attached to an employee.
#[derive(Serialize, Deserialize, Clone, Default)]
struct AppGateway {
    gateway_type: String,
    enabled: bool,
    #[serde(default)]
    credentials: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct EmployeeConfig {
    id: String,
    name: String,
    role: String,
    memory_limit: String,
    cpu_limit: String,
    #[serde(default)]
    app_gateways: Vec<AppGateway>,
    #[serde(default)]
    internet_blocked: bool,
    #[serde(default)]
    auto_start: bool,
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
    app_gateways: Vec<AppGateway>,
    internet_blocked: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct EnterpriseMessage {
    from: String,
    to: String,
    message: String,
    timestamp: u64,
}

//  Global State 

lazy_static::lazy_static! {
    static ref WATCHERS: Mutex<HashMap<String, RecommendedWatcher>> = Mutex::new(HashMap::new());
}

//  Internal Helpers 

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
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    format!("{}/.openclaw_enterprise/volumes/{}", home, id)
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

//  Device Identity Generation 

fn b64_encode(data: &[u8]) -> String {
    const C: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    let mut i = 0;
    while i + 2 < data.len() {
        let n = (data[i] as u32) << 16 | (data[i+1] as u32) << 8 | data[i+2] as u32;
        out.push(C[((n >> 18) & 63) as usize] as char);
        out.push(C[((n >> 12) & 63) as usize] as char);
        out.push(C[((n >>  6) & 63) as usize] as char);
        out.push(C[( n        & 63) as usize] as char);
        i += 3;
    }
    match data.len() - i {
        1 => {
            let n = (data[i] as u32) << 16;
            out.push(C[((n >> 18) & 63) as usize] as char);
            out.push(C[((n >> 12) & 63) as usize] as char);
            out.push_str("==");
        }
        2 => {
            let n = (data[i] as u32) << 16 | (data[i+1] as u32) << 8;
            out.push(C[((n >> 18) & 63) as usize] as char);
            out.push(C[((n >> 12) & 63) as usize] as char);
            out.push(C[((n >>  6) & 63) as usize] as char);
            out.push('=');
        }
        _ => {}
    }
    out
}

fn pem_encode(label: &str, data: &[u8]) -> String {
    let b64 = b64_encode(data);
    let wrapped = b64.as_bytes().chunks(64)
        .map(|c| std::str::from_utf8(c).unwrap())
        .collect::<Vec<_>>()
        .join("\n");
    format!("-----BEGIN {label}-----\n{wrapped}\n-----END {label}-----\n")
}

/// Ed25519 public key  SubjectPublicKeyInfo DER
fn ed25519_spki(pub_bytes: &[u8; 32]) -> Vec<u8> {
    // SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING { 0x00 || key } }
    let mut inner = vec![0x30u8, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
                         0x03, 0x21, 0x00];
    inner.extend_from_slice(pub_bytes);
    let mut spki = vec![0x30, inner.len() as u8];
    spki.extend_from_slice(&inner);
    spki
}

/// Ed25519 private key  PKCS#8 OneAsymmetricKey DER
fn ed25519_pkcs8(priv_bytes: &[u8; 32]) -> Vec<u8> {
    // inner private key octet string: 04 20 <key>
    let mut inner_key = vec![0x04u8, 0x20];
    inner_key.extend_from_slice(priv_bytes);
    // wrap in outer octet string
    let mut priv_os = vec![0x04u8, inner_key.len() as u8];
    priv_os.extend_from_slice(&inner_key);
    // version + alg id + private key
    let version: &[u8] = &[0x02, 0x01, 0x00];
    let alg_id:  &[u8] = &[0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70];
    let inner_len = version.len() + alg_id.len() + priv_os.len();
    let mut pkcs8 = vec![0x30, inner_len as u8];
    pkcs8.extend_from_slice(version);
    pkcs8.extend_from_slice(alg_id);
    pkcs8.extend_from_slice(&priv_os);
    pkcs8
}

/// Generate a fresh device identity: new Ed25519 keypair + random deviceId.
fn generate_device_identity() -> serde_json::Value {
    let mut rng = OsRng;
    let signing_key = SigningKey::generate(&mut rng);
    let verifying_key = signing_key.verifying_key();

    let pub_pem  = pem_encode("PUBLIC KEY",  &ed25519_spki(&verifying_key.to_bytes()));
    let priv_pem = pem_encode("PRIVATE KEY", &ed25519_pkcs8(&signing_key.to_bytes()));

    let mut id_bytes = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rng, &mut id_bytes);
    let device_id: String = id_bytes.iter().map(|b| format!("{b:02x}")).collect();

    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    serde_json::json!({
        "version": 1,
        "deviceId": device_id,
        "publicKeyPem": pub_pem,
        "privateKeyPem": priv_pem,
        "createdAtMs": created_at
    })
}

//  New-employee workspace cleanup 

/// After template copy: wipe inherited history and mint a fresh device identity.
fn clean_employee_workspace(vol: &str) {
    let base = PathBuf::from(vol).join(".openclaw");

    // 1. Wipe conversation session files (keep sessions.json but reset it)
    let sessions_dir = base.join("agents/main/sessions");
    if let Ok(entries) = fs::read_dir(&sessions_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().map(|e| e == "jsonl").unwrap_or(false) {
                let _ = fs::remove_file(&p);
            }
        }
    }
    let _ = fs::write(sessions_dir.join("sessions.json"), b"{}");

    // 2. Wipe cron run history
    let cron_runs = base.join("cron/runs");
    if let Ok(entries) = fs::read_dir(&cron_runs) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }

    // 3. Wipe logs
    let logs_dir = base.join("logs");
    if let Ok(entries) = fs::read_dir(&logs_dir) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }

    // 4. Reset Feishu dedup state
    let feishu_dedup = base.join("feishu/dedup/default.json");
    let _ = fs::write(&feishu_dedup, b"{}");

    // 5. Fresh device identity  new keypair + new deviceId
    let device_path = base.join("identity/device.json");
    if let Ok(data) = serde_json::to_string_pretty(&generate_device_identity()) {
        let _ = fs::write(&device_path, data);
        eprintln!("[openclaw] fresh device identity written");
    }
}

/// Lowercase, replace non-alphanumeric with dash  safe as a Docker network alias.
fn sanitize_alias(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c.to_ascii_lowercase() } else { '-' })
        .collect()
}

/// Ensure both Docker networks and the shared directory exist.
fn ensure_openclaw_networks() {
    // Create shared directory + bus subdir
    let _ = fs::create_dir_all("/tmp/openclaw_enterprise_shared/.bus");

    // openclaw-intranet: internal bridge (no internet egress) for peer comms
    let exists = Command::new("docker")
        .args(["network", "inspect", "openclaw-intranet"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !exists {
        let _ = Command::new("docker")
            .args(["network", "create", "--internal", "openclaw-intranet"])
            .output();
        eprintln!("[openclaw] created network: openclaw-intranet (internal)");
    }

    // openclaw-internet: regular bridge that has internet egress
    let exists = Command::new("docker")
        .args(["network", "inspect", "openclaw-internet"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !exists {
        let _ = Command::new("docker")
            .args(["network", "create", "openclaw-internet"])
            .output();
        eprintln!("[openclaw] created network: openclaw-internet");
    }
}

//  Config Injection (Strategy Pattern) 

fn extract_hostname(url: &str) -> Option<String> {
    let stripped = url
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    stripped.split('/').next().filter(|s| !s.is_empty()).map(|s| s.to_string())
}

trait ChannelStrategy {
    fn gateway_type(&self) -> &str;
    fn inject(&self, cfg: &mut serde_json::Value, creds: &HashMap<String, String>);
}

struct FeishuStrategy;
impl ChannelStrategy for FeishuStrategy {
    fn gateway_type(&self) -> &str { "feishu" }
    fn inject(&self, cfg: &mut serde_json::Value, creds: &HashMap<String, String>) {
        cfg["channels"]["feishu"] = serde_json::json!({
            "enabled": true,
            "appId": creds.get("FEISHU_APP_ID").cloned().unwrap_or_default(),
            "appSecret": creds.get("FEISHU_APP_SECRET").cloned().unwrap_or_default(),
            "connectionMode": "websocket"
        });
    }
}

struct LarkStrategy;
impl ChannelStrategy for LarkStrategy {
    fn gateway_type(&self) -> &str { "lark" }
    fn inject(&self, cfg: &mut serde_json::Value, creds: &HashMap<String, String>) {
        cfg["channels"]["lark"] = serde_json::json!({
            "enabled": true,
            "appId": creds.get("LARK_APP_ID").cloned().unwrap_or_default(),
            "appSecret": creds.get("LARK_APP_SECRET").cloned().unwrap_or_default(),
            "connectionMode": "websocket"
        });
    }
}

struct DiscordStrategy;
impl ChannelStrategy for DiscordStrategy {
    fn gateway_type(&self) -> &str { "discord" }
    fn inject(&self, cfg: &mut serde_json::Value, creds: &HashMap<String, String>) {
        let existing = cfg["channels"]["discord"].clone();
        let mut discord = if existing.is_object() {
            existing
        } else {
            serde_json::json!({
                "groupPolicy": "open",
                "streaming": "off",
                "dmPolicy": "allowlist",
                "allowFrom": []
            })
        };
        discord["enabled"] = serde_json::json!(true);
        discord["token"] = serde_json::json!(creds.get("DISCORD_BOT_TOKEN").cloned().unwrap_or_default());
        cfg["channels"]["discord"] = discord;
    }
}

/// Match each template provider slot by baseUrl hostname, inject the matching api_key.
fn inject_llm_in_providers(providers_val: &mut serde_json::Value, api_providers: &[ApiProvider]) {
    if let Some(map) = providers_val.as_object_mut() {
        for (_slot, slot_val) in map.iter_mut() {
            let slot_host = slot_val["baseUrl"]
                .as_str()
                .and_then(|u| extract_hostname(u));
            if let Some(slot_host) = slot_host {
                if let Some(matched) = api_providers.iter().find(|p| {
                    extract_hostname(&p.base_url).map(|h| h == slot_host).unwrap_or(false)
                }) {
                    slot_val["apiKey"] = serde_json::json!(matched.api_key);
                }
            }
        }
    }
}

/// Orchestrator: inject channel credentials + LLM api keys into the employee's volume.
fn inject_openclaw_config(vol: &str, api_providers: &[ApiProvider], app_gateways: &[AppGateway]) {
    let base = PathBuf::from(vol).join(".openclaw");
    let openclaw_path = base.join("openclaw.json");
    let models_path = base.join("agents").join("main").join("agent").join("models.json");

    let strategies: &[&dyn ChannelStrategy] = &[&FeishuStrategy, &LarkStrategy, &DiscordStrategy];

    // Patch openclaw.json
    if let Ok(raw) = fs::read_to_string(&openclaw_path) {
        if let Ok(mut cfg) = serde_json::from_str::<serde_json::Value>(&raw) {
            // Channels
            for gw in app_gateways.iter().filter(|g| g.enabled) {
                if let Some(s) = strategies.iter().find(|s| s.gateway_type() == gw.gateway_type) {
                    s.inject(&mut cfg, &gw.credentials);
                }
            }
            // LLM keys
            inject_llm_in_providers(&mut cfg["models"]["providers"], api_providers);

            if let Ok(data) = serde_json::to_string_pretty(&cfg) {
                let _ = fs::write(&openclaw_path, data);
                eprintln!("[openclaw] injected config  {}", openclaw_path.display());
            }
        }
    }

    // Patch agents/main/agent/models.json
    if let Ok(raw) = fs::read_to_string(&models_path) {
        if let Ok(mut cfg) = serde_json::from_str::<serde_json::Value>(&raw) {
            inject_llm_in_providers(&mut cfg["providers"], api_providers);

            if let Ok(data) = serde_json::to_string_pretty(&cfg) {
                let _ = fs::write(&models_path, data);
                eprintln!("[openclaw] injected config  {}", models_path.display());
            }
        }
    }
}

//  Config Commands 

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

//  Employee CRUD 

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
        app_gateways: e.app_gateways.clone(),
        internet_blocked: e.internet_blocked,
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

    let emp = EmployeeConfig { id: id.clone(), name, role, memory_limit, cpu_limit, app_gateways: vec![], internet_blocked: false, auto_start: false };
    config.employees.push(emp.clone());
    save_config_file(&path, &config)?;

    // Copy template + inject config  runs in background, never blocks UI
    let api_providers = config.api_providers.clone();
    // Resolve template path: user-configured > bundled resource > dev fallback
    let tpl_path: Option<String> = config.template_path.clone()
        .filter(|p| !p.is_empty())
        .or_else(|| {
            // Production: bundled resource
            app.path().resource_dir().ok()
                .map(|d| d.join("openclaw_template"))
                .filter(|p| p.is_dir())
                .map(|p| p.to_string_lossy().to_string())
        })
        .or_else(|| {
            // Dev mode: relative to Cargo.toml location (src-tauri/../openclaw_build/template)
            let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent().unwrap_or(Path::new("."))
                .join("openclaw_build/template");
            if dev.is_dir() { Some(dev.to_string_lossy().to_string()) } else { None }
        });

    if let Some(tpl) = tpl_path {
        let vol = vol_dir(&id);
        let src = PathBuf::from(&tpl);
        let dst = PathBuf::from(&vol);
        if src.is_dir() {
            if let Err(e) = copy_dir_contents(&src, &dst) {
                return Err(format!("Template copy failed: {e}"));
            }
        }
        // Wipe inherited history + mint fresh device identity
        clean_employee_workspace(&vol);
        // Inject LLM providers; gateways are empty at creation
        inject_openclaw_config(&vol, &api_providers, &[]);
    } else {
        eprintln!("[openclaw] no template found  employee volume will be empty");
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
fn save_gateways(
    app: AppHandle,
    employee_id: String,
    gateways: Vec<AppGateway>,
) -> Result<(), String> {
    let path = config_path(&app);
    let mut config = load_config_file(&path);
    config
        .employees
        .iter_mut()
        .find(|e| e.id == employee_id)
        .ok_or("Employee not found")?
        .app_gateways = gateways.clone();
    save_config_file(&path, &config)?;

    // Re-inject channel credentials into the employee's volume, then hot-reload
    let vol = vol_dir(&employee_id);
    let api_providers = config.api_providers.clone();
    let cname_reload = container_name(&employee_id);
    let emp_id_reload = employee_id.clone();
    std::thread::spawn(move || {
        inject_openclaw_config(&vol, &api_providers, &gateways);
        // If container is running, kill gateway process  watchdog restarts it with new config
        if container_status(&emp_id_reload) == "running" {
            let _ = Command::new("docker")
                .args(["exec", &cname_reload, "sh", "-c",
                       "pkill -f 'openclaw.mjs' 2>/dev/null || true"])
                .output();
            eprintln!("[openclaw] gateway reload triggered for {}", cname_reload);
        }
    });

    Ok(())
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

#[tauri::command]
fn set_internet_access(app: AppHandle, employee_id: String, blocked: bool) -> Result<(), String> {
    let path = config_path(&app);
    let mut config = load_config_file(&path);
    let emp = config
        .employees
        .iter_mut()
        .find(|e| e.id == employee_id)
        .ok_or("Employee not found")?;
    emp.internet_blocked = blocked;
    let emp_alias = sanitize_alias(&emp.name);
    save_config_file(&path, &config)?;

    // Live update if the container is currently running
    let cname = container_name(&employee_id);
    if container_status(&employee_id) == "running" {
        if blocked {
            let _ = Command::new("docker")
                .args(["network", "disconnect", "openclaw-internet", &cname])
                .output();
        } else {
            let _ = Command::new("docker")
                .args(["network", "connect", "--alias", &emp_alias, "openclaw-internet", &cname])
                .output();
        }
    }
    Ok(())
}

#[tauri::command]
fn list_enterprise_messages() -> Vec<EnterpriseMessage> {
    let bus_dir = PathBuf::from("/tmp/openclaw_enterprise_shared/.bus");
    if !bus_dir.exists() {
        return vec![];
    }
    let mut messages: Vec<EnterpriseMessage> = fs::read_dir(&bus_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let content = fs::read_to_string(entry.path()).ok()?;
            serde_json::from_str::<EnterpriseMessage>(&content).ok()
        })
        .collect();
    messages.sort_by_key(|m| m.timestamp);
    messages
}

#[tauri::command]
fn clear_enterprise_messages() -> Result<(), String> {
    let bus_dir = PathBuf::from("/tmp/openclaw_enterprise_shared/.bus");
    if bus_dir.exists() {
        for entry in fs::read_dir(&bus_dir).map_err(|e| e.to_string())?.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}

//  Sandbox Commands 

/// Core docker run logic  shared by start_sandbox and auto-recovery.
/// Removes any stale container with the same name before starting.
fn launch_container(
    id: &str,
    image: &str,
    memory_limit: &str,
    cpu_limit: &str,
    emp_name: &str,
    emp_alias: &str,
    gateway_env: &[(String, String)],
    internet_blocked: bool,
) -> std::io::Result<std::process::Output> {
    let name = container_name(id);
    let vol_mount = format!("{}:/workspace", vol_dir(id));
    let shared_mount = "/tmp/openclaw_enterprise_shared:/enterprise_shared".to_string();

    // Remove stale container (ignore errors  it might not exist)
    let _ = Command::new("docker").args(["rm", "-f", &name]).output();

    let mut args: Vec<String> = vec![
        "run".into(), "-d".into(),
        "--name".into(), name.clone(),
        "--memory".into(), memory_limit.to_string(),
        "--memory-swap".into(), memory_limit.to_string(),
        "--cpus".into(), cpu_limit.to_string(),
        "-v".into(), vol_mount,
        "-v".into(), shared_mount,
        "--network".into(), "openclaw-intranet".into(),
        "--network-alias".into(), emp_alias.to_string(),
        "-w".into(), "/workspace".into(),
        "--env".into(), format!("OPENCLAW_EMPLOYEE_NAME={}", emp_name),
    ];
    for (k, v) in gateway_env {
        args.push("--env".into());
        args.push(format!("{}={}", k, v));
    }
    args.push(image.to_string());
    args.extend_from_slice(&["tail".into(), "-f".into(), "/dev/null".into()]);

    let result = Command::new("docker").args(&args).output()?;

    if result.status.success() && !internet_blocked {
        let _ = Command::new("docker")
            .args(["network", "connect", "--alias", emp_alias, "openclaw-internet", &name])
            .output();
    }
    Ok(result)
}


#[tauri::command]
async fn start_sandbox(
    app: AppHandle,
    instance_id: String,
    memory_limit: String,
    cpu_limit: String,
) -> Result<String, String> {
    let vol = vol_dir(&instance_id);
    let _ = fs::create_dir_all(&vol);

    // Resolve image + collect enabled gateway env vars + write .openclaw.env
    let (base_image, gateway_env, emp_alias, emp_name, internet_blocked) = {
        let config = load_config_file(&config_path(&app));
        let image = config.default_image.unwrap_or_else(|| "openclaw-base".to_string());
        let (alias, display_name, blocked, env_pairs) =
            if let Some(e) = config.employees.iter().find(|e| e.id == instance_id) {
                let alias = sanitize_alias(&e.name);
                let display = e.name.clone();
                let blocked = e.internet_blocked;
                let pairs: Vec<(String, String)> = e
                    .app_gateways
                    .iter()
                    .filter(|g| g.enabled)
                    .flat_map(|g| g.credentials.iter().map(|(k, v)| (k.clone(), v.clone())))
                    .collect();
                (alias, display, blocked, pairs)
            } else {
                (instance_id.clone(), instance_id.clone(), false, vec![])
            };

        // Write .openclaw.env into the volume so template scripts can `source` it
        if !env_pairs.is_empty() {
            let content: String = env_pairs
                .iter()
                .map(|(k, v)| format!("export {}={}\n", k, v))
                .collect();
            let _ = fs::write(PathBuf::from(&vol).join(".openclaw.env"), content);
        }

        (image, env_pairs, alias, display_name, blocked)
    };

    // FS watcher  dedicated OS thread, not on the async executor
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

    // Docker run  delegate to launch_container helper
    let iid2 = instance_id.clone();
    let output = tauri::async_runtime::spawn_blocking(move || {
        launch_container(
            &iid2, &base_image, &memory_limit, &cpu_limit,
            &emp_name, &emp_alias,
            &gateway_env.iter().map(|(k,v)|(k.clone(),v.clone())).collect::<Vec<_>>(),
            internet_blocked,
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e: std::io::Error| e.to_string())?;

    if output.status.success() {
        // Mark auto_start so app restart can recover this container
        let cfg_path = config_path(&app);
        let mut cfg = load_config_file(&cfg_path);
        if let Some(emp) = cfg.employees.iter_mut().find(|e| e.id == instance_id) {
            emp.auto_start = true;
            let _ = save_config_file(&cfg_path, &cfg);
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn stop_sandbox(app: AppHandle, instance_id: String) -> Result<String, String> {
    { WATCHERS.lock().unwrap().remove(&instance_id); }

    let cname = container_name(&instance_id);
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new("docker").args(["rm", "-f", &cname]).output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    if output.status.success() {
        // Clear auto_start so this employee won't be recovered on next app launch
        let cfg_path = config_path(&app);
        let mut cfg = load_config_file(&cfg_path);
        if let Some(emp) = cfg.employees.iter_mut().find(|e| e.id == instance_id) {
            emp.auto_start = false;
            let _ = save_config_file(&cfg_path, &cfg);
        }
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

//  File System Commands 

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

//  Entry Point 

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            ensure_openclaw_networks();
            // Auto-recover containers that were running before app was closed
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let cfg = load_config_file(&config_path(&app_handle));
                let image = cfg.default_image.clone().unwrap_or_else(|| "openclaw-base".to_string());
                for emp in cfg.employees.iter().filter(|e| e.auto_start) {
                    let status = container_status(&emp.id);
                    if status == "running" {
                        continue; // already up
                    }
                    // Recreate from scratch  works whether container exists or not
                    let gateway_env: Vec<(String, String)> = emp.app_gateways.iter()
                        .filter(|g| g.enabled)
                        .flat_map(|g| g.credentials.iter().map(|(k,v)|(k.clone(),v.clone())))
                        .collect();
                    let alias = sanitize_alias(&emp.name);
                    let _ = fs::create_dir_all(vol_dir(&emp.id));
                    match launch_container(
                        &emp.id, &image,
                        &emp.memory_limit, &emp.cpu_limit,
                        &emp.name, &alias,
                        &gateway_env,
                        emp.internet_blocked,
                    ) {
                        Ok(r) if r.status.success() =>
                            eprintln!("[openclaw] auto-recovered: openclaw_{}", emp.id),
                        Ok(r) =>
                            eprintln!("[openclaw] recovery failed: {}", String::from_utf8_lossy(&r.stderr)),
                        Err(e) =>
                            eprintln!("[openclaw] recovery error: {e}"),
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_providers,
            save_sandbox_settings,
            list_employees,
            add_employee,
            update_employee,
            remove_employee,
            save_gateways,
            set_internet_access,
            list_enterprise_messages,
            clear_enterprise_messages,
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
