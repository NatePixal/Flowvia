
import type { RecentActivity } from './types';
import { subDays, format } from 'date-fns';

// This file now only contains data that is truly static or for demonstration purposes
// and doesn't need to be in a database.
// All primary data like products, sales, loans, payables are now fetched from Firestore.

// Mock data for recent activity can be derived from Firestore queries in the component itself.
// We will leave it here for now but it should be replaced.
const recentActivitySeed: RecentActivity[] = [
    {
        id: 'SALE001',
        name: 'Alice Johnson',
        type: 'sale',
        amount: 75.0,
        date: format(subDays(new Date(), 1), 'yyyy-MM-dd'),
    },
    {
        id: 'SALE002',
        name: 'Bob Williams',
        type: 'sale',
        amount: 80.0,
        date: format(subDays(new Date(), 2), 'yyyy-MM-dd'),
    },
    {
        id: 'SALE003',
        name: 'Charlie Brown',
        type: 'sale',
        amount: 25.0,
        date: format(subDays(new Date(), 3), 'yyyy-MM-dd'),
    },
    {
        id: 'PAYMENT001',
        name: 'Global Textiles Inc.',
        type: 'payment',
        amount: 2500,
        date: format(subDays(new Date(), 4), 'yyyy-MM-dd')
    }
];

export const recentActivity: RecentActivity[] = recentActivitySeed.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());


export const salesByDay = [
  { date: format(subDays(new Date(), 6), 'EEE'), sales: 1230 },
  { date: format(subDays(new Date(), 5), 'EEE'), sales: 2450 },
  { date: format(subDays(new Date(), 4), 'EEE'), sales: 1780 },
  { date: format(subDays(new Date(), 3), 'EEE'), sales: 3120 },
  { date: format(subDays(new Date(), 2), 'EEE'), sales: 2890 },
  { date: format(subDays(new Date(), 1), 'EEE'), sales: 4100 },
  { date: format(new Date(), 'EEE'), sales: 3560 },
];
