import { z } from "zod";
export const categories = [
  "AI 기초",
  "프롬프트",
  "AI 에이전트",
  "개발·자동화",
  "이미지·영상",
  "생산성",
  "산업·트렌드",
] as const;
export const categorySchema = z.enum(categories);
export const lessonSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(1200),
  category: categorySchema,
  tags: z.array(z.string().max(30)).min(1).max(8),
  level: z.enum(["입문", "중급", "심화"]),
  readMinutes: z.number().int().min(1).max(120),
  objectives: z.array(z.string()).min(2).max(5),
  takeaways: z.array(z.string()).min(3).max(6),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        body: z.string(),
        example: z.string(),
        sourceBasis: z.enum(["원문 기반", "보충 설명"]),
      }),
    )
    .min(3)
    .max(7),
  diagram: z.object({
    title: z.string(),
    kind: z.enum(["flow", "cycle", "layers"]),
    nodes: z
      .array(
        z.object({
          label: z.string().max(45),
          description: z.string().max(180),
        }),
      )
      .min(3)
      .max(6),
    caption: z.string(),
  }),
  comparison: z.object({
    title: z.string(),
    columns: z.array(z.string()).min(2).max(4),
    rows: z
      .array(
        z.object({
          label: z.string(),
          values: z.array(z.string()).min(2).max(4),
        }),
      )
      .min(2)
      .max(6),
  }),
  glossary: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .min(3)
    .max(8),
  practice: z.object({
    title: z.string(),
    steps: z.array(z.string()).min(3).max(6),
    prompt: z.string(),
  }),
  quiz: z
    .array(
      z.object({
        question: z.string(),
        choices: z.array(z.string()).length(4),
        answer: z.number().int().min(0).max(3),
        explanation: z.string(),
      }),
    )
    .min(2)
    .max(4),
  caveats: z.array(z.string()).min(1).max(5),
});
export type Lesson = z.infer<typeof lessonSchema>;
export type Resource = {
  id: string;
  user_id?: string;
  title: string;
  source_url: string | null;
  source_type: "youtube" | "instagram" | "threads" | "web" | "text";
  raw_text: string;
  category: string;
  tags: string[];
  status: "saved" | "analyzing" | "ready" | "needs_content" | "failed";
  lesson: Lesson | null;
  favorite: boolean;
  learned: boolean;
  notes: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  model?: string | null;
  source_method?: string | null;
  demo?: boolean;
};
export const sourceNames: Record<Resource["source_type"], string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  threads: "Threads",
  web: "웹 아티클",
  text: "텍스트",
};
export type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  database: boolean;
  ai: boolean;
  model: string;
  dailyLimit: number;
};
