import { getVercelOidcToken, getVercelOidcTokenSync } from "@vercel/oidc";

export function aiConfigured() {
  if (process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY) return true;
  try {
    return Boolean(getVercelOidcTokenSync());
  } catch {
    return false;
  }
}

export async function aiConnection() {
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
