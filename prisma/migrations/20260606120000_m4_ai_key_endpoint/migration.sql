-- M4: OpenAI-compatible provider support. Additive, nullable config columns on
-- AiKey: a custom endpoint base URL and an optional per-key model override. Both
-- are non-secret (the API key stays in `ciphertext`), so they are plain columns.
-- AlterTable
ALTER TABLE "AiKey" ADD COLUMN "baseUrl" TEXT;
ALTER TABLE "AiKey" ADD COLUMN "model" TEXT;
