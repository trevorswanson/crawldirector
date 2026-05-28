import { z } from "zod";

// Shared Zod schemas. Per docs/02-architecture.md every Server Action validates
// its input at the boundary with one of these.

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.email("Enter a valid email").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required").max(120),
  summary: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
