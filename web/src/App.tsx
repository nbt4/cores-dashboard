import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { AdminPage } from './pages/AdminPage';
import { SecurityPage } from './pages/SecurityPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
          <Route path="/admin/:tab" element={<ProtectedRoute><Layout><AdminPage /></Layout></ProtectedRoute>} />
          <Route path="/profile/security" element={<ProtectedRoute><Layout><div className="rounded-xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}><SecurityPage /></div></Layout></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
