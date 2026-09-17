import { getVercelOidcToken, getVercelOidcTokenSync } from "@vercel/oidc";
import { localMode } from "./automation";

export function aiConfigured() {
  if (localMode()) return true;
  if (process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY) return true;
  try {
    return Boolean(getVercelOidcTokenSync());
  } catch {
    return false;
  }
}

export async function aiConnection() {
  if (localMode()) throw new Error("Cloud AI is disabled in local mode.");
  const requestedModel = process.env.OPENAI_MODEL || "gpt-5-mini";
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: requestedModel.replace(/^openai\//, ""),
      baseURL: "https://api.openai.com/v1",
    };
  }
  const apiKey = process.env.AI_GATEWAY_API_KEY || (await getVercelOidcToken());
  return {
    apiKey,
    model: requestedModel.includes("/")
      ? requestedModel
      : `openai/${requestedModel}`,
    baseURL: "https://ai-gateway.vercel.sh/v1",
  };
}
