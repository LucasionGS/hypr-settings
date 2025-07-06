// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;
use std::process::Command;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

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
        Ok(())
    })
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())

    // Invokeable commands
    .invoke_handler(tauri::generate_handler![greet, get_monitors, save_monitor_config, get_wifi_status, get_wifi_networks, connect_wifi, disconnect_wifi, forget_wifi, toggle_wifi])


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
    // First rescan for networks
    let _ = Command::new("nmcli")
        .args(["device", "wifi", "rescan"])
        .output();
    
    // Get available networks
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