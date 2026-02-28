import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/catalog', label: 'Catalog' },
  { to: '/my-courses', label: 'My Courses' },
];

export function NavBar() {
  const location = useLocation();

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link to="/catalog" className="text-lg font-bold tracking-tight">
          1111 School
        </Link>
        <nav className="flex gap-4">
          {NAV_ITEMS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'text-sm font-medium transition-colors hover:text-foreground',
                location.pathname.startsWith(to)
                  ? 'text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
