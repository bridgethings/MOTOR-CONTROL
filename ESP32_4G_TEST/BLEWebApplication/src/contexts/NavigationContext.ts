import { createContext } from 'react';

export type PageType = 'terminal' | 'motor' | 'profiles' | 'slaves' | 'advanced' | 'system' | 'status';

export interface NavigationContextType {
  currentPage: PageType;
  navigateTo: (page: PageType) => void;
  canNavigate: boolean;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export default NavigationContext;
