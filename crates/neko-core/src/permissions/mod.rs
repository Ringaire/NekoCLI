use serde::{Deserialize, Serialize};

// ── 类型 ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModeName {
    #[default]
    Build,
    Edit,
    Ask,
}

impl std::str::FromStr for ModeName {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "build" => Ok(Self::Build),
            "edit"  => Ok(Self::Edit),
            "ask"   => Ok(Self::Ask),
            other   => Err(format!("unknown mode: {other}")),
        }
    }
}


impl std::fmt::Display for ModeName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Build => write!(f, "build"),
            Self::Edit  => write!(f, "edit"),
            Self::Ask   => write!(f, "ask"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PermissionAction {
    Allow,
    Ask,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRule {
    pub tool: String,
    pub path: Option<String>,
    pub action: PermissionAction,
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AccessCheck<'a> {
    pub tool: &'a str,
    pub path: Option<&'a str>,
    pub description: &'a str,
    pub preview: Option<&'a str>,
}

// ── Glob 匹配 ─────────────────────────────────────────────────────────────────

fn glob_match(pattern: &str, value: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if let Some(prefix) = pattern.strip_suffix('*') {
        return value.starts_with(prefix);
    }
    if let Some(suffix) = pattern.strip_prefix('*') {
        return value.ends_with(suffix);
    }
    pattern == value
}

fn rule_matches(rule: &PermissionRule, req: &AccessCheck<'_>) -> bool {
    if !glob_match(&rule.tool, req.tool) {
        return false;
    }
    if let (Some(rule_path), Some(req_path)) = (&rule.path, req.path) {
        if !glob_match(rule_path, req_path) {
            return false;
        }
    }
    true
}

// ── 模式默认规则 ──────────────────────────────────────────────────────────────

fn build_rules() -> Vec<PermissionRule> {
    vec![
        PermissionRule { tool: "bash".into(),       path: None, action: PermissionAction::Ask,   reason: Some("shell execution".into()) },
        PermissionRule { tool: "write_file".into(),  path: None, action: PermissionAction::Ask,   reason: Some("file write".into()) },
        PermissionRule { tool: "edit_file".into(),   path: None, action: PermissionAction::Ask,   reason: Some("file edit".into()) },
        PermissionRule { tool: "*".into(),            path: None, action: PermissionAction::Allow, reason: None },
    ]
}

fn edit_rules() -> Vec<PermissionRule> {
    vec![
        PermissionRule { tool: "bash".into(),       path: None, action: PermissionAction::Deny,  reason: Some("shell disabled in edit mode".into()) },
        PermissionRule { tool: "write_file".into(),  path: None, action: PermissionAction::Ask,   reason: Some("file write".into()) },
        PermissionRule { tool: "edit_file".into(),   path: None, action: PermissionAction::Ask,   reason: Some("file edit".into()) },
        PermissionRule { tool: "*".into(),            path: None, action: PermissionAction::Allow, reason: None },
    ]
}

fn ask_rules() -> Vec<PermissionRule> {
    let allow = |tool: &str| PermissionRule { tool: tool.into(), path: None, action: PermissionAction::Allow, reason: None };
    vec![
        PermissionRule { tool: "bash".into(),       path: None, action: PermissionAction::Deny, reason: Some("read-only mode".into()) },
        PermissionRule { tool: "write_file".into(),  path: None, action: PermissionAction::Deny, reason: Some("read-only mode".into()) },
        PermissionRule { tool: "edit_file".into(),   path: None, action: PermissionAction::Deny, reason: Some("read-only mode".into()) },
        allow("lsp_diagnostics"),
        allow("lsp_refs"),
        allow("read_file"),
        allow("glob"),
        allow("grep"),
        allow("web_fetch"),
        allow("web_search"),
        allow("token_count"),
        allow("todo"),
        PermissionRule { tool: "*".into(), path: None, action: PermissionAction::Deny, reason: Some("read-only mode".into()) },
    ]
}

// ── 权限引擎 ──────────────────────────────────────────────────────────────────

pub struct DefaultPermissionEngine {
    mode:     ModeName,
    custom:   Vec<PermissionRule>,
    skip_all: bool,
}

impl DefaultPermissionEngine {
    pub fn new(mode: ModeName) -> Self {
        Self { mode, custom: Vec::new(), skip_all: false }
    }

    pub fn mode(&self) -> ModeName {
        self.mode
    }

    pub fn is_permissions_skipped(&self) -> bool {
        self.skip_all
    }

    pub fn set_mode(&mut self, mode: ModeName) {
        self.mode = mode;
    }

    pub fn dangerously_skip_permissions(&mut self) {
        self.skip_all = true;
    }

    pub fn allow(&mut self, tool: impl Into<String>, path: Option<String>) {
        let tool = tool.into();
        self.remove_existing(&tool, path.as_deref());
        self.custom.insert(0, PermissionRule { tool, path, action: PermissionAction::Allow, reason: None });
    }

    pub fn deny(&mut self, tool: impl Into<String>, path: Option<String>) {
        let tool = tool.into();
        self.remove_existing(&tool, path.as_deref());
        self.custom.insert(0, PermissionRule { tool, path, action: PermissionAction::Deny, reason: None });
    }

    pub fn evaluate(&self, req: &AccessCheck<'_>) -> PermissionAction {
        if self.skip_all {
            return PermissionAction::Allow;
        }
        for rule in &self.custom {
            if rule_matches(rule, req) {
                return rule.action;
            }
        }
        let mode_rules = match self.mode {
            ModeName::Build => build_rules(),
            ModeName::Edit  => edit_rules(),
            ModeName::Ask   => ask_rules(),
        };
        for rule in &mode_rules {
            if rule_matches(rule, req) {
                return rule.action;
            }
        }
        PermissionAction::Ask
    }

    pub fn custom_rules(&self) -> &[PermissionRule] {
        &self.custom
    }

    fn remove_existing(&mut self, tool: &str, path: Option<&str>) {
        self.custom.retain(|r| !(r.tool == tool && r.path.as_deref() == path));
    }
}
