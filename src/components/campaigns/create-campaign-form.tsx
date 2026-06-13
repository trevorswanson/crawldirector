"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCampaignAction,
  type CampaignActionState,
} from "@/app/(dm)/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create crawl"}
    </Button>
  );
}

export function CreateCampaignForm() {
  const [state, formAction] = useActionState<CampaignActionState, FormData>(
    createCampaignAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Crawl name</Label>
        <Input
          id="name"
          name="name"
          placeholder="The Carl Chronicles"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="summary">Summary (optional)</Label>
        <Input
          id="summary"
          name="summary"
          placeholder="A floor-by-floor run through the World Dungeon."
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" id="seedLore" name="seedLore" />
          Start with official DCC lore (~1,660 entities, imports in the background)
        </label>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {state.error}
        </p>
      )}
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
