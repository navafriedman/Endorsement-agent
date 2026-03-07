# Session Context: Figma Design Redesign

## Task
Redesign the ballot-page-prototype app using the design system from the Figma file:
- **Figma URL**: https://www.figma.com/design/GV4AzbAJA2b9fEGVdvkiSX/Elections---Voter-Guide-Recommendations?node-id=1180-635&p=f&m=dev
- **File**: "Elections - Voter Guide Recommendations"
- **Node**: 1180-635

## Branch
`claude/identity-focused-ballot-page-ifBFz`

## Status
- Explored full codebase structure
- Attempted Figma MCP access — blocked by egress proxy (`mcp.figma.com` not in allowlist)
- `*.modelcontextprotocol.io` is allowed but Figma MCP lives on `mcp.figma.com`
- **Next step**: User will provide a screenshot of the Figma design, then implement the redesign

## Key Files to Modify
- `ballot-page-prototype/src/main.ts` — Event delegation + render loop
- `ballot-page-prototype/src/state.ts` — State management
- `ballot-page-prototype/src/render.ts` — UI rendering functions
- `ballot-page-prototype/src/data.ts` — Static data (issues, identity groups, candidates)
- `ballot-page-prototype/src/types.ts` — TypeScript interfaces

## Build
- TypeScript + Vite, bundled as single HTML file via vite-plugin-singlefile
- Built output: `ballot-page-prototype/dist/index.html`
- Also served from: `questionnaire-editor-ts/public/ballot/index.html`

## Fixing Figma MCP for Future Sessions
Add `mcp.figma.com` to the egress proxy allowlist in your Claude Code organization/deployment settings.
