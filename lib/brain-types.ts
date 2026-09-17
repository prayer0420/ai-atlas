import { z } from "zod";
export const slideSchema = z.object({
  kind: z.enum(["hook", "explain", "steps", "compare", "check"]),
  title: z.string().max(70),
  body: z.string().max(220),
  bullets: z.array(z.string().max(80)).max(3),
});
export const storySchema = z.object({
  feed_id: z.string().uuid(),
  headline: z.string().max(90),
  takeaway: z.string().max(240),
  slides: z.array(slideSchema).min(3).max(6),
  quiz: z.object({
    question: z.string().max(200),
    answer: z.string().max(300),
  }),
  concepts: z.array(z.string().max(40)).max(6),
});
export const issueSchema = z.object({
  title: z.string().max(100),
  introduction: z.string().max(400),
  stories: z.array(storySchema).min(1).max(5),
});
export type Story = z.infer<typeof storySchema>;
export type IssueContent = z.infer<typeof issueSchema>;
export type FeedItem = {
  id: string;
  user_id?: string;
  source_id: string;
  source_name: string;
  url: string;
  canonical_url: string;
  title: string;
  excerpt: string;
  published_at: string | null;
  collected_at: string;
  metrics: Record<string, number>;
  score: number;
  rank_reason: string;
  learned: boolean;
  favorite: boolean;
  resource_id: string | null;
};
export type Issue = {
  id: string;
  issue_date: string;
  content: IssueContent;
  mode: "preview" | "ai";
  warning: string | null;
  source_report: { id: string; name: string; count: number; error?: string }[];
  updated_at: string;
};
export type Preferences = {
  daily_enabled: boolean;
  source_ids: string[];
  topics: string[];
  story_count: number;
  auto_wiki: boolean;
};
export const wikiDraftSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(90)
    .regex(/^[a-z0-9가-힣_-]+$/),
  title: z.string().max(100),
  kind: z.enum(["concept", "entity", "guide", "synthesis", "question"]),
  summary: z.string().max(500),
  body: z.string().min(80).max(12000),
  source_ids: z.array(z.string().uuid()).min(1).max(30),
  links: z.array(z.string().max(90)).max(12),
  caveats: z.array(z.string().max(350)).max(8),
});
export const wikiBundleSchema = z.object({
  pages: z.array(wikiDraftSchema).min(1).max(5),
});
export type WikiPage = z.infer<typeof wikiDraftSchema> & {
  id: string;
  revision: number;
  protected: boolean;
  updated_at: string;
};
