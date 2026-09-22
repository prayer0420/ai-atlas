import {
  createElement as h,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactNode,
} from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import satori from "satori";
import sharp from "sharp";
import {
  CARD_SIZE,
  CardWorkflowError,
  type CardBrief,
  type StoryCard,
} from "./card-workflow";

let fonts:
  | Promise<
      { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]
    >
  | undefined;
function loadFonts() {
  return (fonts ||= Promise.all(
    (["Regular", "Bold"] as const).map(async (name, i) => ({
      name: "Noto",
      data: await readFile(
        path.join(process.cwd(), "assets/fonts", `NotoSansKR-${name}.otf`),
      ),
      weight: (i ? 700 : 400) as 400 | 700,
      style: "normal" as const,
    })),
  ));
}
const paper = "#F4F0E6",
  ink = "#202021",
  red = "#EE513B",
  blue = "#2C49C6";
const box = (style: CSSProperties, ...children: ReactNode[]) =>
  h(
    "div",
    { style: { display: "flex", flexDirection: "column", ...style } },
    ...children,
  );
const text = (value: string, size: number, style: CSSProperties = {}) =>
  h(
    "div",
    {
      "data-card-text": true,
      "data-card-note": style.bottom === 115,
      style: {
        display: "flex",
        flexDirection: "column",
        fontSize: size,
        lineHeight: 1.35,
        wordBreak: "keep-all",
        ...style,
      },
    },
    value,
  );

function fitScene(node: ReactNode, ratio: number): ReactNode {
  if (!isValidElement<{ style?: CSSProperties; children?: ReactNode }>(node))
    return node;
  const style = { ...node.props.style };
  for (const key of [
    "fontSize",
    "height",
    "minHeight",
    "gap",
    "marginTop",
    "marginBottom",
    "paddingTop",
    "paddingBottom",
    "padding",
  ] as const) {
    const value = style[key];
    if (typeof value === "number")
      (style as Record<string, unknown>)[key] = Math.round(value * ratio);
    else if (typeof value === "string" && key === "padding")
      style.padding = value.replace(
        /(\d+)px/g,
        (_, n) => Math.round(Number(n) * ratio) + "px",
      );
  }
  return cloneElement(
    node,
    { style },
    ...(Array.isArray(node.props.children)
      ? node.props.children
      : [node.props.children]
    ).map((child) => fitScene(child, ratio)),
  );
}

/** A deterministic editorial renderer. It never claims to be a photo/image model. */
export async function renderCard(
  card: StoryCard,
  index: number,
  brief: CardBrief,
  fit = 0,
) {
  const compact = fit > 0;
  const dark = card.layout === "statement";
  const accent = index % 2 ? blue : red;
  const bodySize =
    (card.copy.length > 55 ? 48 : card.copy.length > 40 ? 56 : 64) -
    (compact ? 4 : 0);
  const title = text(
    card.title,
    (card.title.length > 20 ? 62 : 78) - (compact ? 10 : 0),
    {
      fontWeight: 700,
      letterSpacing: -3,
      maxWidth: 890,
    },
  );
  const body = text(card.copy, bodySize, {
    letterSpacing: -1.5,
    maxWidth: 890,
  });
  const item = (
    x: StoryCard["items"][number],
    i: number,
    style: CSSProperties = {},
  ) =>
    box(
      {
        padding: compact ? 20 : 28,
        gap: compact ? 8 : 12,
        background: "#FFFDF7",
        color: ink,
        ...style,
      },
      text(x.label, compact ? 32 : 38, { fontWeight: 700 }),
      x.detail ? text(x.detail, compact ? 26 : 29) : null,
    );
  const items = card.items.map((x, i) => item(x, i));
  let scene: ReactNode;
  switch (card.layout) {
    case "statement":
      scene = box(
        {
          height: card.condition ? 750 : 880,
          justifyContent: "center",
          gap: compact ? 46 : 70,
        },
        box({ width: 100, height: 10, background: red, marginBottom: 20 }),
        title,
        body,
      );
      break;
    case "comparison":
      scene = box(
        { gap: 46 },
        title,
        box(
          { flexDirection: "row", gap: 24, marginTop: 20 },
          ...card.items.map((x, i) =>
            item(x, i, {
              width: 452,
              minHeight: compact ? 260 : 340,
              borderTop: `10px solid ${i ? blue : red}`,
              background: i ? "#E4E8F4" : "#F6DFD6",
              justifyContent: "center",
            }),
          ),
        ),
        body,
      );
      break;
    case "steps":
      scene = box(
        { gap: 36 },
        title,
        body,
        box(
          { gap: 16, marginTop: 12 },
          ...card.items.map((x, i) =>
            box(
              {
                flexDirection: "row",
                gap: 24,
                alignItems: "center",
                padding: "18px 24px",
                borderBottom: "2px solid #CEC8BB",
              },
              text(String(i + 1).padStart(2, "0"), 56, {
                color: accent,
                width: 86,
                fontWeight: 700,
              }),
              box(
                { gap: 8, maxWidth: 735 },
                text(x.label, 36, { fontWeight: 700 }),
                x.detail ? text(x.detail, 28) : null,
              ),
            ),
          ),
        ),
      );
      break;
    case "conversation":
      scene = box(
        { gap: 38 },
        title,
        box(
          {
            padding: 44,
            background: blue,
            color: paper,
            borderRadius: "40px 40px 40px 4px",
            marginTop: 26,
          },
          body,
        ),
        box(
          { alignItems: "flex-end", gap: 20 },
          ...card.items.map((x, i) =>
            item(x, i, { width: 720, borderRadius: "32px 32px 4px 32px" }),
          ),
        ),
        text("내용을 설명하기 위한 구성", 23, { color: "#645E54" }),
      );
      break;
    case "relation":
      scene = box(
        { gap: 42 },
        title,
        body,
        box(
          { gap: 12, alignItems: "center" },
          ...card.items.flatMap((x, i) => [
            i ? text("↓", 32, { color: accent }) : null,
            item(x, i, {
              width: i % 2 ? 780 : 880,
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              borderLeft: `8px solid ${accent}`,
            }),
          ]),
        ),
      );
      break;
    case "stack":
      scene = box(
        { gap: 46 },
        title,
        box(
          { gap: 16, marginTop: 24 },
          ...card.items.map((x, i) =>
            item(x, i, {
              marginLeft: i % 2 ? 60 : 0,
              marginRight: i % 2 ? 0 : 60,
              border: "1px solid #CCC5B7",
              transform: `rotate(${i % 2 ? 2 : -2}deg)`,
            }),
          ),
        ),
        body,
      );
      break;
    case "closing":
      scene = box(
        { height: card.condition ? 750 : 890, justifyContent: "space-between" },
        box(
          { gap: 32 },
          box({ width: 100, height: 8, background: accent }),
          title,
        ),
        box(
          { padding: 44, background: accent, color: paper, gap: 32 },
          body,
          ...items.slice(0, 2),
        ),
      );
      break;
    default:
      scene = box(
        { gap: compact ? 30 : 46 },
        box(
          {
            background: accent,
            color: paper,
            padding: compact ? 40 : 52,
            minHeight: compact ? 280 : 350,
            justifyContent: "center",
            borderRadius: index % 2 ? "0 80px 0 0" : "0 0 80px 0",
          },
          text(card.title, compact ? 70 : 86, {
            fontWeight: 700,
            letterSpacing: -3,
            lineHeight: 1.2,
          }),
        ),
        box(
          { paddingLeft: 26, borderLeft: `5px solid ${accent}`, marginTop: 12 },
          body,
        ),
        box(
          {
            gap: compact ? 12 : 20,
            marginTop: 12,
            flexDirection: card.items.length === 2 ? "row" : "column",
          },
          ...card.items.map((x, i) =>
            item(x, i, card.items.length === 2 ? { width: 454 } : {}),
          ),
        ),
      );
  }
  // Fit a dense but valid composition before asking the editor to alter meaning.
  // Only the content region scales; source conditions and page numbers stay legible.
  if (fit > 0) scene = fitScene(scene, fit === 1 ? 0.9 : 0.78);

  const tree = box(
    {
      width: 1080,
      height: 1350,
      background: dark ? ink : paper,
      color: dark ? paper : ink,
      fontFamily: "Noto",
      padding: "66px 76px",
      position: "relative",
    },
    box(
      {
        flexDirection: "row",
        justifyContent: "space-between",
        fontSize: 25,
        paddingBottom: 34,
        borderBottom: `1px solid ${dark ? "#696969" : "#BDB6A7"}`,
      },
      card.role,
      brief.brand || "",
    ),
    h(
      "div",
      {
        "data-card-content": true,
        style: {
          display: "flex",
          flexDirection: "column",
          marginTop: 48,
          width: 928,
        },
      },
      scene,
    ),
    card.condition
      ? text(card.condition, 28, {
          position: "absolute",
          left: 76,
          right: 76,
          bottom: 115,
          maxWidth: 928,
          color: dark ? paper : ink,
        })
      : null,
    box(
      {
        position: "absolute",
        bottom: 50,
        left: 76,
        right: 76,
        flexDirection: "row",
        justifyContent: "space-between",
        fontSize: 24,
        color: dark ? "#D3CCBE" : "#696256",
      },
      brief.brand || "",
      `${String(index + 1).padStart(2, "0")} / ${String(brief.count).padStart(2, "0")}`,
    ),
  );
  const overflow: string[] = [];
  let contentBottom = 0;
  let contentLimit = 1210;
  const textRects: {
    left: number;
    top: number;
    width: number;
    height: number;
  }[] = [];
  const svg = await satori(tree, {
    ...CARD_SIZE,
    fonts: await loadFonts(),
    onNodeDetected(node) {
      if (node.props?.["data-card-text"] && node.textContent?.trim())
        textRects.push({
          left: node.left,
          top: node.top,
          width: node.width,
          height: node.height,
        });
      if (node.props?.["data-card-content"])
        contentBottom = node.top + node.height;
      if (node.props?.["data-card-note"]) contentLimit = node.top - 28;
      if (
        node.left < 0 ||
        node.left + node.width > 1081 ||
        node.top + node.height > 1351
      )
        overflow.push("글자 또는 도형이 이미지 밖으로 벗어났습니다.");
    },
  });
  // A long source condition is an intentional bottom note, not overflowing body.
  if (contentBottom > contentLimit)
    overflow.push("본문 배치가 하단 안전 영역을 넘었습니다.");
  for (let i = 0; i < textRects.length; i++)
    for (let j = i + 1; j < textRects.length; j++) {
      const a = textRects[i],
        b = textRects[j];
      if (
        Math.min(a.left + a.width, b.left + b.width) -
          Math.max(a.left, b.left) >
          2 &&
        Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top) >
          2
      )
        overflow.push("서로 다른 문구의 영역이 겹칩니다.");
    }
  if (overflow.length) {
    if (fit < 2) return renderCard(card, index, brief, fit + 1);
    throw new CardWorkflowError(
      "IMAGE_INVALID",
      "문구를 안전 영역 안에 배치하지 못했습니다.",
      [...new Set(overflow)],
    );
  }
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  if (meta.width !== 1080 || meta.height !== 1350 || meta.format !== "png")
    throw new CardWorkflowError(
      "IMAGE_INVALID",
      "이미지 크기 또는 형식을 확인하지 못했습니다.",
    );
  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    width: 1080,
    height: 1350,
    bytes: buffer.length,
    checked: true,
  };
}
