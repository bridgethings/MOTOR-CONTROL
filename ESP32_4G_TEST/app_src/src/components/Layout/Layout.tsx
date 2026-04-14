import { FC } from 'react';
import { AppShell } from '@mantine/core';
import HomePage from '@/pages/Home.page';
import Footer from './components/Footer';
import Header from './components/Header';

const Layout: FC<{}> = () => {
  return (
    <AppShell
      header={{ height: 60 }}
      footer={{ height: 40 }}
      padding="md"
    >
      <AppShell.Header>
        <Header />
      </AppShell.Header>
      <AppShell.Main>
        <HomePage />
      </AppShell.Main>
      <AppShell.Footer>
        <Footer />
      </AppShell.Footer>
    </AppShell>
  );
};

export default Layout;
