import { FormEvent, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useLangue, useLibelles } from "./i18n";
import { navDe } from "./vues";
import SelecteurLangue from "./components/SelecteurLangue";
import {
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
};

function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
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
  const menuRef = useRef<HTMLDivElement>(null);

  const nom = utilisateur?.nomComplet ?? "";
  const roleLabel = utilisateur ? libelles.role(utilisateur.role) : "";
  const entrees = navDe(utilisateur?.role);

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

  return (
    <div className="shell">
      <div
        className={`sidebar-backdrop${navOpen ? " on" : ""}`}
        onClick={() => setNavOpen(false)}
        aria-hidden={!navOpen}
      />

      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/brand/easytech-logo-blanc.png" alt="EasyTech Group" className="brand-logo" />
          <button className="sidebar-close" onClick={() => setNavOpen(false)} aria-label={t("topbar.fermerMenu")}>
            <IconClose size={18} />
          </button>
        </div>
        <div className="sidebar-tag">{t("nav.marque")}</div>

        <nav className="sidebar-nav" aria-label={t("nav.principale")}>
          {entrees
            .filter((n) => !n.requiert || peut(n.requiert))
            .map(({ to, cle, icone, end }) => {
              const Icone = ICONES[icone];
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
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
            <NavLink to="/profil" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
              <IconUserCircle />
              <span>{t("nav.profil")}</span>
            </NavLink>
            {peut("permissions.gerer") && (
              <NavLink to="/permissions" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
                <IconKey />
                <span>{t("nav.permissions")}</span>
              </NavLink>
            )}
            {peut("utilisateurs.gerer") && (
              <NavLink to="/utilisateurs" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
                <IconShield />
                <span>{t("nav.utilisateurs")}</span>
              </NavLink>
            )}
          </nav>
          <button className="btn-logout" onClick={handleLogout}>
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
  );
}
