import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './features/auth/pages/LoginPage.jsx';
import HomePage from './features/home/pages/HomePage.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Navigate to={isAuthenticated ? '/home' : '/login'} replace />
        }
      />

      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/home" replace /> : <LoginPage />
        }
      />

      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App


