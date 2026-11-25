import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { LangueProvider } from "./i18n";
import { estVueChefProjet, estVueCommerciale, estVuePilotage, estVueRH } from "./vues";
import ChefProjetPage from "./pages/ChefProjetPage";
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
import VentesPage from "./pages/VentesPage";
import CommissionsPage from "./pages/CommissionsPage";
import PipelinePage from "./pages/PipelinePage";
import CotationsPage from "./pages/CotationsPage";
import ACoutPage from "./pages/ACoutPage";
import PlanningPage from "./pages/PlanningPage";
import CalendrierPage from "./pages/CalendrierPage";
import FeuillesDeTempsPage from "./pages/FeuillesDeTempsPage";
import ObjectifsPage from "./pages/ObjectifsPage";
import DetailObjectifPage from "./pages/DetailObjectifPage";
import DetailClassementPage from "./pages/DetailClassementPage";
import DetailPortefeuillePage from "./pages/DetailPortefeuillePage";
import EnConstruction from "./pages/EnConstruction";

/**
 * L'accueil dépend de la vue du rôle : la direction et le responsable
 * commercial ouvrent sur les indicateurs d'activité, le commercial sur les
 * siens, tout le monde sur l'état de la base clients.
 */
function Accueil() {
  const { utilisateur } = useAuth();
  if (estVuePilotage(utilisateur?.role)) return <DirectionPage />;
  if (estVueCommerciale(utilisateur?.role)) return <CommercialPage />;
  /* Le chef de projet mesure de la charge et du temps, là où les autres
     comptent de l'argent. */
  if (estVueChefProjet(utilisateur?.role)) return <ChefProjetPage />;
  /* La DRH n'a aucun droit sur le CRM : le tableau de bord ne lui renverrait
     que des refus. Tant que le module RH n'a pas ses écrans, elle ouvre sur la
     seule chose qu'elle suit ici, la file des cotations. */
  if (estVueRH(utilisateur?.role)) return <Navigate to="/cotations" replace />;
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
 * Réservée aux comptes de pilotage, directeur général et responsable
 * commercial. Un autre rôle qui taperait l'adresse est renvoyé chez lui : ce
 * n'est pas une protection (le serveur reste seul juge, et ces pages exigent
 * « stats.globales ») mais elles n'auraient aucun sens dans son parcours.
 */
function RoutePilotage({ children }: { children: JSX.Element }) {
  const { utilisateur } = useAuth();
  return estVuePilotage(utilisateur?.role) ? children : <Navigate to="/" replace />;
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
            {/* Aucune capacité exigée : chacun y voit ses propres demandes, et
                ce sont « cotations.traiter » et « cotations.superviser » qui
                élargissent la file au travail de tout le monde. */}
            <Route path="/cotations" element={<CotationsPage />} />
            <Route path="/import" element={<RouteProtegee requiert="clients.importer"><ImportPage /></RouteProtegee>} />
            <Route path="/newsletters" element={<RouteProtegee requiert="newsletters.voir"><NewslettersPage /></RouteProtegee>} />
            <Route path="/newsletters/:id" element={<RouteProtegee requiert="newsletters.voir"><NewsletterDetailPage /></RouteProtegee>} />
            {/* Commandes dont le prix d'achat manque. La capacite, et non le
                role : le DG comme le responsable des projets y accèdent. */}
            <Route path="/a-chiffrer" element={<RouteProtegee requiert="ventes.cout"><ACoutPage /></RouteProtegee>} />
            <Route
              path="/equipes"
              element={
                <RoutePilotage>
                  <EquipesPage />
                </RoutePilotage>
              }
            />
            <Route
              path="/equipes/commerciale"
              element={
                <RoutePilotage>
                  <EquipeCommercialePage />
                </RoutePilotage>
              }
            />
            <Route
              path="/equipes/commerciale/:id"
              element={
                <RoutePilotage>
                  <FicheCommercialPage />
                </RoutePilotage>
              }
            />
            <Route
              path="/equipes/projet"
              element={
                <RoutePilotage>
                  <EquipeProjetPage />
                </RoutePilotage>
              }
            />
            <Route
              path="/equipes/projet/:id"
              element={
                <RoutePilotage>
                  <FicheChefProjetPage />
                </RoutePilotage>
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
                <RoutePilotage>
                  <PartenairesPage />
                </RoutePilotage>
              }
            />
            <Route
              path="/ventes"
              element={
                <RouteCommerciale>
                  <VentesPage />
                </RouteCommerciale>
              }
            />
            <Route
              path="/pipeline"
              element={
                <RouteCommerciale>
                  <PipelinePage />
                </RouteCommerciale>
              }
            />
            <Route
              path="/commissions"
              element={
                <RouteCommerciale>
                  <CommissionsPage />
                </RouteCommerciale>
              }
            />
            {/* Détail des indicateurs du tableau de bord commercial. */}
            <Route
              path="/tableau-de-bord/objectif"
              element={
                <RouteCommerciale>
                  <DetailObjectifPage />
                </RouteCommerciale>
              }
            />
            <Route
              path="/tableau-de-bord/classement"
              element={
                <RouteCommerciale>
                  <DetailClassementPage />
                </RouteCommerciale>
              }
            />
            <Route
              path="/tableau-de-bord/portefeuille"
              element={
                <RouteCommerciale>
                  <DetailPortefeuillePage />
                </RouteCommerciale>
              }
            />
            <Route
              path="/planning"
              element={
                <RouteCommerciale>
                  <PlanningPage />
                </RouteCommerciale>
              }
            />
            <Route
              path="/planning/agenda"
              element={
                <RouteCommerciale>
                  <CalendrierPage />
                </RouteCommerciale>
              }
            />
            <Route
              path="/planning/feuilles-de-temps"
              element={
                <RouteCommerciale>
                  <FeuillesDeTempsPage />
                </RouteCommerciale>
              }
            />
            <Route
              path="/planning/objectifs"
              element={
                <RouteCommerciale>
                  <ObjectifsPage />
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
