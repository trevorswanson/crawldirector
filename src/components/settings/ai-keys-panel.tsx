"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, ShieldCheck, Trash2, Zap } from "lucide-react";

import {
  deleteAiKeyAction,
  setAiKeyAction,
  testAiConnectionAction,
  type SettingsActionState,
} from "@/app/(dm)/campaigns/[id]/settings/actions";
import { AI_PROVIDERS, type AiProviderInfo } from "@/lib/ai/providers";
import type { AiKeyView } from "@/server/services/ai-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kicker } from "@/components/ui/kicker";
import { Panel, PanelHeader } from "@/components/ui/panel";

// The campaign's BYO AI-key settings (M4). DMs add their own provider key per
// campaign; keys are encrypted at rest and never rendered back — only a
// last-four hint is shown. OpenAI-compatible providers (self-hosted / proxy)
// also capture a base URL + model. A Test button verifies the configured
// key/endpoint/model with a tiny live call. The app stays fully usable with no
// key configured (AI is additive), so this panel never blocks anything.

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function TestButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      <Zap aria-hidden size={13} />
      {pending ? "Testing…" : "Test"}
    </Button>
  );
}

function ProviderRow({
  campaignId,
  provider,
  configured,
}: {
  campaignId: string;
  provider: AiProviderInfo;
  configured: AiKeyView | undefined;
}) {
  const [state, formAction] = useActionState<SettingsActionState, FormData>(
    setAiKeyAction.bind(null, campaignId),
    undefined,
  );
  const [testState, testAction] = useActionState<SettingsActionState, FormData>(
    testAiConnectionAction.bind(null, campaignId, provider.id),
    undefined,
  );
  const deleteAction = deleteAiKeyAction.bind(null, campaignId, provider.id);

  return (
    <div className="border-b border-[var(--line)] px-[18px] py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KeyRound aria-hidden size={14} className="text-[var(--ink-faint)]" />
            <span className="text-[13px] font-semibold text-[var(--ink)]">
              {provider.label}
            </span>
          </div>
          {configured ? (
            <p className="mt-1 font-mono text-[11px] text-[var(--ink-faint)]">
              {configured.lastFour ? `Key set · ends ••${configured.lastFour}` : "Configured"}
              {configured.model ? ` · ${configured.model}` : ""}
              {configured.embeddingModel ? ` · embed: ${configured.embeddingModel}` : ""}
              {configured.baseUrl ? ` · ${configured.baseUrl}` : ""}
              {configured.inputPerMTokUsd != null && configured.outputPerMTokUsd != null
                ? ` · $${configured.inputPerMTokUsd}/$${configured.outputPerMTokUsd} per 1M tok`
                : ""}{" "}
              · updated {configured.updatedAt.toLocaleDateString()}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
              No key configured.{" "}
              <a
                href={provider.consoleUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--ink-dim)] underline hover:text-[var(--ink)]"
              >
                {provider.requiresBaseUrl ? "Learn more ↗" : "Get one ↗"}
              </a>
            </p>
          )}
        </div>
        {configured && (
          <div className="flex items-center gap-2">
            <form action={testAction}>
              <TestButton />
            </form>
            <form action={deleteAction}>
              <Button type="submit" variant="destructive" size="sm">
                <Trash2 aria-hidden size={13} />
                Remove
              </Button>
            </form>
          </div>
        )}
      </div>

      <form action={formAction} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="providerId" value={provider.id} />
        {provider.requiresBaseUrl && (
          <Input
            type="url"
            name="baseUrl"
            autoComplete="off"
            defaultValue={configured?.baseUrl ?? ""}
            placeholder="Endpoint URL (e.g. http://localhost:11434/v1)"
            aria-label={`${provider.label} endpoint URL`}
          />
        )}
        {provider.requiresModel && (
          <Input
            type="text"
            name="model"
            autoComplete="off"
            defaultValue={configured?.model ?? ""}
            placeholder="Chat model name (e.g. mistral-large-latest)"
            aria-label={`${provider.label} chat model`}
          />
        )}
        {provider.kind === "openai-compatible" && (
          <>
            <Input
              type="text"
              name="embeddingModel"
              autoComplete="off"
              defaultValue={configured?.embeddingModel ?? ""}
              placeholder={
                provider.defaultEmbeddingModel
                  ? `Embedding model (optional, default ${provider.defaultEmbeddingModel})`
                  : "Embedding model for search (optional, e.g. codestral-embed)"
              }
              aria-label={`${provider.label} embedding model`}
            />
            <p className="text-[10.5px] leading-[1.4] text-[var(--ink-faint)]">
              Enables semantic search through this provider. The model must return
              1536-dimensional vectors — e.g. Mistral&rsquo;s{" "}
              <code>codestral-embed</code>, not <code>mistral-embed</code> (1024).
              Leave blank for keyword-only search
              {provider.defaultEmbeddingModel
                ? ` (defaults to ${provider.defaultEmbeddingModel})`
                : ""}
              .
            </p>
          </>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="number"
            name="inputPerMTokUsd"
            min="0"
            step="0.01"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={configured?.inputPerMTokUsd ?? ""}
            placeholder="Input $ / 1M tokens (optional)"
            aria-label={`${provider.label} input price per million tokens`}
            className="sm:flex-1"
          />
          <Input
            type="number"
            name="outputPerMTokUsd"
            min="0"
            step="0.01"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={configured?.outputPerMTokUsd ?? ""}
            placeholder="Output $ / 1M tokens (optional)"
            aria-label={`${provider.label} output price per million tokens`}
            className="sm:flex-1"
          />
        </div>
        <p className="text-[10.5px] leading-[1.4] text-[var(--ink-faint)]">
          Set both to cost this provider&rsquo;s usage (and count it toward the
          spend cap) — required for self-hosted/proxy models the built-in price
          table doesn&rsquo;t know; overrides the table for the rest.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="password"
            name="apiKey"
            autoComplete="off"
            placeholder={
              provider.keyOptional
                ? "API key (optional for local servers)"
                : configured
                  ? `Replace key (${provider.keyPrefix}…)`
                  : `Paste key (${provider.keyPrefix}…)`
            }
            aria-label={`${provider.label} API key`}
            className="sm:flex-1"
          />
          <SaveButton label={configured ? "Replace" : "Save"} />
        </div>
      </form>

      {state?.error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--no)]">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="mt-2 text-[11px] text-[var(--ok)]">{state.success}</p>
      )}
      {testState?.error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--no)]">
          {testState.error}
        </p>
      )}
      {testState?.success && (
        <p className="mt-2 text-[11px] text-[var(--ok)]">{testState.success}</p>
      )}
    </div>
  );
}

export function AiKeysPanel({
  campaignId,
  configured,
}: {
  campaignId: string;
  configured: AiKeyView[];
}) {
  const byProvider = new Map(configured.map((k) => [k.providerId, k] as const));

  return (
    <Panel>
      <PanelHeader
        kicker="AI providers"
        title="Bring your own key"
        sub="Your API keys are encrypted at rest and never shared with players or shown again. Anthropic, OpenAI, or any OpenAI-compatible endpoint (a self-hosted model or proxy). The app works fully without a key — AI generation (M4) is additive."
      />
      <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-2)] px-[18px] py-[10px]">
        <ShieldCheck aria-hidden size={14} className="text-[var(--ok)]" />
        <Kicker dim noLead>
          Keys are decrypted only at the moment of a provider call
        </Kicker>
      </div>
      {AI_PROVIDERS.map((provider) => (
        <ProviderRow
          key={provider.id}
          campaignId={campaignId}
          provider={provider}
          configured={byProvider.get(provider.id)}
        />
      ))}
    </Panel>
  );
}
