'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useFirebase } from '@/firebase/provider';

export default function DashboardPage() {
  const { user, userProfile } = useFirebase();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">
        Welcome back, {userProfile?.name}!
      </h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
          </CardHeader>
          <CardContent>
            <p>This is your new TradeFlow dashboard. Start by exploring the inventory section.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
