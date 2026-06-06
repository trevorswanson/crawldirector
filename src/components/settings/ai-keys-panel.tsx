"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";

import {
  deleteAiKeyAction,
  setAiKeyAction,
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
// last-four hint is shown. The app stays fully usable with no key configured
// (AI is additive), so this panel never blocks anything.

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
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
              Key set · ends ••{configured.lastFour} · updated{" "}
              {configured.updatedAt.toLocaleDateString()}
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
                Get one ↗
              </a>
            </p>
          )}
        </div>
        {configured && (
          <form action={deleteAction}>
            <Button type="submit" variant="destructive" size="sm">
              <Trash2 aria-hidden size={13} />
              Remove
            </Button>
          </form>
        )}
      </div>

      <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="providerId" value={provider.id} />
        <Input
          type="password"
          name="apiKey"
          autoComplete="off"
          placeholder={
            configured
              ? `Replace key (${provider.keyPrefix}…)`
              : `Paste key (${provider.keyPrefix}…)`
          }
          aria-label={`${provider.label} API key`}
          className="sm:flex-1"
        />
        <SaveButton label={configured ? "Replace" : "Save key"} />
      </form>

      {state?.error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--no)]">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="mt-2 text-[11px] text-[var(--ok)]">{state.success}</p>
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
        sub="Your API keys are encrypted at rest and never shared with players or shown again. The app works fully without a key — AI generation (M4) is additive."
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
