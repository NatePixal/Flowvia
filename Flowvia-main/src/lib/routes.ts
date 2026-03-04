import {
    LayoutDashboard,
    Package,
    ShoppingCart,
    CreditCard,
    Truck,
    Users,
    Wallet,
    Shield,
    UserPlus,
    DatabaseZap,
    ArrowRightLeft,
    Code,
    Settings,
    FileText,
    Store,
    ScanLine,
    ClipboardCheck,
    FileDown,
} from 'lucide-react';

export const APP_ROUTES = {
    DASHBOARD: { 
        href: '/dashboard', 
        label: 'nav.dashboard', 
        icon: LayoutDashboard, 
        module: 'dashboard', 
        action: 'view' 
    },
    INVENTORY: { 
        href: '/inventory', 
        label: 'nav.inventory', 
        icon: Package, 
        module: 'products', 
        action: 'view' 
    },
    SALES: { 
        href: '/sales', 
        label: 'nav.sales', 
        icon: ShoppingCart, 
        module: 'sales', 
        action: 'view' 
    },
    POS: {
        href: '/pos',
        label: 'nav.pos',
        icon: ScanLine,
        module: 'pos',
        action: 'view'
    },
    SHOPS: {
        href: '/shops',
        label: 'nav.shops',
        icon: Store,
        module: 'shops',
        action: 'view'
    },
    TRANSFERS: {
        href: '/transfers',
        label: 'nav.transfers',
        icon: ArrowRightLeft,
        module: 'transfers',
        action: 'view'
    },
    STOCKTAKE: {
        href: '/stocktake',
        label: 'nav.stocktake',
        icon: ClipboardCheck,
        module: 'stocktake',
        action: 'view'
    },
    INCOMING: { 
        href: '/incoming', 
        label: 'nav.dailyIncoming', 
        icon: ArrowRightLeft, 
        module: 'products', 
        action: 'view' 
    },
    LOANS: { 
        href: '/clients/loans', 
        label: 'nav.clientLoans', 
        icon: CreditCard, 
        module: 'clients', 
        action: 'view'
    },
    SUPPLIERS: { 
        href: '/suppliers', 
        label: 'nav.suppliers', 
        icon: Truck, 
        module: 'suppliers', 
        action: 'view' 
    },
    SELLERS: { 
        href: '/sellers', 
        label: 'nav.sellers', 
        icon: Users, 
        module: 'sellers', 
        action: 'view' 
    },
    EXPENSES: { 
        href: '/expenses', 
        label: 'nav.expenses', 
        icon: Wallet, 
        module: 'expenses', 
        action: 'view' 
    },
    EMPLOYEES: { 
        href: '/employees', 
        label: 'nav.employees', 
        icon: Users, 
        module: 'employees', 
        action: 'view' 
    },
};

export const ADMIN_ROUTES = {
    DASHBOARD: { 
        href: '/admin/dashboard', 
        label: 'nav.adminDashboard', 
        icon: Shield, 
        module: 'admin', 
        action: 'view' 
    },
    INVITE_USERS: { 
        href: '/admin/invite-users', 
        label: 'nav.inviteUsers', 
        icon: UserPlus, 
        module: 'users', 
        action: 'create' 
    },
    LOCATIONS: {
        href: '/admin/locations',
        label: 'nav.manageLocations',
        icon: Store,
        module: 'locations',
        action: 'view'
    },
    EXPORTS: {
        href: '/exports',
        label: 'nav.exports',
        icon: FileDown,
        module: 'exports',
        action: 'view'
    },
    DATA_TOOLS: {
        href: "/data-tools",
        label: "nav.dataTools",
        icon: FileText,
        module: "admin",
        action: "view",
    },
    DATA_MIGRATION: { 
        href: '/admin/migrate', 
        label: 'nav.dataMigration', 
        icon: DatabaseZap, 
        module: 'developer', // Only developers can see this 
        action: 'view' 
    },
};

    