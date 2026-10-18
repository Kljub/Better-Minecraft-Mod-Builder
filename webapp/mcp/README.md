# MC Screen Designer — MCP server

Lets an AI client (Claude Code, Claude Desktop, Cursor, …) work in the designer that's open in
your browser: build entity models, pack UVs and paint skins, animate, set mob stats, create other
elements (enchantments, damage types, …) and look at screenshots of its own work. Uses your AI
client's own login — no API key in the webapp.

```
AI client ──stdio (MCP)──▶ mcp/server.mjs ──HTTP 127.0.0.1:8790──▶ editor tab in the browser
```

## Setup

1. Claude Code (from the repo's `webapp/` folder):

   ```bash
   claude mcp add mc-designer -- node "$(pwd)/mcp/server.mjs"
   ```

   Other clients: add a stdio server with command `node` and argument `/absolute/path/to/webapp/mcp/server.mjs`.

2. Open a project in the designer and click **AI bridge** in the status bar (bottom right).
   The dot turns green once the MCP server is running (your AI client starts it).

3. Ask, e.g.: *"Build a stone golem mob with a humanoid rig, paint it grey with moss, give it a
   walk and an attack animation, make it hostile with 40 health."*

Every tool call is one undoable step in the editor (Ctrl+Z).

## Tools

`get_guide`, `get_status`, `list_elements`, `list_element_kinds`, `create_element`,
`update_element`, `open_element`, `create_model` (empty / humanoid / quadruped template),
`get_model`, `add_bones`, `add_cubes`, `edit_element`, `move_bone`, `delete_elements`,
`mirror_element`, `pack_uv`, `paint_cubes`, `paint_texture`, `paint_face`, `create_animation`,
`add_keyframes`, `generate_animation` (walk / idle / attack / fly), `set_entity_settings`,
`set_view`, `screenshot`, `export_model`.

## Notes

- Port: `MC_DESIGNER_MCP_PORT` (default 8790). The bridge only listens on 127.0.0.1 and only
  answers browser pages served from localhost / private LAN addresses.
- The editor tab must stay open; commands time out after 60 s.
