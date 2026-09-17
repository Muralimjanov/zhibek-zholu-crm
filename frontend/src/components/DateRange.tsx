import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DateRange({ from, to, onChange, max }: { from: string; to: string; onChange: (from: string, to: string) => void; max?: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="range-from" className="text-xs text-muted-foreground">С</Label>
        <Input id="range-from" type="date" value={from} max={to || max} onChange={(e) => onChange(e.target.value, to)} className="h-9 w-40" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="range-to" className="text-xs text-muted-foreground">По</Label>
        <Input id="range-to" type="date" value={to} min={from} max={max} onChange={(e) => onChange(from, e.target.value)} className="h-9 w-40" />
      </div>
    </div>
  );
}
