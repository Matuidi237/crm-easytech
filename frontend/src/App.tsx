import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import Layout from "./Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ClientsPage from "./pages/ClientsPage";
import ImportPage from "./pages/ImportPage";
import NewslettersPage from "./pages/NewslettersPage";
import NewsletterDetailPage from "./pages/NewsletterDetailPage";
import ProfilPage from "./pages/ProfilPage";
import UtilisateursPage from "./pages/UtilisateursPage";

function AdminRoute({ children }: { children: JSX.Element }) {
  const { estAdmin } = useAuth();
  return estAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/newsletters" element={<NewslettersPage />} />
            <Route path="/newsletters/:id" element={<NewsletterDetailPage />} />
            <Route path="/profil" element={<ProfilPage />} />
            <Route
              path="/utilisateurs"
              element={
                <AdminRoute>
                  <UtilisateursPage />
                </AdminRoute>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
