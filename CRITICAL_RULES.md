# Critical Rules

These rules are mandatory for all changes in this project.

## General

### Architecture
- Preserve existing structure. Do not introduce new systems when an existing plugin, route, or component can be extended.
- Backend stays plugin-based.
- Frontend stays page- and component-based in the existing style.
- Strictly separate internal tools from user MCPs.

### State and Persistence
- Integrate runtime data only into the existing `state/*.json` files.
- Do not introduce new persistence mechanisms when existing stores can be extended.
- Always consider backward compatibility for new defaults. Missing fields must have sensible fallbacks.

### Prompt and Runtime Consistency
- Everything sent to the LLM must go through the central prompt builder.
- Do not duplicate important prompt rules that already exist centrally in the builder or defaults.
- Keep prompt structure consistent with XML tags.
- New prompt-relevant defaults must be defined in code defaults compatible with `state/defaults.json`.
- New prompt-relevant defaults must be editable in the frontend under **Settings > Defaults**.

### System Variables
- Every new prompt variable must be correctly wired in all three places:
  - Backend: Register the variable so it is visible as a system variable.
  - Backend: Actually populate the variable at runtime.
  - Frontend: Make the variable visible in the agent system variables via the existing API.
- Do not use placeholders in the prompt that are not registered and populated.

## Backend

### Plugins
- Fit new backend functionality into existing plugins first.
- Only create a new plugin when the responsibility is clearly separated and permanently independent.
- Keep plugin boundaries clean:
  - `agent`: Agent definitions and agent-related configuration
  - `loop`: Execution flow, iterations, retry and verify logic
  - `systemprompt`: Build the final LLM prompt
  - `tools`: Internal system tools and tool execution
  - `mcp`: External / user-configured MCPs only
  - `session`: Chat and session lifecycle

### Loop and Agent Behavior
- Loop behavior must remain configurable per agent.
- Do not introduce hardwired behavior that forces all agents to behave the same.
- New loop phases or modes must appear consistently in the agent model, defaults, and frontend editor.
- An agent with a `simple` loop must work without forced plan/verify steps.

### Tools
- Register internal tools in the `tools` plugin, not in the user MCP area.
- Truncate tool results for model context when they are large.
- Only keep full tool output where it is genuinely needed for UI or debug.

## Frontend

### UI Structure
- Reuse existing pages, layouts, and styled patterns.
- Do not introduce new UI concepts when existing cards, form fields, tabs, or panels can be extended.
- Keep debug content in the debug area. Keep the chat itself as clean as possible.

### Settings and Defaults
- In **Settings > Defaults**, only show texts and values that genuinely affect the final LLM prompt or LLM behavior.
- Do not put pure UI texts or internal helper texts into the defaults UI.
- When new prompt-relevant defaults are added in the backend, they must become editable in the frontend.

### Agent Editor
- Everything an agent can override on the prompt or loop side must be visible and editable in the Agent editor.
- Default vs. agent override behavior must stay clear. An override replaces the default only for that specific agent.

## Maintenance Obligation
- With every prompt-relevant change, always verify:
  - Builder
  - Code defaults
  - Frontend defaults
  - Agent editor
  - System variables
  - Documentation in `AGENTS.md` if actual project behavior changes
