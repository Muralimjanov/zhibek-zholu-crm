import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { legalApi } from '@/api/endpoints';
import { ErrorState } from '@/components/app';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';

/** Public legal documents. The API returns Markdown; rendered as safe text blocks (no HTML injection). */
export function LegalPage() {
  const { type = '' } = useParams();
  const doc = useQuery({ queryKey: ['legal', type], queryFn: () => legalApi.get(type) });

  return (
    <div className="min-h-dvh bg-background px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-lg border bg-card p-6 sm:p-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> В CRM
        </Link>
        {doc.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-4" />)}
          </div>
        ) : doc.isError ? (
          <ErrorState error={doc.error} onRetry={() => doc.refetch()} />
        ) : doc.data ? (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <h1 className="mr-2 text-2xl font-semibold tracking-tight">{doc.data.title}</h1>
              {doc.data.draft && <Badge tone="warning">Черновик</Badge>}
              <span className="text-xs text-muted-foreground">Версия {doc.data.version}</span>
            </div>
            <div className="max-w-[72ch] space-y-3 text-[15px] leading-7">
              {doc.data.content.split(/\n{2,}/).map((block, i) => {
                const heading = /^(#{1,3})\s+(.*)$/.exec(block.trim());
                if (heading) {
                  const level = heading[1].length;
                  return level === 1 ? null : (
                    <h2 key={i} className={level === 2 ? 'pt-3 text-lg font-semibold' : 'pt-2 font-semibold'}>{heading[2]}</h2>
                  );
                }
                if (/^\s*[-*]\s/m.test(block)) {
                  return (
                    <ul key={i} className="list-disc space-y-1 pl-6">
                      {block.split('\n').map((l, j) => <li key={j}>{l.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '')}</li>)}
                    </ul>
                  );
                }
                return <p key={i} className="whitespace-pre-line">{block.replace(/\*\*/g, '')}</p>;
              })}
            </div>
          </>
        ) : null}
      </article>
    </div>
  );
}
