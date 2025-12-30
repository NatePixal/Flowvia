'use client';

import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Settings,
  UserCircle,
  LogOut,
  Building,
} from 'lucide-react';
import Link from 'next/link';
import { useFirebase } from '@/firebase/provider';
import { signOut } from 'firebase/auth';
import { auth } from '@/firebase/client';
import { Button } from '../ui/button';

const AppSidebar = () => {
  const pathname = usePathname();
  const { userProfile } = useFirebase();

  const menuItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/inventory', label: 'Inventory', icon: Package },
    // Add more pages here as they are created
  ];

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-background">
      <div className="flex items-center gap-2 p-4 border-b">
        <Building className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">TradeFlow</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <Link key={item.href} href={item.href} legacyBehavior passHref>
            <a className={`flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary ${pathname === item.href ? "bg-muted text-primary" : ""}`}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </a>
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t">
        <div className="flex items-center gap-3 mb-4">
          <UserCircle className="h-8 w-8" />
          <div className="flex flex-col">
            <span className="font-semibold">{userProfile?.name}</span>
            <span className="text-xs text-muted-foreground">{userProfile?.email}</span>
          </div>
        </div>
        <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
};

export default AppSidebar;
