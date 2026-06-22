import { Panel, PanelHeader } from "@/components/ui/panel";
import type { PersonaSnapshotDiff } from "@/lib/persona-diff";

function value(value: number | string | null): string {
  return value === null ? "—" : String(value);
}

function DiffSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4">
      <p className="kicker dim mb-2 text-[9px]">{title}</p>
      {children}
    </section>
  );
}

function DiffRow({
  label,
  before,
  after,
}: {
  label: string;
  before: number | string | null;
  after: number | string | null;
}) {
  const change = `${value(before)} → ${value(after)}`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--line)] py-2 last:border-b-0">
      <span className="min-w-0 text-[12px] text-[var(--ink-faint)]">{label}</span>
      <span className="max-w-[20rem] truncate font-mono text-[12px] text-[var(--ink)]" title={change}>
        {change}
      </span>
    </div>
  );
}

function ListChanges({
  added,
  removed,
  secret,
}: {
  added: string[];
  removed: string[];
  secret?: boolean;
}) {
  return (
    <div className="grid gap-1 font-mono text-[12px]">
      {added.map((item) => (
        <p key={`add-${item}`} className="text-[var(--add)]">
          + {item}
          {secret ? " (secret)" : ""}
        </p>
      ))}
      {removed.map((item) => (
        <p key={`remove-${item}`} className="text-[var(--del)]">
          - {item}
          {secret ? " (secret)" : ""}
        </p>
      ))}
    </div>
  );
}

function AgendaChanges({ diff }: { diff: PersonaSnapshotDiff["agendas"] }) {
  return (
    <div className="grid gap-1 font-mono text-[12px]">
      {diff.added.map((agenda) => (
        <p key={`add-${agenda.secret}-${agenda.text}`} className="text-[var(--add)]">
          + {agenda.text}
          {agenda.secret ? " (secret)" : ""}
        </p>
      ))}
      {diff.removed.map((agenda) => (
        <p key={`remove-${agenda.secret}-${agenda.text}`} className="text-[var(--del)]">
          - {agenda.text}
          {agenda.secret ? " (secret)" : ""}
        </p>
      ))}
    </div>
  );
}

export function PersonaSnapshotDiffPanel({
  previousLabel,
  diff,
}: {
  previousLabel: string | null;
  diff: PersonaSnapshotDiff | null;
}) {
  if (!previousLabel || !diff) {
    return (
      <p className="text-[12px] text-[var(--ink-faint)]">
        This is the first recorded snapshot; there is no earlier snapshot to compare.
      </p>
    );
  }
  if (!diff.hasChanges) return null;

  const hasAgendas = diff.agendas.added.length > 0 || diff.agendas.removed.length > 0;
  const hasValues = diff.values.added.length > 0 || diff.values.removed.length > 0;

  return (
    <Panel>
      <PanelHeader kicker="Persona arc" title={`Changed since ${previousLabel}`} />
      <div className="px-[18px] pb-[18px]">
        {diff.dials.length > 0 && (
          <DiffSection title="Dials">
            {diff.dials.map((dial) => (
              <DiffRow key={dial.key} label={dial.label} before={dial.before} after={dial.after} />
            ))}
          </DiffSection>
        )}
        {hasAgendas && (
          <DiffSection title="Agendas">
            <AgendaChanges diff={diff.agendas} />
          </DiffSection>
        )}
        {hasValues && (
          <DiffSection title="Values">
            <ListChanges added={diff.values.added} removed={diff.values.removed} />
          </DiffSection>
        )}
        {diff.resources.length > 0 && (
          <DiffSection title="Resources">
            {diff.resources.map((resource) => (
              <DiffRow
                key={resource.key}
                label={resource.key}
                before={resource.before}
                after={resource.after}
              />
            ))}
          </DiffSection>
        )}
        {(diff.fields.length > 0 || diff.compiledPromptChanged) && (
          <DiffSection title="Snapshot details">
            {diff.fields.map((field) => (
              <DiffRow key={field.label} label={field.label} before={field.before} after={field.after} />
            ))}
            {diff.compiledPromptChanged && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--line)] py-2 last:border-b-0">
                <span className="text-[12px] text-[var(--ink-faint)]">Compiled prompt</span>
                <span className="font-mono text-[12px] text-[var(--ink)]">Updated</span>
              </div>
            )}
          </DiffSection>
        )}
      </div>
    </Panel>
  );
}
