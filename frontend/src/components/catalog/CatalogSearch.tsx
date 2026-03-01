import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCatalogStore } from '@/stores/catalog-store';

interface CatalogSearchProps {
  allTags: string[];
}

export function CatalogSearch({ allTags }: CatalogSearchProps) {
  const { search, tag, setSearch, setTag, load } = useCatalogStore();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(), 300);
    return () => clearTimeout(timer.current);
  }, [search, tag, load]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Search courses..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map((t) => (
            <Badge
              key={t}
              variant={tag === t ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setTag(tag === t ? '' : t)}
            >
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
