import { discoverModels } from "./connectors";
import { putConnection } from "./security";
import { audit } from "./db";
export function localModelEnabled() {
  return (
    process.env.PUBLIC_DEPLOYMENT !== "1" &&
    process.env.LOCAL_MODEL_DISCOVERY === "1" &&
    process.env.AI_COMPATIBLE_BASE_URL === "http://127.0.0.1:11434/v1"
  );
}
export async function attachLocalModel(uid: string) {
  if (!localModelEnabled()) return;
  try {
    // The loopback-only Ollama API requires no credential. The SDK requires a nonempty field.
    const token = "local-ollama";
    const models = await discoverModels("compatible", token);
    const model = process.env.LOCAL_MODEL_ID
      ? models.find((m) => m === process.env.LOCAL_MODEL_ID)
      : models[0];
    if (!model) return;
    await putConnection(
      uid,
      "model",
      { provider: "compatible", model, apiKey: token },
      "Ollama · " + model,
    );
    await audit(uid, "Local model connected", "model", model);
  } catch {
    await audit(
      uid,
      "Local model unavailable",
      "warning",
      "Check the Ollama service.",
    );
  }
}
