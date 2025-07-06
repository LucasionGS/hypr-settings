// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::process::Command;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{Manager, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Monitor {
    pub id: i32,
    pub name: String,
    pub width: i32,
    pub height: i32,
    pub x: i32,
    pub y: i32,
    #[serde(rename = "refreshRate")]
    pub refresh_rate: f64,
    pub disabled: bool,
    pub scale: f64,
    #[serde(rename = "availableModes")]
    pub available_modes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiNetwork {
    pub ssid: String,
    pub signal_strength: i32,
    pub security: String,
    pub connected: bool,
    pub saved: bool,
    pub in_use: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiStatus {
    pub enabled: bool,
    pub connected_ssid: Option<String>,
    pub interface: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BluetoothDevice {
    pub mac_address: String,
    pub name: String,
    pub device_type: String,
    pub connected: bool,
    pub paired: bool,
    pub trusted: bool,
    pub rssi: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BluetoothStatus {
    pub enabled: bool,
    pub discoverable: bool,
    pub discovering: bool,
    pub adapter_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeSettings {
    pub gtk_theme: String,
    pub icon_theme: String,
    pub font_name: String,
    pub font_size: i32,
    pub color_scheme: String, // "default", "prefer-dark", "prefer-light"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableThemes {
    pub gtk_themes: Vec<String>,
    pub icon_themes: Vec<String>,
    pub fonts: Vec<String>,
}

// Package management structs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageInfo {
    pub name: String,
    pub version: String,
    pub description: String,
    pub installed: bool,
    pub size: Option<String>,
    pub repo: Option<String>,
    pub updatable: Option<bool>,
    pub new_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageOperation {
    pub operation: String, // "install", "remove", "update", "search"
    pub package_name: Option<String>,
    pub progress: u32,
    pub status: String,
    pub output: Vec<String>,
    pub running: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
    .setup(|app| {
        #[cfg(debug_assertions)] // only include this code on debug builds
        {
            let window = app.get_webview_window("main").unwrap();
            window.open_devtools();
            window.close_devtools();
        }
        
        // Start monitoring system theme changes
        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = monitor_system_theme_changes(app_handle).await {
                eprintln!("Failed to start theme monitoring: {}", e);
            }
        });
        
        Ok(())
    })
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())

    // Invokeable commands
    .invoke_handler(tauri::generate_handler![greet, get_monitors, save_monitor_config, get_wifi_status, get_wifi_networks, refresh_wifi_networks, connect_wifi, disconnect_wifi, forget_wifi, toggle_wifi, get_bluetooth_status, get_bluetooth_devices, toggle_bluetooth, start_bluetooth_discovery, stop_bluetooth_discovery, pair_bluetooth_device, unpair_bluetooth_device, connect_bluetooth_device, disconnect_bluetooth_device, trust_bluetooth_device, get_theme_settings, save_theme_settings, get_available_themes, get_system_theme, monitor_system_theme_changes, get_color_scheme, detect_aur_helper, get_installed_packages, search_packages, get_package_updates, install_package, remove_package, update_package, system_update])


    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_monitors() -> Result<Vec<Monitor>, String> {
    let output = Command::new("hyprctl")
        .arg("monitors")
        .arg("-j")
        .output()
        .map_err(|e| format!("Failed to execute hyprctl: {}", e))?;
    
    if !output.status.success() {
        return Err("Failed to get monitors from hyprctl".to_string());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let monitors: Vec<serde_json::Value> = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse monitor data: {}", e))?;
    
    let mut result = Vec::new();
    
    for (index, monitor) in monitors.iter().enumerate() {
        let name = monitor["name"].as_str().unwrap_or("Unknown").to_string();
        let width = monitor["width"].as_i64().unwrap_or(0) as i32;
        let height = monitor["height"].as_i64().unwrap_or(0) as i32;
        let x = monitor["x"].as_i64().unwrap_or(0) as i32;
        let y = monitor["y"].as_i64().unwrap_or(0) as i32;
        let refresh_rate = monitor["refreshRate"].as_f64().unwrap_or(60.0);
        let disabled = monitor["disabled"].as_bool().unwrap_or(false);
        let scale = monitor["scale"].as_f64().unwrap_or(1.0);
        
        // Get available modes from JSON
        let available_modes = if let Some(modes_array) = monitor["availableModes"].as_array() {
            modes_array.iter()
                .filter_map(|mode| mode.as_str().map(|s| s.to_string()))
                .collect()
        } else {
            // Fallback to common modes if not available
            vec![
                "1920x1080@60.00Hz".to_string(),
                "1920x1080@59.94Hz".to_string(),
                "1680x1050@59.95Hz".to_string(),
                "1280x1024@75.03Hz".to_string(),
                "1280x1024@60.02Hz".to_string(),
                "1440x900@59.89Hz".to_string(),
                "1280x960@60.00Hz".to_string(),
                "1280x720@60.00Hz".to_string(),
                "1024x768@75.03Hz".to_string(),
                "1024x768@70.07Hz".to_string(),
                "1024x768@60.00Hz".to_string(),
                "800x600@75.00Hz".to_string(),
                "800x600@72.19Hz".to_string(),
                "800x600@60.32Hz".to_string(),
                "640x480@75.00Hz".to_string(),
                "640x480@72.81Hz".to_string(),
                "640x480@59.94Hz".to_string(),
            ]
        };
        
        result.push(Monitor {
            id: index as i32,
            name,
            width,
            height,
            x,
            y,
            refresh_rate,
            disabled,
            scale,
            available_modes,
        });
    }
    
    Ok(result)
}


#[tauri::command]
fn save_monitor_config(monitors: Vec<Monitor>) -> Result<String, String> {
    println!("Received monitors for saving: {:?}", monitors);
    
    // Get home directory
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    
    // Create config directory path
    let config_dir = Path::new(&home).join(".config/hypr/configs/autogen");
    let config_file = config_dir.join("monitors.conf");
    
    // Create directory if it doesn't exist
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    
    // Generate configuration content
    let mut config_content = String::new();
    config_content.push_str("###############################################################\n");
    config_content.push_str("## DO NOT EDIT THIS FILE!                                    ##\n");
    config_content.push_str("## This file is automatically generated by Archion Settings. ##\n");
    config_content.push_str("###############################################################\n");
    
    for monitor in &monitors {
        config_content.push_str(&format!(
            "monitor = {}, {}x{}@{:.2}, {}x{}, {:.2}\n",
            monitor.name,
            monitor.width,
            monitor.height,
            monitor.refresh_rate,
            monitor.x,
            monitor.y,
            monitor.scale
        ));

        if monitor.disabled {
            config_content.push_str(&format!("monitor = {}, disabled\n", monitor.name));
        }
    }
    
    println!("Generated monitor configuration:\n{}", config_content);
    
    // Write to config file
    fs::write(&config_file, config_content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    // Also apply the configuration live using hyprctl
    // for monitor in monitors {
    //     if monitor.disabled {
    //         // Disable monitor
    //         let output = Command::new("hyprctl")
    //             .arg("keyword")
    //             .arg("monitor")
    //             .arg(format!("{}, disable", monitor.name))
    //             .output()
    //             .map_err(|e| format!("Failed to disable monitor {}: {}", monitor.name, e))?;
            
    //         if !output.status.success() {
    //             return Err(format!("Failed to disable monitor {}", monitor.name));
    //         }
    //     } else {
    //         // Configure monitor
    //         let config = format!(
    //             "{}, {}x{}@{}, {}x{}, {}",
    //             monitor.name,
    //             monitor.width,
    //             monitor.height,
    //             monitor.refresh_rate,
    //             monitor.x,
    //             monitor.y,
    //             monitor.scale
    //         );
            
    //         let output = Command::new("hyprctl")
    //             .arg("keyword")
    //             .arg("monitor")
    //             .arg(config)
    //             .output()
    //             .map_err(|e| format!("Failed to configure monitor {}: {}", monitor.name, e))?;
            
    //         if !output.status.success() {
    //             return Err(format!("Failed to configure monitor {}", monitor.name));
    //         }
    //     }
    // }
    
    Ok(format!("Monitor configuration saved to {}", config_file.display()))
}

#[tauri::command]
fn get_wifi_status() -> Result<WifiStatus, String> {
    let output = Command::new("nmcli")
        .args(["-t", "-f", "WIFI", "general"])
        .output()
        .map_err(|e| format!("Failed to get WiFi status: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let wifi_enabled = stdout.trim() == "enabled";
    
    // Get WiFi interface
    let interface_output = Command::new("nmcli")
        .args(["-t", "-f", "DEVICE,TYPE", "device"])
        .output()
        .map_err(|e| format!("Failed to get interfaces: {}", e))?;
    
    let interface_stdout = String::from_utf8_lossy(&interface_output.stdout);
    let mut interface = String::from("wlan0"); // default fallback
    
    for line in interface_stdout.lines() {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() >= 2 && parts[1] == "wifi" {
            interface = parts[0].to_string();
            break;
        }
    }
    
    // Get connected network
    let connected_output = Command::new("nmcli")
        .args(["-t", "-f", "NAME", "connection", "show", "--active"])
        .output()
        .map_err(|e| format!("Failed to get active connections: {}", e))?;
    
    let connected_stdout = String::from_utf8_lossy(&connected_output.stdout);
    let connected_ssid = if connected_stdout.trim().is_empty() {
        None
    } else {
        connected_stdout.trim().lines().next().map(|s| s.to_string())
    };
    
    Ok(WifiStatus {
        enabled: wifi_enabled,
        connected_ssid,
        interface,
    })
}

#[tauri::command]
fn get_wifi_networks() -> Result<Vec<WifiNetwork>, String> {
    // Skip automatic rescan to avoid permission prompts
    // Users can manually refresh if needed
    // let _ = Command::new("nmcli")
    //     .args(["device", "wifi", "rescan"])
    //     .output();
    
    // Get available networks from cache
    let output = Command::new("nmcli")
        .args(["-t", "-f", "SSID,SIGNAL,SECURITY,IN-USE", "device", "wifi", "list"])
        .output()
        .map_err(|e| format!("Failed to get WiFi networks: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Get saved connections
    let saved_output = Command::new("nmcli")
        .args(["-t", "-f", "NAME", "connection", "show"])
        .output()
        .map_err(|e| format!("Failed to get saved connections: {}", e))?;
    
    let saved_stdout = String::from_utf8_lossy(&saved_output.stdout);
    let saved_networks: Vec<&str> = saved_stdout.lines().collect();
    
    let mut networks = Vec::new();
    
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() >= 4 {
            let ssid = parts[0].to_string();
            if ssid.is_empty() {
                continue; // Skip hidden networks
            }
            
            let signal_strength = parts[1].parse().unwrap_or(0);
            let security = parts[2].to_string();
            let in_use = parts[3] == "*";
            let saved = saved_networks.contains(&ssid.as_str());
            
            networks.push(WifiNetwork {
                ssid,
                signal_strength,
                security,
                connected: in_use,
                saved,
                in_use,
            });
        }
    }
    
    // Remove duplicates and sort: saved networks first, then by signal strength
    networks.sort_by(|a, b| {
        match (a.saved, b.saved) {
            (true, false) => std::cmp::Ordering::Less,  // a is saved, b is not - a comes first
            (false, true) => std::cmp::Ordering::Greater, // b is saved, a is not - b comes first
            _ => b.signal_strength.cmp(&a.signal_strength), // both same saved status - sort by signal
        }
    });
    networks.dedup_by(|a, b| a.ssid == b.ssid);
    
    Ok(networks)
}

#[tauri::command]
fn connect_wifi(ssid: String, password: Option<String>) -> Result<String, String> {
    let mut args = vec!["device", "wifi", "connect", &ssid];
    
    if let Some(pwd) = &password {
        args.push("password");
        args.push(pwd);
    }
    
    let output = Command::new("nmcli")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to connect to WiFi: {}", e))?;
    
    if output.status.success() {
        Ok(format!("Connected to {}", ssid))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to connect: {}", stderr))
    }
}

#[tauri::command]
fn disconnect_wifi(ssid: String) -> Result<String, String> {
    let output = Command::new("nmcli")
        .args(["connection", "down", &ssid])
        .output()
        .map_err(|e| format!("Failed to disconnect from WiFi: {}", e))?;
    
    if output.status.success() {
        Ok(format!("Disconnected from {}", ssid))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to disconnect: {}", stderr))
    }
}

#[tauri::command]
fn forget_wifi(ssid: String) -> Result<String, String> {
    let output = Command::new("nmcli")
        .args(["connection", "delete", &ssid])
        .output()
        .map_err(|e| format!("Failed to forget WiFi network: {}", e))?;
    
    if output.status.success() {
        Ok(format!("Forgot network {}", ssid))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to forget network: {}", stderr))
    }
}

#[tauri::command]
fn toggle_wifi(enable: bool) -> Result<String, String> {
    let state = if enable { "on" } else { "off" };
    
    let output = Command::new("nmcli")
        .args(["radio", "wifi", state])
        .output()
        .map_err(|e| format!("Failed to toggle WiFi: {}", e))?;
    
    if output.status.success() {
        Ok(format!("WiFi turned {}", state))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to toggle WiFi: {}", stderr))
    }
}

#[tauri::command]
fn get_bluetooth_status() -> Result<BluetoothStatus, String> {
    let output = Command::new("bluetoothctl")
        .args(["show"])
        .output()
        .map_err(|e| format!("Failed to get Bluetooth status: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    let mut enabled = false;
    let mut discoverable = false;
    let mut discovering = false;
    let mut adapter_name = String::from("Unknown");
    
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("Name:") {
            adapter_name = line.replace("Name:", "").trim().to_string();
        } else if line.starts_with("Powered:") {
            enabled = line.contains("yes");
        } else if line.starts_with("Discoverable:") {
            discoverable = line.contains("yes");
        } else if line.starts_with("Discovering:") {
            discovering = line.contains("yes");
        }
    }
    
    Ok(BluetoothStatus {
        enabled,
        discoverable,
        discovering,
        adapter_name,
    })
}

#[tauri::command]
fn get_bluetooth_devices() -> Result<Vec<BluetoothDevice>, String> {
    let output = Command::new("bluetoothctl")
        .args(["devices"])
        .output()
        .map_err(|e| format!("Failed to get Bluetooth devices: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut devices = Vec::new();
    
    for line in stdout.lines() {
        if line.starts_with("Device ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let mac_address = parts[1].to_string();
                let name = parts[2..].join(" ");
                
                // Get detailed info for each device
                let info_output = Command::new("bluetoothctl")
                    .args(["info", &mac_address])
                    .output();
                
                let info_stdout = if let Ok(output) = info_output {
                    String::from_utf8_lossy(&output.stdout).to_string()
                } else {
                    String::new()
                };
                
                let mut connected = false;
                let mut paired = false;
                let mut trusted = false;
                let mut device_type = String::from("Unknown");
                let mut rssi = None;
                
                for info_line in info_stdout.lines() {
                    let info_line = info_line.trim();
                    if info_line.starts_with("Connected:") {
                        connected = info_line.contains("yes");
                    } else if info_line.starts_with("Paired:") {
                        paired = info_line.contains("yes");
                    } else if info_line.starts_with("Trusted:") {
                        trusted = info_line.contains("yes");
                    } else if info_line.starts_with("Icon:") {
                        device_type = info_line.replace("Icon:", "").trim().to_string();
                    } else if info_line.starts_with("RSSI:") {
                        if let Some(rssi_str) = info_line.split(':').nth(1) {
                            rssi = rssi_str.trim().parse().ok();
                        }
                    }
                }
                
                devices.push(BluetoothDevice {
                    mac_address,
                    name,
                    device_type,
                    connected,
                    paired,
                    trusted,
                    rssi,
                });
            }
        }
    }
    
    // Sort by connection status, then paired status, then name
    devices.sort_by(|a, b| {
        match (a.connected, b.connected) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => match (a.paired, b.paired) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.cmp(&b.name),
            }
        }
    });
    
    Ok(devices)
}

#[tauri::command]
fn toggle_bluetooth(enable: bool) -> Result<String, String> {
    let state = if enable { "on" } else { "off" };
    
    let output = Command::new("bluetoothctl")
        .args(["power", state])
        .output()
        .map_err(|e| format!("Failed to toggle Bluetooth: {}", e))?;
    
    if output.status.success() {
        Ok(format!("Bluetooth turned {}", state))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to toggle Bluetooth: {}", stderr))
    }
}

#[tauri::command]
fn start_bluetooth_discovery() -> Result<String, String> {
    let output = Command::new("bluetoothctl")
        .args(["scan", "on"])
        .output()
        .map_err(|e| format!("Failed to start discovery: {}", e))?;
    
    if output.status.success() {
        Ok("Discovery started".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to start discovery: {}", stderr))
    }
}

#[tauri::command]
fn stop_bluetooth_discovery() -> Result<String, String> {
    let output = Command::new("bluetoothctl")
        .args(["scan", "off"])
        .output()
        .map_err(|e| format!("Failed to stop discovery: {}", e))?;
    
    if output.status.success() {
        Ok("Discovery stopped".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to stop discovery: {}", stderr))
    }
}

#[tauri::command]
fn pair_bluetooth_device(mac_address: String) -> Result<String, String> {
    let output = Command::new("bluetoothctl")
        .args(["pair", &mac_address])
        .output()
        .map_err(|e| format!("Failed to pair device: {}", e))?;
    
    if output.status.success() {
        Ok(format!("Device {} paired successfully", mac_address))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to pair device: {}", stderr))
    }
}

#[tauri::command]
fn unpair_bluetooth_device(mac_address: String) -> Result<String, String> {
    let output = Command::new("bluetoothctl")
        .args(["remove", &mac_address])
        .output()
        .map_err(|e| format!("Failed to unpair device: {}", e))?;
    
    if output.status.success() {
        Ok(format!("Device {} unpaired successfully", mac_address))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to unpair device: {}", stderr))
    }
}

#[tauri::command]
fn connect_bluetooth_device(mac_address: String) -> Result<String, String> {
    let output = Command::new("bluetoothctl")
        .args(["connect", &mac_address])
        .output()
        .map_err(|e| format!("Failed to connect to device: {}", e))?;
    
    if output.status.success() {
        Ok(format!("Connected to device {}", mac_address))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to connect to device: {}", stderr))
    }
}

#[tauri::command]
fn disconnect_bluetooth_device(mac_address: String) -> Result<String, String> {
    let output = Command::new("bluetoothctl")
        .args(["disconnect", &mac_address])
        .output()
        .map_err(|e| format!("Failed to disconnect from device: {}", e))?;
    
    if output.status.success() {
        Ok(format!("Disconnected from device {}", mac_address))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to disconnect from device: {}", stderr))
    }
}

#[tauri::command]
fn trust_bluetooth_device(mac_address: String, trust: bool) -> Result<String, String> {
    let action = if trust { "trust" } else { "untrust" };
    
    let output = Command::new("bluetoothctl")
        .args([action, &mac_address])
        .output()
        .map_err(|e| format!("Failed to {} device: {}", action, e))?;
    
    if output.status.success() {
        Ok(format!("Device {} {}ed successfully", mac_address, action))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to {} device: {}", action, stderr))
    }
}

// Theme management functions
#[tauri::command]
async fn get_theme_settings() -> Result<ThemeSettings, String> {
    let gtk_theme = get_gsetting("org.gnome.desktop.interface", "gtk-theme").await?;
    let icon_theme = get_gsetting("org.gnome.desktop.interface", "icon-theme").await?;
    let font_name = get_gsetting("org.gnome.desktop.interface", "font-name").await?;
    let color_scheme = get_gsetting("org.gnome.desktop.interface", "color-scheme").await?;

    // Extract font size from font name (e.g., "Ubuntu 11" -> name: "Ubuntu", size: 11)
    let (font_family, font_size) = parse_font_string(&font_name);

    Ok(ThemeSettings {
        gtk_theme,
        icon_theme,
        font_name: font_family,
        font_size,
        color_scheme,
    })
}

#[tauri::command]
async fn save_theme_settings(settings: ThemeSettings) -> Result<String, String> {
    // Apply theme settings using gsettings
    set_gsetting("org.gnome.desktop.interface", "gtk-theme", &settings.gtk_theme).await?;
    set_gsetting("org.gnome.desktop.interface", "icon-theme", &settings.icon_theme).await?;
    
    // Combine font name and size for gsettings
    let font_string = format!("{} {}", settings.font_name, settings.font_size);
    set_gsetting("org.gnome.desktop.interface", "font-name", &font_string).await?;
    set_gsetting("org.gnome.desktop.interface", "color-scheme", &settings.color_scheme).await?;

    Ok("Theme settings saved successfully".to_string())
}

#[tauri::command]
async fn get_available_themes() -> Result<AvailableThemes, String> {
    println!("Getting available themes...");
    let gtk_themes = get_available_gtk_themes().await?;
    let icon_themes = get_available_icon_themes().await?;
    let fonts = get_available_fonts().await?;
    
    println!("Found {} fonts", fonts.len());
    for (i, font) in fonts.iter().enumerate() {
        if i < 5 {
            println!("Font {}: {}", i, font);
        }
    }

    Ok(AvailableThemes {
        gtk_themes,
        icon_themes,
        fonts,
    })
}

// New command to get the system theme
#[tauri::command]
async fn get_system_theme() -> Result<String, String> {
    // First try to get the color scheme preference (most reliable)
    match get_gsetting("org.gnome.desktop.interface", "color-scheme").await {
        Ok(color_scheme) => {
            println!("Color scheme: {}", color_scheme); // Debug log
            
            // If we have a specific preference, use it
            if color_scheme == "prefer-dark" || color_scheme.contains("dark") {
                return Ok("prefer-dark".to_string());
            } else if color_scheme == "prefer-light" || color_scheme.contains("light") {
                return Ok("prefer-light".to_string());
            }
            
            // If color scheme is 'default', fall back to GTK theme
            println!("Color scheme is default, checking GTK theme...");
        }
        Err(_) => {
            println!("Failed to get color scheme, checking GTK theme...");
        }
    }
    
    // Fallback: try to get the GTK theme preference
    let output = Command::new("gsettings")
        .args(&["get", "org.gnome.desktop.interface", "gtk-theme"])
        .output()
        .map_err(|e| format!("Failed to execute gsettings: {}", e))?;

    if output.status.success() {
        let theme_name = String::from_utf8_lossy(&output.stdout).trim().trim_matches('\'').to_string();
        println!("Current GTK theme: {}", theme_name); // Debug log
        Ok(theme_name)
    } else {
        println!("Failed to get GTK theme, defaulting to dark");
        Ok("dark".to_string()) // Default fallback
    }
}

#[tauri::command]
async fn monitor_system_theme_changes(app_handle: tauri::AppHandle) -> Result<(), String> {
    use std::process::Stdio;
    
    tokio::spawn(async move {
        println!("Starting gsettings monitor for theme changes...");
        
        let mut child = match Command::new("gsettings")
            .args(&["monitor", "org.gnome.desktop.interface"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(e) => {
                eprintln!("Failed to start gsettings monitor: {}", e);
                return;
            }
        };

        if let Some(stdout) = child.stdout.take() {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            
            for line in reader.lines() {
                match line {
                    Ok(line) => {
                        println!("gsettings change detected: {}", line);
                        
                        // Check if it's a theme-related change
                        if line.contains("gtk-theme") || line.contains("color-scheme") {
                            println!("Theme change detected, notifying frontend...");
                            
                            // Get both the current theme and color scheme
                            let (theme_info, color_scheme) = if line.contains("color-scheme") {
                                // Color scheme changed - get the color scheme directly
                                match get_gsetting("org.gnome.desktop.interface", "color-scheme").await {
                                    Ok(scheme) => {
                                        println!("Color scheme changed to: {}", scheme);
                                        (scheme.clone(), Some(scheme))
                                    }
                                    Err(e) => {
                                        eprintln!("Failed to get color scheme: {}", e);
                                        ("dark".to_string(), None)
                                    }
                                }
                            } else {
                                // GTK theme changed - get the theme name
                                match get_system_theme().await {
                                    Ok(theme) => (theme, None),
                                    Err(e) => {
                                        eprintln!("Failed to get current theme: {}", e);
                                        ("dark".to_string(), None)
                                    }
                                }
                            };
                            
                            // Emit appropriate event to frontend
                            if let Some(scheme) = color_scheme {
                                // Color scheme change - emit with actual scheme value
                                if let Err(e) = app_handle.emit("color-scheme-changed", &scheme) {
                                    eprintln!("Failed to emit color-scheme-changed event: {}", e);
                                }
                            } else {
                                // Theme change - emit with theme name
                                if let Err(e) = app_handle.emit("theme-changed", &theme_info) {
                                    eprintln!("Failed to emit theme-changed event: {}", e);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Error reading gsettings monitor output: {}", e);
                        break;
                    }
                }
            }
        }
        
        println!("gsettings monitor ended");
    });
    
    Ok(())
}

async fn get_gsetting(schema: &str, key: &str) -> Result<String, String> {
    let output = tokio::process::Command::new("gsettings")
        .args(["get", schema, key])
        .output()
        .await
        .map_err(|e| format!("Failed to get gsetting {}.{}: {}", schema, key, e))?;

    if output.status.success() {
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // Remove quotes from string values
        if value.starts_with('\'') && value.ends_with('\'') {
            Ok(value[1..value.len()-1].to_string())
        } else {
            Ok(value)
        }
    } else {
        Err(format!("Failed to get gsetting {}.{}", schema, key))
    }
}

async fn set_gsetting(schema: &str, key: &str, value: &str) -> Result<(), String> {
    let output = tokio::process::Command::new("gsettings")
        .args(["set", schema, key, value])
        .output()
        .await
        .map_err(|e| format!("Failed to set gsetting {}.{}: {}", schema, key, e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to set gsetting {}.{}: {}", schema, key, stderr))
    }
}

async fn get_available_gtk_themes() -> Result<Vec<String>, String> {
    let mut themes = Vec::new();
    
    // Always include built-in GTK themes first
    let builtin_themes = vec![
        "Adwaita".to_string(),
        "Adwaita-dark".to_string(),
        "Default".to_string(),
        "HighContrast".to_string(),
        "HighContrastInverse".to_string(),
    ];

    for builtin in &builtin_themes {
        themes.push(builtin.clone());
    }
    
    // Check common theme directories for additional themes
    let theme_dirs = Vec::from([
        "/usr/share/themes",
        "/usr/local/share/themes",
        "~/.themes",
        "~/.local/share/themes",
    ]);

    for dir in theme_dirs {
        let expanded_dir = if dir.starts_with('~') {
            dir.replace('~', &std::env::var("HOME").unwrap_or_default())
        } else {
            dir.to_string()
        };

        if let Ok(entries) = std::fs::read_dir(&expanded_dir) {
            for entry in entries.flatten() {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let theme_name = entry.file_name().to_string_lossy().to_string();
                    let theme_path = entry.path();
                    
                    // Check for various GTK theme indicators
                    let has_gtk3 = theme_path.join("gtk-3.0").exists();
                    let has_gtk4 = theme_path.join("gtk-4.0").exists();
                    let has_index = theme_path.join("index.theme").exists();
                    let has_gtk2 = theme_path.join("gtk-2.0").exists();
                    
                    // Accept theme if it has any GTK-related files/directories or index.theme
                    if has_gtk3 || has_gtk4 || has_index || has_gtk2 {
                        if !themes.contains(&theme_name) {
                            themes.push(theme_name);
                        }
                    }
                }
            }
        }
    }

    themes.sort();
    themes.dedup(); // Remove any duplicates
    
    println!("Available GTK themes: {:?}", themes);
    Ok(themes)
}

async fn get_available_icon_themes() -> Result<Vec<String>, String> {
    let mut themes = Vec::new();
    
    let icon_dirs = [
        "/usr/share/icons",
        "/usr/local/share/icons",
        "~/.icons",
        "~/.local/share/icons",
    ];

    for dir in icon_dirs {
        let expanded_dir = if dir.starts_with('~') {
            dir.replace('~', &std::env::var("HOME").unwrap_or_default())
        } else {
            dir.to_string()
        };

        if let Ok(entries) = std::fs::read_dir(&expanded_dir) {
            for entry in entries.flatten() {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let theme_name = entry.file_name().to_string_lossy().to_string();
                    // Check if it has an index.theme file
                    if entry.path().join("index.theme").exists() {
                        if !themes.contains(&theme_name) {
                            themes.push(theme_name);
                        }
                    }
                }
            }
        }
    }

    themes.sort();
    Ok(themes)
}

async fn get_available_fonts() -> Result<Vec<String>, String> {
    // First try fc-list command
    let output = tokio::process::Command::new("fc-list")
        .args([":", "family"])
        .output()
        .await;
    
    match output {
        Ok(output) if output.status.success() => {
            let fonts_output = String::from_utf8_lossy(&output.stdout);
            let mut fonts: Vec<String> = fonts_output
                .lines()
                .filter_map(|line| {
                    let line = line.trim();
                    if line.is_empty() {
                        return None;
                    }
                    
                    // fc-list : family returns lines like:
                    // "JetBrains Mono,JetBrains Mono Medium"
                    // "Roboto Condensed,Roboto Condensed Light"
                    // We want to extract just the first font family name
                    
                    let family_name = line.split(',').next().unwrap_or(line).trim();
                    
                    // Skip empty or unwanted fonts
                    if family_name.is_empty() || 
                       family_name.to_lowercase().contains("emoji") || 
                       family_name.to_lowercase().contains("symbol") ||
                       family_name.contains("Noto Color Emoji") ||
                       family_name.to_lowercase().contains("standard symbols") ||
                       family_name.to_lowercase().contains("feather") {
                        return None;
                    }
                    
                    Some(family_name.to_string())
                })
                .collect();

            fonts.sort();
            fonts.dedup();
            
            println!("Parsed {} fonts from fc-list", fonts.len()); // Debug log
            
            // Prioritize common system fonts by moving them to the front
            let priority_fonts = ["Ubuntu", "Cantarell", "Source Sans Pro", "Roboto", "Open Sans", "Noto Sans", "Liberation", "Adwaita", "JetBrains Mono"];
            let mut prioritized = Vec::new();
            let mut remaining = Vec::new();
            
            for font in fonts {
                if priority_fonts.iter().any(|&pf| font.contains(pf)) {
                    prioritized.push(font);
                } else {
                    remaining.push(font);
                }
            }
            
            prioritized.extend(remaining);
            
            // Limit to reasonable number for UI performance
            if prioritized.len() > 50 {
                prioritized.truncate(50);
            }
            
            println!("Returning {} fonts to frontend", prioritized.len()); // Debug log
            
            Ok(prioritized)
        }
        _ => {
            // Fallback to some common fonts if fc-list fails
            println!("fc-list command failed, using fallback fonts");
            Ok(vec![
                "Ubuntu".to_string(),
                "DejaVu Sans".to_string(),
                "Liberation Sans".to_string(),
                "Cantarell".to_string(),
                "Noto Sans".to_string(),
                "Source Sans Pro".to_string(),
                "Roboto".to_string(),
                "Open Sans".to_string(),
                "Arial".to_string(),
                "Helvetica".to_string(),
                "sans-serif".to_string(),
            ])
        }
    }
}

fn parse_font_string(font_string: &str) -> (String, i32) {
    let parts: Vec<&str> = font_string.rsplit_once(' ').map_or(vec![font_string], |(name, size)| vec![name, size]);
    
    if parts.len() == 2 {
        let font_name = parts[0].to_string();
        let font_size = parts[1].parse::<i32>().unwrap_or(11);
        (font_name, font_size)
    } else {
        (font_string.to_string(), 11)
    }
}

// New command to get the color scheme specifically
#[tauri::command]
async fn get_color_scheme() -> Result<String, String> {
    get_gsetting("org.gnome.desktop.interface", "color-scheme").await
}

// Helper function to get the appropriate privilege escalation command
async fn get_privilege_command() -> String {
    // Check if pkexec is available (preferred for GUI apps)
    // pkexec shows a GUI authentication dialog instead of requiring terminal input
    if Command::new("which")
        .arg("pkexec")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
    {
        return "pkexec".to_string();
    }
    
    // Fallback to sudo if pkexec is not available
    "sudo".to_string()
}

// Function to run AUR helper commands in a terminal window for interactive access
async fn run_command_in_terminal(
    app_handle: tauri::AppHandle,
    operation: String,
    package_name: Option<String>,
    cmd: &str,
    args: Vec<&str>,
) -> Result<(), String> {
    // Build the command string
    let mut command_parts = vec![cmd];
    command_parts.extend(args);
    let command_str = command_parts.join(" ");
    
    // Try different terminal emulators in order of preference
    let terminals = [
        ("kitty", vec!["-e", "bash", "-c"]),
        ("alacritty", vec!["-e", "bash", "-c"]),
        ("wezterm", vec!["start", "--", "bash", "-c"]),
        ("gnome-terminal", vec!["--", "bash", "-c"]),
        ("konsole", vec!["-e", "bash", "-c"]),
        ("xterm", vec!["-e", "bash", "-c"]),
    ];
    
    for (terminal, terminal_args) in &terminals {
        // Check if this terminal is available
        if Command::new("which")
            .arg(terminal)
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
        {
            // Emit progress update
            let progress_operation = PackageOperation {
                operation: operation.clone(),
                package_name: package_name.clone(),
                progress: 50,
                status: format!("Running {} in terminal...", operation),
                output: vec![format!("Opening {} terminal for interactive command...", terminal)],
                running: true,
            };
            
            if let Err(e) = app_handle.emit("package-progress", &progress_operation) {
                eprintln!("Failed to emit package progress: {}", e);
            }
            
            // Build the full command with a wrapper that keeps the terminal open
            let wrapped_command = format!(
                "echo 'Running: {}'; {}; echo ''; echo 'Command finished. Press Enter to close this terminal...'; read",
                command_str, command_str
            );
            
            // Run the command in the terminal
            let mut terminal_cmd = Command::new(terminal);
            terminal_cmd.args(terminal_args);
            terminal_cmd.arg(&wrapped_command);
            
            let child_result = terminal_cmd.spawn();
            
            match child_result {
                Ok(mut child) => {
                    // Wait for the terminal process to complete
                    match child.wait() {
                        Ok(status) => {
                            // Emit final progress
                            let final_operation = PackageOperation {
                                operation: operation.clone(),
                                package_name: package_name.clone(),
                                progress: 100,
                                status: if status.success() {
                                    format!("{} completed", operation)
                                } else {
                                    format!("{} may have failed - check terminal output", operation)
                                },
                                output: vec![format!("Terminal command completed with exit code: {:?}", status.code())],
                                running: false,
                            };
                            
                            if let Err(e) = app_handle.emit("package-progress", &final_operation) {
                                eprintln!("Failed to emit package progress: {}", e);
                            }
                            
                            return Ok(());
                        }
                        Err(e) => {
                            return Err(format!("Failed to wait for terminal process: {}", e));
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to start {} terminal: {}", terminal, e);
                    continue; // Try next terminal
                }
            }
        }
    }
    
    // No suitable terminal found, emit error
    let error_operation = PackageOperation {
        operation: operation.clone(),
        package_name: package_name.clone(),
        progress: 0,
        status: format!("Failed to find suitable terminal for {}", operation),
        output: vec!["No compatible terminal emulator found. Please install one of: kitty, alacritty, wezterm, gnome-terminal, konsole, or xterm".to_string()],
        running: false,
    };
    
    if let Err(e) = app_handle.emit("package-progress", &error_operation) {
        eprintln!("Failed to emit package progress: {}", e);
    }
    
    Err("No suitable terminal emulator found".to_string())
}

// Package management commands
#[tauri::command]
async fn detect_aur_helper() -> Result<String, String> {
    // Check for available AUR helpers in order of preference
    let helpers = ["yay", "paru"];
    
    for helper in &helpers {
        if Command::new("which")
            .arg(helper)
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
        {
            return Ok(helper.to_string());
        }
    }
    
    // Fallback to pacman
    Ok("pacman".to_string())
}

#[tauri::command]
async fn get_installed_packages() -> Result<Vec<PackageInfo>, String> {
    let output = Command::new("pacman")
        .args(["-Qi"])
        .output()
        .map_err(|e| format!("Failed to run pacman: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get installed packages".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut packages = Vec::new();
    let mut current_package: Option<PackageInfo> = None;

    for line in stdout.lines() {
        if line.starts_with("Name            : ") {
            if let Some(pkg) = current_package.take() {
                packages.push(pkg);
            }
            current_package = Some(PackageInfo {
                name: line.replace("Name            : ", "").trim().to_string(),
                version: String::new(),
                description: String::new(),
                installed: true,
                size: None,
                repo: None,
                updatable: None,
                new_version: None,
            });
        } else if line.starts_with("Version         : ") {
            if let Some(ref mut pkg) = current_package {
                pkg.version = line.replace("Version         : ", "").trim().to_string();
            }
        } else if line.starts_with("Description     : ") {
            if let Some(ref mut pkg) = current_package {
                pkg.description = line.replace("Description     : ", "").trim().to_string();
            }
        } else if line.starts_with("Installed Size  : ") {
            if let Some(ref mut pkg) = current_package {
                pkg.size = Some(line.replace("Installed Size  : ", "").trim().to_string());
            }
        } else if line.starts_with("Repository      : ") {
            if let Some(ref mut pkg) = current_package {
                pkg.repo = Some(line.replace("Repository      : ", "").trim().to_string());
            }
        }
    }

    if let Some(pkg) = current_package {
        packages.push(pkg);
    }

    Ok(packages)
}

#[tauri::command]
async fn search_packages(query: String, helper: String) -> Result<Vec<PackageInfo>, String> {
    let (cmd, args) = match helper.as_str() {
        "yay" => ("yay", vec!["-Ss", &query]),
        "paru" => ("paru", vec!["-Ss", &query]),
        _ => ("pacman", vec!["-Ss", &query]),
    };

    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run {}: {}", cmd, e))?;

    if !output.status.success() {
        return Err(format!("Failed to search packages with {}", cmd));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut packages = Vec::new();
    let lines: Vec<&str> = stdout.lines().collect();
    
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        if line.contains('/') && !line.trim().is_empty() {
            // Parse package line: "repo/package-name version [status]"
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let name_parts: Vec<&str> = parts[0].split('/').collect();
                if name_parts.len() == 2 {
                    let repo = name_parts[0].to_string();
                    let name = name_parts[1].to_string();
                    let version = parts[1].to_string();
                    let installed = line.contains("[installed]");
                    
                    // Description is usually on the next line
                    let description = if i + 1 < lines.len() {
                        lines[i + 1].trim().to_string()
                    } else {
                        String::new()
                    };

                    packages.push(PackageInfo {
                        name,
                        version,
                        description,
                        installed,
                        size: None,
                        repo: Some(repo),
                        updatable: None,
                        new_version: None,
                    });
                    
                    i += 2; // Skip description line
                    continue;
                }
            }
        }
        i += 1;
    }

    Ok(packages)
}

#[tauri::command]
async fn get_package_updates(helper: String) -> Result<Vec<PackageInfo>, String> {
    let (cmd, args) = match helper.as_str() {
        "yay" => ("yay", vec!["-Qu"]),
        "paru" => ("paru", vec!["-Qu"]),
        _ => ("pacman", vec!["-Qu"]),
    };

    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run {}: {}", cmd, e))?;

    // pacman -Qu returns non-zero exit code if no updates, which is normal
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut packages = Vec::new();

    for line in stdout.lines() {
        if !line.trim().is_empty() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                // Format: package current_version -> new_version
                let name = parts[0].to_string();
                let current_version = parts[1].to_string();
                let new_version = parts[3].to_string();

                packages.push(PackageInfo {
                    name,
                    version: current_version,
                    description: String::new(), // Could be enhanced with package descriptions
                    installed: true,
                    size: None,
                    repo: None,
                    updatable: Some(true),
                    new_version: Some(new_version),
                });
            }
        }
    }

    Ok(packages)
}

async fn run_package_command_with_progress(
    app_handle: tauri::AppHandle,
    operation: String,
    package_name: Option<String>,
    cmd: &str,
    args: Vec<&str>,
) -> Result<(), String> {
    use std::process::Stdio;
    use std::io::{BufRead, BufReader};

    // Emit initial progress
    let initial_operation = PackageOperation {
        operation: operation.clone(),
        package_name: package_name.clone(),
        progress: 0,
        status: format!("Starting {}...", operation),
        output: vec![],
        running: true,
    };
    
    if let Err(e) = app_handle.emit("package-progress", &initial_operation) {
        eprintln!("Failed to emit package progress: {}", e);
    }

    // For AUR helpers (yay/paru), run in a terminal window for interactive access
    if cmd == "yay" || cmd == "paru" {
        return run_command_in_terminal(app_handle, operation, package_name, cmd, args).await;
    }

    let mut child = Command::new(cmd)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start {}: {}", cmd, e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    
    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);
    
    let mut output_lines = Vec::new();
    let mut progress = 10;

    // Read stdout
    for line in stdout_reader.lines() {
        if let Ok(line) = line {
            output_lines.push(line.clone());
            progress = std::cmp::min(progress + 5, 90);
            
            let operation_update = PackageOperation {
                operation: operation.clone(),
                package_name: package_name.clone(),
                progress,
                status: format!("Processing {}...", operation),
                output: output_lines.clone(),
                running: true,
            };
            
            if let Err(e) = app_handle.emit("package-progress", &operation_update) {
                eprintln!("Failed to emit package progress: {}", e);
            }
        }
    }

    // Read stderr
    for line in stderr_reader.lines() {
        if let Ok(line) = line {
            output_lines.push(format!("ERROR: {}", line));
        }
    }

    let status = child.wait().map_err(|e| format!("Failed to wait for process: {}", e))?;

    // Emit final progress
    let final_operation = PackageOperation {
        operation: operation.clone(),
        package_name: package_name.clone(),
        progress: 100,
        status: if status.success() {
            format!("{} completed successfully", operation)
        } else {
            format!("{} failed", operation)
        },
        output: output_lines,
        running: false,
    };
    
    if let Err(e) = app_handle.emit("package-progress", &final_operation) {
        eprintln!("Failed to emit package progress: {}", e);
    }

    if !status.success() {
        return Err(format!("{} failed with exit code: {:?}", operation, status.code()));
    }

    Ok(())
}

#[tauri::command]
async fn install_package(
    app_handle: tauri::AppHandle,
    package_name: String,
    helper: String,
) -> Result<(), String> {
    let privilege_cmd = get_privilege_command().await;
    let (cmd, args) = match helper.as_str() {
        "yay" => ("yay", vec!["-S", "--noconfirm", &package_name]),
        "paru" => ("paru", vec!["-S", "--noconfirm", &package_name]),
        _ => (privilege_cmd.as_str(), vec!["pacman", "-S", "--noconfirm", &package_name]),
    };

    run_package_command_with_progress(
        app_handle,
        "install".to_string(),
        Some(package_name.clone()),
        cmd,
        args,
    ).await
}

#[tauri::command]
async fn remove_package(
    app_handle: tauri::AppHandle,
    package_name: String,
) -> Result<(), String> {
    let privilege_cmd = get_privilege_command().await;
    run_package_command_with_progress(
        app_handle,
        "remove".to_string(),
        Some(package_name.clone()),
        &privilege_cmd,
        vec!["pacman", "-R", "--noconfirm", &package_name],
    ).await
}

#[tauri::command]
async fn update_package(
    app_handle: tauri::AppHandle,
    package_name: String,
    helper: String,
) -> Result<(), String> {
    let privilege_cmd = get_privilege_command().await;
    let (cmd, args) = match helper.as_str() {
        "yay" => ("yay", vec!["-S", "--noconfirm", &package_name]),
        "paru" => ("paru", vec!["-S", "--noconfirm", &package_name]),
        _ => (privilege_cmd.as_str(), vec!["pacman", "-S", "--noconfirm", &package_name]),
    };

    run_package_command_with_progress(
        app_handle,
        "update".to_string(),
        Some(package_name.clone()),
        cmd,
        args,
    ).await
}

#[tauri::command]
async fn system_update(
    app_handle: tauri::AppHandle,
    helper: String,
) -> Result<(), String> {
    let privilege_cmd = get_privilege_command().await;
    let (cmd, args) = match helper.as_str() {
        "yay" => ("yay", vec!["-Syu", "--noconfirm"]),
        "paru" => ("paru", vec!["-Syu", "--noconfirm"]),
        _ => (privilege_cmd.as_str(), vec!["pacman", "-Syu", "--noconfirm"]),
    };

    run_package_command_with_progress(
        app_handle,
        "system update".to_string(),
        None,
        cmd,
        args,
    ).await
}

#[tauri::command]
async fn refresh_wifi_networks() -> Result<String, String> {
    // Use pkexec for WiFi rescan to handle authentication properly
    let privilege_cmd = get_privilege_command().await;
    
    let output = Command::new(&privilege_cmd)
        .args(["nmcli", "device", "wifi", "rescan"])
        .output()
        .map_err(|e| format!("Failed to rescan WiFi networks: {}", e))?;
    
    if output.status.success() {
        Ok("WiFi networks refreshed".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to refresh WiFi networks: {}", stderr))
    }
}
