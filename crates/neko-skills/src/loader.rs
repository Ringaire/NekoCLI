use neko_core::skills::{Skill, SkillRegistry, SkillSource};
use serde::{Deserialize, Serialize};
use tracing::warn;

#[derive(Debug, Deserialize, Serialize)]
pub struct SkillFile {
    pub name:        String,
    pub description: String,
    pub prompt:      String,
    #[serde(default)]
    pub tools:       Vec<String>,
}

pub fn load_builtin_skills(registry: &mut SkillRegistry) {
    let builtins = vec![
        Skill {
            name: "compact".into(),
            description: "Summarize the conversation and replace with a compact context".into(),
            prompt: "Please summarize the current conversation context in a concise format, \
                     preserving key decisions, code changes, and important context. \
                     Then replace the conversation with this summary.".into(),
            tools: vec!["bash".into(), "read_file".into()],
            source: SkillSource::Builtin,
        },
        Skill {
            name: "review".into(),
            description: "Review recent code changes and provide feedback".into(),
            prompt: "Review the recent changes in this session. Identify potential issues, \
                     improvements, and confirm the changes align with best practices.".into(),
            tools: vec!["bash".into(), "read_file".into(), "grep".into()],
            source: SkillSource::Builtin,
        },
        Skill {
            name: "commit".into(),
            description: "Stage and commit changes with an auto-generated message".into(),
            prompt: "Review the current git diff, generate an appropriate commit message following \
                     conventional commits format, and create the commit.".into(),
            tools: vec!["bash".into()],
            source: SkillSource::Builtin,
        },
    ];

    for skill in builtins {
        registry.register(skill);
    }
}

pub async fn load_skills_from_dir(registry: &mut SkillRegistry, dir: &std::path::Path) {
    let mut rd = match tokio::fs::read_dir(dir).await {
        Ok(r) => r,
        Err(_) => return,
    };

    while let Ok(Some(entry)) = rd.next_entry().await {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") { continue; }
        match tokio::fs::read_to_string(&path).await {
            Ok(raw) => match serde_json::from_str::<SkillFile>(&raw) {
                Ok(sf) => {
                    registry.register(Skill {
                        name:        sf.name,
                        description: sf.description,
                        prompt:      sf.prompt,
                        tools:       sf.tools,
                        source:      SkillSource::Plugin,
                    });
                }
                Err(e) => warn!(file = %path.display(), err = %e, "failed to parse skill file"),
            },
            Err(e) => warn!(file = %path.display(), err = %e, "failed to read skill file"),
        }
    }
}
