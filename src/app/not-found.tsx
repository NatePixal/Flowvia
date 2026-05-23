
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

export default function NotFound() {
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground p-4">
      <div className="flex items-center gap-4">
        <h1 className="text-8xl font-black text-primary animate-pulse">404</h1>
      </div>
      <h2 className="text-3xl font-bold tracking-tight">Page Not Found</h2>
      <p className="max-w-sm text-center text-muted-foreground">
        We are sorry, the page you were looking for does not exist or has been moved.
      </p>
      <div className="mt-6 flex gap-4">
        <Button asChild>
          <Link href={`/${locale}/dashboard`}>
            <Home className="mr-2 h-4 w-4" />
            Go to Dashboard
          </Link>
        </Button>
         <Button variant="outline" onClick={() => window.history.back()}>
            Go Back
        </Button>
      </div>
    </div>
  );
}
