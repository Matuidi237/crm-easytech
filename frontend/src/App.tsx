import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { LangueProvider } from "./i18n";
import { estVueCommerciale, estVueDirection } from "./vues";
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
import DirectionPage from "./pages/DirectionPage";
import EquipesPage from "./pages/EquipesPage";
import EquipeCommercialePage from "./pages/EquipeCommercialePage";
import FicheCommercialPage from "./pages/FicheCommercialPage";
import EquipeProjetPage from "./pages/EquipeProjetPage";
import FicheChefProjetPage from "./pages/FicheChefProjetPage";
import CampagnesPage from "./pages/CampagnesPage";
import ComposerCampagnePage from "./pages/ComposerCampagnePage";
import PartenairesPage from "./pages/PartenairesPage";
import CommercialPage from "./pages/CommercialPage";
import EnConstruction from "./pages/EnConstruction";

/**
 * L'accueil dépend de la vue du rôle : le directeur général ouvre sur ses
 * indicateurs, le commercial sur les siens, tout le monde sur l'état de la
 * base clients.
 */
function Accueil() {
  const { utilisateur } = useAuth();
  if (estVueDirection(utilisateur?.role)) return <DirectionPage />;
  if (estVueCommerciale(utilisateur?.role)) return <CommercialPage />;
  return <DashboardPage />;
}

/**
 * Réservée à la vue commerciale. Comme pour la direction, ce n'est pas une
 * protection : les routes serveur ne renvoient de toute façon que les chiffres
 * du compte connecté.
 */
function RouteCommerciale({ children }: { children: JSX.Element }) {
  const { utilisateur } = useAuth();
  return estVueCommerciale(utilisateur?.role) ? children : <Navigate to="/" replace />;
}

/**
 * Réservée à la vue direction. Un autre rôle qui taperait l'adresse est
 * renvoyé chez lui : ce n'est pas une protection (le serveur reste seul juge)
 * mais la page n'aurait aucun sens dans son parcours.
 */
function RouteDirection({ children }: { children: JSX.Element }) {
  const { utilisateur } = useAuth();
  return estVueDirection(utilisateur?.role) ? children : <Navigate to="/" replace />;
}

/** Redirige vers l accueil si le compte ne dispose pas du droit demandé. */
function RouteProtegee({ requiert, children }: { requiert: Permission; children: JSX.Element }) {
  const { peut } = useAuth();
  return peut(requiert) ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <LangueProvider>
      <AuthProvider>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Accueil />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/import" element={<RouteProtegee requiert="clients.importer"><ImportPage /></RouteProtegee>} />
            <Route path="/newsletters" element={<RouteProtegee requiert="newsletters.voir"><NewslettersPage /></RouteProtegee>} />
            <Route path="/newsletters/:id" element={<RouteProtegee requiert="newsletters.voir"><NewsletterDetailPage /></RouteProtegee>} />
            <Route
              path="/equipes"
              element={
                <RouteDirection>
                  <EquipesPage />
                </RouteDirection>
              }
            />
            <Route
              path="/equipes/commerciale"
              element={
                <RouteDirection>
                  <EquipeCommercialePage />
                </RouteDirection>
              }
            />
            <Route
              path="/equipes/commerciale/:id"
              element={
                <RouteDirection>
                  <FicheCommercialPage />
                </RouteDirection>
              }
            />
            <Route
              path="/equipes/projet"
              element={
                <RouteDirection>
                  <EquipeProjetPage />
                </RouteDirection>
              }
            />
            <Route
              path="/equipes/projet/:id"
              element={
                <RouteDirection>
                  <FicheChefProjetPage />
                </RouteDirection>
              }
            />
            <Route
              path="/campagnes"
              element={
                <RouteProtegee requiert="newsletters.voir">
                  <CampagnesPage />
                </RouteProtegee>
              }
            />
            <Route
              path="/campagnes/:type"
              element={
                <RouteProtegee requiert="newsletters.voir">
                  <ComposerCampagnePage />
                </RouteProtegee>
              }
            />
            <Route
              path="/partenaires"
              element={
                <RouteDirection>
                  <PartenairesPage />
                </RouteDirection>
              }
            />
            <Route
              path="/ventes"
              element={
                <RouteCommerciale>
                  <EnConstruction titre="nav.ventes" sousTitre="co.ventesSousTitre" />
                </RouteCommerciale>
              }
            />
            <Route
              path="/commissions"
              element={
                <RouteCommerciale>
                  <EnConstruction titre="nav.commissions" sousTitre="co.commissionsSousTitre" />
                </RouteCommerciale>
              }
            />
            <Route
              path="/agenda"
              element={
                <RouteCommerciale>
                  <EnConstruction titre="nav.agenda" sousTitre="co.agendaSousTitre" />
                </RouteCommerciale>
              }
            />
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
    </LangueProvider>
  );
}
