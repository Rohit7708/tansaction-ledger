import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import { AccountDetailsPage } from './pages/AccountDetailsPage';
import { CreateAccountPage } from './pages/CreateAccountPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TransferPage } from './pages/TransferPage';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="accounts/new" element={<CreateAccountPage />} />
            <Route path="accounts/:accountId" element={<AccountDetailsPage />} />
            <Route path="transfers" element={<TransferPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
