// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Set the environment variable to disable DMABUF renderer for WebKit
    // This is needed for proper rendering in Hyprland and other compositors
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    
    hypr_settings_lib::run()
}
