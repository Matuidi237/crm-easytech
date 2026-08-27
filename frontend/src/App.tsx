import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import type { Permission } from "./api";
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
import PermissionsPage from "./pages/PermissionsPage";

/** Redirige vers l accueil si le compte ne dispose pas du droit demandé. */
function RouteProtegee({ requiert, children }: { requiert: Permission; children: JSX.Element }) {
  const { peut } = useAuth();
  return peut(requiert) ? children : <Navigate to="/" replace />;
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
            <Route path="/import" element={<RouteProtegee requiert="clients.importer"><ImportPage /></RouteProtegee>} />
            <Route path="/newsletters" element={<RouteProtegee requiert="newsletters.voir"><NewslettersPage /></RouteProtegee>} />
            <Route path="/newsletters/:id" element={<RouteProtegee requiert="newsletters.voir"><NewsletterDetailPage /></RouteProtegee>} />
            <Route path="/profil" element={<ProfilPage />} />
            <Route
              path="/permissions"
              element={
                <RouteProtegee requiert="permissions.gerer">
                  <PermissionsPage />
                </RouteProtegee>
              }
            />
            <Route
              path="/utilisateurs"
              element={
                <RouteProtegee requiert="utilisateurs.gerer">
                  <UtilisateursPage />
                </RouteProtegee>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
