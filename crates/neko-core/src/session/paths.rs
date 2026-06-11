use std::path::PathBuf;

fn xdg_config() -> PathBuf {
    std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs::home_dir().unwrap_or_default().join(".config"))
}

fn xdg_data() -> PathBuf {
    std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs::home_dir().unwrap_or_default().join(".local").join("share"))
}

fn xdg_cache() -> PathBuf {
    std::env::var("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs::home_dir().unwrap_or_default().join(".cache"))
}

fn xdg_state() -> PathBuf {
    std::env::var("XDG_STATE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| dirs::home_dir().unwrap_or_default().join(".local").join("state"))
}

const APP: &str = "neko";

/// ~/.config/neko/settings.jsonc
pub fn config_path() -> PathBuf {
    std::env::var("NEKO_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|_| xdg_config().join(APP).join("settings.jsonc"))
}

/// ~/.config/neko/
pub fn config_dir() -> PathBuf {
    config_path().parent().unwrap().to_path_buf()
}

/// ~/.local/share/neko/sessions/
pub fn sessions_dir() -> PathBuf {
    xdg_data().join(APP).join("sessions")
}

/// ~/.cache/neko/
pub fn cache_dir() -> PathBuf {
    xdg_cache().join(APP)
}

/// ~/.local/state/neko/
pub fn state_dir() -> PathBuf {
    xdg_state().join(APP)
}

/// ~/.local/state/neko/neko.log
pub fn log_path() -> PathBuf {
    state_dir().join("neko.log")
}

/// ~/.local/state/neko/history
pub fn history_path() -> PathBuf {
    state_dir().join("history")
}

/// ~/.local/share/neko/skills/
pub fn skills_dir() -> PathBuf {
    xdg_data().join(APP).join("skills")
}
