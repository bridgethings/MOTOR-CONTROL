import React, { ReactNode, useState } from 'react';
import NavigationContext, { PageType } from '@/contexts/NavigationContext';
import useBluetooth from '@/hooks/useBluetooth';

const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentPage, setCurrentPage] = useState<PageType>('terminal');
  const bluetooth = useBluetooth();

  const navigateTo = (page: PageType) => {
    setCurrentPage(page);
  };

  // Can navigate to config pages only when connected
  const canNavigate = bluetooth.isConnected;

  return (
    <NavigationContext.Provider value={{ currentPage, navigateTo, canNavigate }}>
      {children}
    </NavigationContext.Provider>
  );
};

export default NavigationProvider;
