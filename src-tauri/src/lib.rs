// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;
use std::path::PathBuf;
use std::process::Command;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::collections::HashMap;

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
    .invoke_handler(tauri::generate_handler![greet, get_monitors, save_monitor_config])


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