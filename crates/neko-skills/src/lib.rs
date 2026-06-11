pub mod loader;
pub mod registry;

pub use loader::{load_builtin_skills, load_skills_from_dir};
pub use registry::SkillsManager;

pub use neko_core::skills::{Skill, SkillRegistry, SkillSource};
