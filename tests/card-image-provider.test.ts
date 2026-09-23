import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { cardBriefSchema, type CardRun, type StoryCard } from "../lib/card-workflow";
import { generateVisual, normalizeVisual, boundedBytes, prepareComfyGraph, comfyImageQuery, visualKey, ImageProviderError } from "../lib/card-image-provider";
import { ensureCardVisual } from "../lib/card-visual-checkpoint";
import { wantsCardVisual, persistedCardBrief, imageModeLabel } from "../lib/card-image-options";
import { renderCard } from "../lib/card-renderer";
import { cardRevisionSchema, prepareCardRevision } from "../lib/card-revision";
import { zImageTurboGraph } from "../lib/card-comfy-preset";

const card: StoryCard = { role: "개념", title: "자료를 모은 다음은?", copy: "읽을 사람과 전하고 싶은 내용을 먼저 골라 보세요.", condition: "자료에 있는 조건을 확인하세요.", composition: "종이와 메모를 정리하는 손을 중심으로 의미 있는 행동을 보여준다.", layout: "scene", items: [], evidence: "읽을 사람과 전할 내용을 먼저 정합니다." };
const brief = cardBriefSchema.parse({ imageProvider: "openai" });
const fixture = () => sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#385c70" } }).png().toBuffer();

test("old briefs stay free, completed identity is preserved, provider inputs cannot inject connections", () => {
  const old = cardBriefSchema.parse({});
  assert.equal(old.imageProvider, "editorial");
  assert.equal(wantsCardVisual(old, 0), false);
  assert.equal(wantsCardVisual(brief, 0), true);
  assert.equal(wantsCardVisual(brief, 1), false);
  assert.equal(wantsCardVisual({ ...brief, imageScope: "all" }, 7), true);
  assert.equal("imageProvider" in persistedCardBrief(old), false);
  assert.equal((persistedCardBrief(brief) as Partial<typeof brief>).imageProvider, "openai");
  assert.equal(cardBriefSchema.safeParse({ imageProvider: "https://evil.test" }).success, false);
  assert.equal(cardBriefSchema.safeParse({ imageProvider: "openai", apiKey: "secret" }).success, false);
  assert.equal(cardBriefSchema.safeParse({ imageQuality: "unlimited" }).success, false);
  assert.match(imageModeLabel(brief), /실제 사진/);
});

test("OpenAI only calls fixed API once after durable checkpoint; no original source or secrets in payload", async (t) => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-private-key";
  const states: any[] = [];
  const bytes = await fixture();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    calls++;
    assert.equal(states.at(-1).state, "requesting");
    assert.equal(String(url), "https://api.openai.com/v1/images/generations");
    assert.equal(init.redirect, "error");
    const request = JSON.parse(init.body);
    assert.equal(request.model, "gpt-image-2");
    assert.equal(request.n, 1);
    assert.equal(request.quality, "medium");
    assert.equal(request.size, "1024x1024");
    assert.ok(!init.body.includes("synthetic-private-key"));
    return Response.json({ data: [{ b64_json: bytes.toString("base64") }] });
  });
  try {
    const result = await generateVisual(card, brief, undefined, async (value) => { states.push(value); });
    assert.equal((await sharp(result).metadata()).format, "png");
    assert.equal(calls, 1);
    await assert.rejects(() => generateVisual(card, brief, states[0], async () => {}), (e: any) => e.code === "IMAGE_PROVIDER_UNCERTAIN");
    assert.equal(calls, 1);
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test("missing key, explicit quota and uncertain failures never fallback, retry or leak provider errors", async (t) => {
  const old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let calls = 0, status = 429;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (status === 0) throw new Error("private prompt and key must not escape");
    return Response.json({ error: "private prompt and key must not escape" }, { status });
  });
  const states: any[] = [];
  const save = async (value: any) => { states.push(value); };
  try {
    await assert.rejects(() => generateVisual(card, brief, undefined, save), (e: any) => e.code === "IMAGE_PROVIDER_CONFIG");
    assert.equal(calls, 0);
    process.env.OPENAI_API_KEY = "synthetic";
    await assert.rejects(() => generateVisual(card, brief, undefined, save), (e: any) => e.code === "IMAGE_PROVIDER_QUOTA" && !e.message.includes("private prompt"));
    assert.equal(states.at(-1), undefined);
    assert.equal(calls, 1);
    status = 0;
    await assert.rejects(() => generateVisual(card, brief, undefined, save), (e: any) => e.code === "IMAGE_PROVIDER_UNCERTAIN" && !e.message.includes("private prompt"));
    assert.equal(states.at(-1).state, "requesting");
    assert.equal(calls, 2);
    await assert.rejects(() => generateVisual(card, brief, states.at(-1), save));
    assert.equal(calls, 2);
  } finally { if (old === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old; }
});

test("Comfy graph uses text as data, constrains nodes, paths, image count, and dimensions", () => {
  const preset = prepareComfyGraph(zImageTurboGraph, "test illustration", 123);
  assert.equal(preset["4"].inputs.text, "test illustration");
  assert.equal(preset["8"].inputs.steps, 8);
  assert.equal(zImageTurboGraph["4"].inputs.text, "__ATLAS_PROMPT__");
  const graph = {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "__ATLAS_PROMPT__" } },
    "2": { class_type: "EmptySD3LatentImage", inputs: { width: 4096, height: 4096, batch_size: 100 } },
    "3": { class_type: "SaveImage", inputs: { filename_prefix: "../../secret" } },
    "4": { class_type: "KSampler", inputs: { seed: 3 } },
  };
  const injected = '"},"5":{"class_type":"ExecuteShell"}';
  const safe = prepareComfyGraph(graph, injected, 123);
  assert.equal(safe["1"].inputs.text, injected);
  assert.equal(Object.keys(safe).length, 4);
  assert.equal(safe["2"].inputs.batch_size, 1);
  assert.equal(safe["2"].inputs.width, 1024);
  assert.equal(safe["3"].inputs.filename_prefix, "ai-atlas");
  assert.equal(safe["4"].inputs.seed, 123);
  assert.throws(() => prepareComfyGraph({ ...graph, "5": { class_type: "OpenAIImage", inputs: {} } }, "x", 1));
  assert.throws(() => prepareComfyGraph({ ...graph, "5": { class_type: "UNETLoader", inputs: { unet_name: "../../private.safetensors" } } }, "x", 1));
  for (const filename of ["../../key.png", "C:\\secret.png", "https://evil.test/a.png"]) assert.throws(() => comfyImageQuery({ filename, type: "output", subfolder: "" }));
  assert.throws(() => comfyImageQuery({ filename: "safe.png", type: "input", subfolder: "" }));
  assert.match(comfyImageQuery({ filename: "ai-atlas_001.png", type: "output", subfolder: "" }), /^filename=ai-atlas_001.png/);
});

test("Comfy resumes existing queue ID without posting, with bounded loopback output reads", async (t) => {
  const local = { ...brief, imageProvider: "comfyui" as const };
  const bytes = await fixture();
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    assert.equal(init.redirect, "error");
    assert.equal(init.method, undefined);
    assert.equal(new URL(String(url)).hostname, "127.0.0.1");
    paths.push(new URL(String(url)).pathname);
    if (String(url).includes("/history/")) return Response.json({ "known-job": { outputs: { "9": { images: [{ filename: "safe.png", subfolder: "", type: "output" }] } } } });
    return new Response(new Uint8Array(bytes));
  });
  const image = await generateVisual(card, local, { key: visualKey(card, local), provider: "comfyui", state: "queued", jobId: "known-job" }, async () => { assert.fail("must reuse job"); });
  assert.equal((await sharp(image).metadata()).format, "png");
  assert.deepEqual(paths, ["/history/known-job", "/view"]);
});

test("image parsing refuses SVG, oversized streams, tiny or malformed outputs", async () => {
  await assert.rejects(() => normalizeVisual(Buffer.from('<svg width="1000" height="1000"/>')));
  await assert.rejects(() => normalizeVisual(Buffer.from("not an image")));
  await assert.rejects(() => boundedBytes(new Response("123456"), 5));
});

test("durable visual cache survives restart and never generates again after save or corruption", async () => {
  const files = new Map<string, Buffer>();
  let state: any, calls = 0;
  const args = { card, brief, index: 0, prefix: "owner/run", checkpoint: async (v: any) => { state = v; },
    storage: { write: async (p: string, b: Buffer) => { files.set(p, b); }, read: async (p: string) => files.get(p)! },
    generate: async () => { calls++; return fixture(); } };
  const first = await ensureCardVisual(args);
  assert.equal(state.state, "saved");
  assert.equal(state.sha256, createHash("sha256").update(first!).digest("hex"));
  const second = await ensureCardVisual({ ...args, previous: state });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  files.set(state.path, Buffer.from("corrupt"));
  await assert.rejects(() => ensureCardVisual({ ...args, previous: state }), ImageProviderError);
  await assert.rejects(() => ensureCardVisual({ ...args, previous: { ...state, path: "other-owner/run/visual-0.png" } }), ImageProviderError);
  assert.equal(calls, 1);
  assert.equal(await ensureCardVisual({ ...args, brief: cardBriefSchema.parse({}) }), undefined);
  assert.equal(calls, 1);
});

test("provider-only revision retains source text and rejects unrecognized or injected controls", () => {
  const base = { brief: cardBriefSchema.parse({ count: 3 }), input_hash: "source", data: { story: { direction: "warm", narrative: "original narrative", caption: "original caption", caveats: [], cards: [card, { ...card, title: "다음", copy: "어떤 장면을 보여줄지 먼저 골라 봐요." }, { ...card, title: "마무리", copy: "원문과 조건을 다시 읽고 출처를 남겨요.", layout: "closing" }] } } } as unknown as CardRun;
  const input = cardRevisionSchema.parse({ runId: "11111111-1111-4111-8111-111111111111", revision: 1, imageProvider: "openai" });
  const result = prepareCardRevision(base, input, card.evidence);
  assert.equal(result.brief.imageProvider, "openai");
  assert.deepEqual(result.data.story.cards, base.data.story!.cards);
  assert.equal(cardRevisionSchema.safeParse({ ...input, apiKey: "secret" }).success, false);
});

test("AI art and Korean text render independently across layouts without clipping", async () => {
  const bytes = await fixture();
  await mkdir(".local/image-provider-preview", { recursive: true });
  for (const design of ["cream", "magazine"] as const) {
    for (const [index, layout] of (["scene", "stack", "relation", "conversation", "steps", "comparison", "statement", "closing"] as const).entries()) {
      const sample = { ...card, layout, items: index % 2 ? [{ label: "독자", detail: "읽을 사람을 먼저 정해요" }, { label: "핵심", detail: "중요한 내용을 골라요" }] : [] };
      const rendered = await renderCard(sample, index, { ...brief, design }, 0, bytes);
      const meta = await sharp(rendered.buffer).metadata();
      assert.equal(meta.width, 1080);
      assert.equal(meta.height, 1350);
      assert.equal(rendered.checked, true);
      if (index < 2) await writeFile(`.local/image-provider-preview/${design}-${index}.png`, rendered.buffer);
    }
  }
});
