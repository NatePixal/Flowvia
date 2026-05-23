import { render, screen } from '@testing-library/react';
import Header from '../header';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/en/dashboard',
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('@/firebase', () => ({
  useFirebase: () => ({ 
    auth: null,
    user: null,
    userProfile: null,
    company: null,
    companyId: null,
    firestore: null,
    refreshUserProfile: jest.fn(),
    isUserLoading: false,
  }),
  useDoc: () => ({ data: null, isLoading: false }),
}));

jest.mock('@/lib/currency-provider', () => ({
  useCurrency: () => ({ currency: 'USD', setCurrency: jest.fn() }),
}));

jest.mock('@/components/ui/sidebar', () => ({
    useSidebar: () => ({ isMobile: false }),
    SidebarTrigger: () => <button>Trigger</button>
}));


describe('Header', () => {
  it('renders the search input', () => {
    render(<Header />);
    const searchInput = screen.getByLabelText('Search');
    expect(searchInput).toBeInTheDocument();
  });
});
