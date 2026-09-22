import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useLangue, useLibelles } from "./i18n";
import { navDe, piedDeMenuMinimal } from "./vues";
import { ContexteEntete, type FilAriane } from "./ContexteEntete";
import SelecteurLangue from "./components/SelecteurLangue";
import {
  IconArrowLeft,
  IconCalendar,
  IconChevronLeft,
  IconCoins,
  IconTag,
  IconChevronRight,
  IconClose,
  IconDashboard,
  IconHandshake,
  IconImport,
  IconLogout,
  IconMail,
  IconMenu,
  IconSearch,
  IconKey,
  IconShield,
  IconTeam,
  IconUserCircle,
  IconUsers,
} from "./components/Icons";

/* La navigation dépend de la vue attribuée au rôle (voir vues.ts) ; ce
   tableau ne fait que relier un nom d'icône à son composant. */
const ICONES: Record<string, typeof IconDashboard> = {
  dashboard: IconDashboard,
  users: IconUsers,
  import: IconImport,
  mail: IconMail,
  team: IconTeam,
  handshake: IconHandshake,
  tag: IconTag,
  coins: IconCoins,
  calendar: IconCalendar,
};

function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

/**
 * Pages où la recherche client a sa place dans la barre du haut.
 *
 * Elle cherche des CLIENTS et renvoie vers leur liste. Ailleurs, elle propose
 * une action sans rapport avec la page ouverte, et sur Équipe commerciale elle
 * cohabitait avec un second champ qui, lui, cherche des commerciaux : deux
 * champs côte à côte dont on ne devine pas lequel fait quoi.
 */
const PAGES_AVEC_RECHERCHE = ["/", "/clients"];

/* Le pli du menu est une préférence d'affichage : elle survit au rechargement,
   sinon il faudrait la reprendre à chaque visite. Le localStorage peut être
   refusé (navigation privée, réglage du navigateur), d'où le try. */
const CLE_MENU_REPLIE = "crm.menuReplie";

function menuReplieInitial() {
  try {
    return localStorage.getItem(CLE_MENU_REPLIE) === "1";
  } catch {
    return false;
  }
}

export default function Layout() {
  const { logout, utilisateur, peut } = useAuth();
  const { t } = useLangue();
  const libelles = useLibelles();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  /* Repliée, la barre ne garde que ses icônes. Elle ne disparaît pas comme sur
     mobile : sur un grand écran la place gagnée ne vaut pas de transformer
     chaque navigation en deux clics. */
  const [replie, setReplie] = useState(menuReplieInitial);
  /* Renseigné par la page affichée (voir ContexteEntete) : la barre du haut
     n'a aucun moyen de connaître le nom d'un commercial par elle-même. */
  const [fil, setFil] = useState<FilAriane | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const nom = utilisateur?.nomComplet ?? "";
  const roleLabel = utilisateur ? libelles.role(utilisateur.role) : "";
  const entrees = navDe(utilisateur?.role);
  /* Le bas du menu se réduit au profil et à la déconnexion pour les rôles qui
     n'administrent rien. Les permissions suffiraient à masquer ces entrées ;
     ce garde-fou dit l'intention, et tient si l'une d'elles est accordée un
     jour à titre exceptionnel. */
  const piedMinimal = piedDeMenuMinimal(utilisateur?.role);
  const rechercheVisible = PAGES_AVEC_RECHERCHE.includes(location.pathname);

  /* Référence stable : le hook des pages en dépend, une fonction recréée à
     chaque rendu relancerait son effet en boucle. */
  const definirFil = useCallback((f: FilAriane | null) => setFil(f), []);
  const contexteEntete = useMemo(() => ({ fil, definirFil }), [fil, definirFil]);

  // Le tiroir de navigation se referme dès qu'on change de page (mobile).
  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setNavOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/clients?recherche=${encodeURIComponent(q)}` : "/clients");
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function basculerRepli() {
    setReplie((r) => {
      try {
        localStorage.setItem(CLE_MENU_REPLIE, r ? "0" : "1");
      } catch {
        // Préférence non mémorisable : le pli reste valable pour la session.
      }
      return !r;
    });
  }

  return (
    <ContexteEntete.Provider value={contexteEntete}>
    <div className="shell">
      <div
        className={`sidebar-backdrop${navOpen ? " on" : ""}`}
        onClick={() => setNavOpen(false)}
        aria-hidden={!navOpen}
      />

      <aside className={`sidebar${navOpen ? " open" : ""}${replie ? " replie" : ""}`}>
        <div className="sidebar-brand">
          <img src="/brand/easytech-logo-blanc.png" alt="EasyTech Group" className="brand-logo" />
          <button className="sidebar-close" onClick={() => setNavOpen(false)} aria-label={t("topbar.fermerMenu")}>
            <IconClose size={18} />
          </button>
          {/* Le repli ne concerne que les grands écrans : sous 1024 px la barre
              est déjà un tiroir, et ce bouton céderait la place à la croix. */}
          <button
            className="sidebar-toggle"
            onClick={basculerRepli}
            aria-expanded={!replie}
            aria-controls="navigation-principale"
            aria-label={replie ? t("nav.deployer") : t("nav.replier")}
            title={replie ? t("nav.deployer") : t("nav.replier")}
          >
            {replie ? <IconChevronRight size={17} /> : <IconChevronLeft size={17} />}
          </button>
        </div>
        <div className="sidebar-tag">{t("nav.marque")}</div>

        <nav className="sidebar-nav" id="navigation-principale" aria-label={t("nav.principale")}>
          {entrees
            .filter((n) => !n.requiert || peut(n.requiert))
            .map(({ to, cle, icone, end }) => {
              const Icone = ICONES[icone];
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={replie ? t(cle) : undefined}
                  className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                >
                  <Icone />
                  <span>{t(cle)}</span>
                </NavLink>
              );
            })}
        </nav>

        <div className="nav-section">
          <nav className="sidebar-nav" aria-label={t("nav.compte")}>
            <NavLink
              to="/profil"
              title={replie ? t("nav.profil") : undefined}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
              >
              <IconUserCircle />
              <span>{t("nav.profil")}</span>
            </NavLink>
            {!piedMinimal && peut("permissions.gerer") && (
              <NavLink
                to="/permissions"
                title={replie ? t("nav.permissions") : undefined}
                className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
              >
                <IconKey />
                <span>{t("nav.permissions")}</span>
              </NavLink>
            )}
            {!piedMinimal && peut("utilisateurs.gerer") && (
              <NavLink
                to="/utilisateurs"
                title={replie ? t("nav.utilisateurs") : undefined}
                className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
              >
                <IconShield />
                <span>{t("nav.utilisateurs")}</span>
              </NavLink>
            )}
          </nav>
          <button
            className="btn-logout"
            onClick={handleLogout}
            title={replie ? t("nav.deconnexion") : undefined}
          >
            <IconLogout />
            <span>{t("nav.deconnexion")}</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="burger" onClick={() => setNavOpen(true)} aria-label={t("topbar.ouvrirMenu")}>
            <IconMenu />
          </button>

          {/* Le fil d'Ariane occupe la place laissée libre par la recherche.
              Les deux ne coexistent pas : les pages qui portent la recherche
              sont des racines, elles n'ont pas de parent à afficher. */}
          {!rechercheVisible && fil && (
            <nav className="topbar-fil" aria-label={t("nav.filAriane")}>
              <Link to={fil.vers} className="fil-retour">
                <IconArrowLeft size={15} />
                <span>{fil.versLibelle}</span>
              </Link>
              {fil.courant && (
                <>
                  <IconChevronRight size={14} className="fil-separateur" />
                  <span className="fil-courant" title={fil.courant}>
                    {fil.courant}
                  </span>
                </>
              )}
            </nav>
          )}

          {rechercheVisible && (
            <form className="search" onSubmit={handleSearch} role="search">
              <IconSearch />
              <input
                type="search"
                placeholder={t("topbar.rechercher")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t("topbar.rechercherAria")}
              />
            </form>
          )}

          <div className="topbar-right">
            <SelecteurLangue />

            <span className="topbar-sep" aria-hidden />

            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                className="user-chip"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t("topbar.monCompte")}
              >
                <div className="avatar">{initiales(nom)}</div>
                <div className="uc-meta">
                  <div className="uc-name">{nom}</div>
                  <div className="uc-role">{roleLabel}</div>
                </div>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="uc-chevron"
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {menuOpen && (
                <div className="menu" role="menu">
                  <div className="menu-head">
                    <div className="menu-head-name">{nom}</div>
                    <div className="menu-head-sub">
                      {utilisateur?.identifiant} · {roleLabel}
                    </div>
                  </div>
                  <button className="menu-item" role="menuitem" onClick={() => navigate("/profil")}>
                    <IconUserCircle size={16} />
                    {t("nav.profil")}
                  </button>
                  {peut("utilisateurs.gerer") && (
                    <button className="menu-item" role="menuitem" onClick={() => navigate("/utilisateurs")}>
                      <IconShield size={16} />
                      {t("nav.gererUtilisateurs")}
                    </button>
                  )}

                  <div className="menu-sep" />
                  <button className="menu-item danger" role="menuitem" onClick={handleLogout}>
                    <IconLogout size={16} />
                    {t("nav.deconnexion")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
    </ContexteEntete.Provider>
  );
}
