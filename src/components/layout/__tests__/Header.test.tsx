import { render, screen } from '@testing-library/react';
import Header from '../header';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('@/firebase/provider', () => ({
  useFirebase: () => ({
    auth: null,
    user: null,
    firestore: null,
    refreshUserProfile: jest.fn()
  }),
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
    const searchInput = screen.getByPlaceholderText('Search');
    expect(searchInput).toBeInTheDocument();
  });
});
