---
name: Create Skill
description: Create or rewrite a reusable KK-Agent skill bundle in state/skills.
  Use when the user wants a local skill that should follow the KK-Agent SKILL.md
  format and trigger reliably for a specific workflow.
---

Treat KK-Agent skills as reusable instruction bundles for the agent. Do not model timers, schedules, background jobs, providers, or MCP/tool definitions as skills.
If `create-skill` is available in <skills_catalog> and the user wants a skill created or rewritten, load `create-skill` with Skill before you ask follow-up questions, draft content, or call CreateSkill.
When you create or rewrite a skill through the agent workflow, always use CreateSkill. Do not manually write SKILL.md or kk-agent.skill.json unless the user explicitly asks for direct file editing.
Focus on the content fields only: name, description, instruction, and optional metadata. Let CreateSkill handle skill id generation, YAML frontmatter serialization, and kk-agent.skill.json writing.
The resulting bundle must contain exactly one SKILL.md in the bundle root. It must start with YAML frontmatter. Do not put a markdown heading or any other text before the opening ---.
Frontmatter must contain a non-empty name and description. Write the description as a trigger-oriented sentence that states what the skill does and when it should be used.
Use this SKILL.md frontmatter pattern exactly:
```md
---
name: Repo Analysis
description: Analyze a repository before editing and surface the files, risks, and likely change points. Use when the user wants implementation planning or codebase orientation.
---
```
Do not encode trigger lists as `Trigger:` mini-syntax inside description. Prefer one natural sentence such as `Use when the user wants repository analysis, code review, or codebase orientation.`
Write the instruction body as lean markdown with short imperative lines or compact sections. Capture the workflow, key decisions, constraints, and expected output shape.
A valid compact body can look like this:
```md
Read the relevant files before proposing changes.
List the main modules involved and the likely edit points.
Call out risks, missing context, and required verification.
Keep the final summary short and file-oriented.
```
Omit filler, generic AI advice, and duplicate explanation. Keep only information that is specific and reusable for this workflow.
Create kk-agent.skill.json only for KK-Agent metadata. Default active to true and allowedModeBehaviors to plan and edit. Add autonomous only when the user explicitly wants autonomous usage.
Use this kk-agent.skill.json pattern when metadata is needed:
```json
{
  "active": true,
  "recommendedToolIds": ["skill", "user-interaction"],
  "recommendedMcpIds": [],
  "allowedModeBehaviors": ["plan", "edit"]
}
```
Add recommendedToolIds and recommendedMcpIds only when they materially help the workflow and you know the correct ids.
Keep the bundle minimal. Do not add extra files unless the workflow genuinely needs bundled references or assets.
Use ask_user for targeted follow-up questions when examples, policy choices, or missing constraints are needed to make the skill correct. When helpful, ask as multiple choice so the user can answer quickly.
Before calling CreateSkill, make sure the content can be written directly as a valid KK-Agent bundle and would pass the loader.
If the user wants to use the skill immediately after creation, call Skill with the created id.
