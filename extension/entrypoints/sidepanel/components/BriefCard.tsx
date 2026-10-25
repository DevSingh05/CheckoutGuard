import { FileText, Sparkles } from 'lucide-react';
import type { Analysis } from '../../../lib/contracts';

export function BriefCard({
  brief,
}: {
  brief: NonNullable<Analysis['brief']>;
}) {
  const Icon = brief.generated ? Sparkles : FileText;
  return (
    <section className="brief" aria-labelledby="brief-heading">
      <div className="brief-heading">
        <Icon size={14} aria-hidden="true" />
        <h2 id="brief-heading">
          {brief.generated
            ? 'AI summary · written from the evidence above'
            : 'Summary'}
        </h2>
      </div>
      <p>{brief.text}</p>
    </section>
  );
}
