use std::collections::HashMap;

// ── Skill trait（定义在 core，实现在 neko-skills）────────────────────────────

#[derive(Debug, Clone)]
pub enum SkillSource {
    Builtin,
    Mcp,
    Plugin,
}

#[derive(Debug, Clone)]
pub struct Skill {
    pub name:        String,
    pub description: String,
    pub prompt:      String,
    pub tools:       Vec<String>,
    pub source:      SkillSource,
}

// ── SkillRegistry ─────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct SkillRegistry {
    skills: HashMap<String, Skill>,
}

impl SkillRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, skill: Skill) {
        self.skills.insert(skill.name.clone(), skill);
    }

    pub fn unregister(&mut self, name: &str) {
        self.skills.remove(name);
    }

    pub fn get(&self, name: &str) -> Option<&Skill> {
        self.skills.get(name)
    }

    pub fn list(&self) -> Vec<&Skill> {
        let mut v: Vec<&Skill> = self.skills.values().collect();
        v.sort_by(|a, b| a.name.cmp(&b.name));
        v
    }

    pub fn build_listing(&self) -> String {
        let mut out = String::from("## Available Skills\n");
        for s in self.list() {
            out.push_str(&format!("- /{}: {}\n", s.name, s.description));
        }
        out
    }

    pub fn build_prompt(&self, name: &str) -> Option<String> {
        self.skills.get(name).map(|s| {
            format!("## Skill: {}\n\n{}\n", s.name, s.prompt)
        })
    }
}
