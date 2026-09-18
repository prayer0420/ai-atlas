import { z } from "zod";

export const usernameSchema = z.string().trim().toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{2,29}$/);

export const usernameHint = "영문 소문자·숫자로 시작하는 3~30자 (밑줄·하이픈 사용 가능)";
