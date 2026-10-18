import { cliVersion, guardRequest, ollamaModels } from "../cli";

export async function GET(request: Request) {
  const refused = guardRequest(request);
  if (refused) return refused;
  const [claude, codex, ollama, models] = await Promise.all([
    cliVersion("claude"), cliVersion("codex"), cliVersion("ollama"), ollamaModels(),
  ]);
  return Response.json({
    claude: { available: claude !== null, version: claude ?? undefined },
    codex: { available: codex !== null, version: codex ?? undefined },
    ollama: { available: ollama !== null, version: ollama ?? undefined, models: models ?? [] },
  });
}
