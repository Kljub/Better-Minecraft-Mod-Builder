/**
 * Ports the bridge proxy (app/api/ai/bridge) may forward to: the interactive MCP server's port and
 * the ports of running generator agents. Kept on globalThis because route modules don't share
 * module state reliably in dev.
 */
const g = globalThis as { __mcBridgePorts?: Set<number> };
const agentPorts = (g.__mcBridgePorts ??= new Set<number>());

export const DEFAULT_BRIDGE_PORT = 8790;

export function registerAgentPort(port: number) { agentPorts.add(port); }
export function unregisterAgentPort(port: number) { agentPorts.delete(port); }
export function isBridgePort(port: number): boolean { return port === DEFAULT_BRIDGE_PORT || agentPorts.has(port); }
