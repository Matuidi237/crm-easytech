import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FicheChefProjet, Projet, StatutProjet, fetchFicheChefProjet } from "../api";
import { useLangue, useLibelles, type CleTraduction } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import { IconAlert, IconBox, IconCheck, IconCoins, IconInbox } from "../components/Icons";

function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

/* Teinte de chaque état. Le libellé est toujours écrit à côté : la couleur
   redouble l'information, elle ne la porte jamais seule. */
const TEINTE_STATUT: Record<StatutProjet, string> = {
  EN_PREPARATION: "pill-neutral",
  EN_COURS: "pill-brand",
  EN_PAUSE: "pill-warn",
  LIVRE: "pill-success",
  ANNULE: "pill-danger",
};

/**
 * Fiche d'un chef de projet.
 *
 * Trois chiffres : ce qu'il porte, ce qu'il a livré, ce qu'il pilote. Puis
 * chacun de ses projets, avec la vente dont il découle : c'est ce lien qui
 * permet de rapprocher ce qui a été promis au client de ce qui est livré.
 */
export default function FicheChefProjetPage() {
  const { id } = useParams<{ id: string }>();
  const { t, nombre, rang, montant, montantCompact, date } = useLangue();
  const libelles = useLibelles();
  const [fiche, setFiche] = useState<FicheChefProjet | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setFiche(null);
    setErreur(null);
    fetchFicheChefProjet(id)
      .then(setFiche)
      .catch((e) => setErreur(e.message));
  }, [id]);

  useFilAriane("/equipes/projet", t("fp.retour"), fiche?.membre.nomComplet);

  if (erreur) {
    return (
      <div className="card">
        <div className="empty">
          <div className="empty-icon">
            <IconAlert />
          </div>
          <div className="empty-title">{t("fp.introuvableTitre")}</div>
          <p className="empty-text" style={{ margin: 0 }}>
            {t("fp.introuvableTexte")}
          </p>
        </div>
      </div>
    );
  }

  if (!fiche) {
    return (
      <div className="card">
        <p className="muted-3" style={{ margin: 0 }}>
          {t("commun.chargementDonnees")}
        </p>
      </div>
    );
  }

  const m = fiche.membre;

  /** Tenue de l'échéance, une fois le projet livré. */
  function derive(p: Projet) {
    if (p.joursDeDerive === null) return null;
    if (p.joursDeDerive === 0) return { texte: t("fp.aLHeure"), classe: "num-positif" };
    if (p.joursDeDerive < 0) {
      const n = Math.abs(p.joursDeDerive);
      return { texte: n === 1 ? t("fp.enAvanceUn") : t("fp.enAvance", { n }), classe: "num-positif" };
    }
    return {
      texte: p.joursDeDerive === 1 ? t("fp.deRetardUn") : t("fp.deRetard", { n: p.joursDeDerive }),
      classe: "num-negatif",
    };
  }

  return (
    <>
      <div className="fiche-tete">
        <span className="avatar avatar-xl avatar-projet">{initiales(m.nomComplet)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="fiche-nom">{m.nomComplet}</h1>
          <div className="fiche-meta">
            <span>{m.fonction || libelles.role(m.role)}</span>
            {m.pays && <span className="pill pill-brand">{m.pays}</span>}
            {!m.actif && <span className="pill pill-danger">{t("equipes.inactif")}</span>}
          </div>
          <div className="fiche-sous-meta">{m.email && <span>{m.email}</span>}</div>
        </div>
        {fiche.total > 0 && (
          <div className="fiche-rang">
            <div className="fiche-rang-valeur">
              {t("fp.rang", { rang: rang(fiche.rang), total: fiche.effectifEquipe })}
            </div>
            <div className="fiche-rang-label">{t("fp.chargeEquipe")}</div>
          </div>
        )}
      </div>

      <div className="stat-grid stat-grid-trois">
        <div className="stat stat-riche">
          <div className="stat-riche-haut">
            <div style={{ minWidth: 0 }}>
              <div className="stat-label">{t("fp.enCours")}</div>
              <div className="stat-riche-valeur">{nombre(fiche.ouverts)}</div>
            </div>
            <div className="stat-icone" style={{ background: "#e7f2fa", color: "#155e8e" }}>
              <IconBox size={21} />
            </div>
          </div>
          <div className="stat-riche-bas">
            {/* Les retards ouvrent la tuile : c'est ce qui appelle une décision. */}
            {fiche.enRetard > 0 && (
              <span className="delta delta-baisse">
                {fiche.enRetard === 1 ? t("ep.retardUn") : t("ep.retardN", { n: nombre(fiche.enRetard) })}
              </span>
            )}
            <span className="stat-note">
              {fiche.ouverts === 0
                ? t("fp.enCoursNoteVide")
                : t("fp.enCoursNote", { budget: montantCompact(fiche.budgetOuvert) })}
            </span>
          </div>
        </div>

        <div className="stat stat-riche">
          <div className="stat-riche-haut">
            <div style={{ minWidth: 0 }}>
              <div className="stat-label">{t("fp.livres")}</div>
              <div className="stat-riche-valeur">{nombre(fiche.livres)}</div>
            </div>
            <div className="stat-icone" style={{ background: "#e3f4ed", color: "#0e8a5f" }}>
              <IconCheck size={21} />
            </div>
          </div>
          <div className="stat-riche-bas">
            <span className="stat-note">
              {fiche.respectDelaisPct === null
                ? t("fp.livresNoteVide")
                : t("fp.livresNote", { part: fiche.respectDelaisPct })}
            </span>
          </div>
        </div>

        <div className="stat stat-riche">
          <div className="stat-riche-haut">
            <div style={{ minWidth: 0 }}>
              <div className="stat-label">{t("fp.budget")}</div>
              <div className="stat-riche-valeur" title={montant(fiche.budgetPilote)}>
                {montantCompact(fiche.budgetPilote)}
              </div>
            </div>
            <div className="stat-icone" style={{ background: "#fcf2e0", color: "#9e6b06" }}>
              <IconCoins size={21} />
            </div>
          </div>
          <div className="stat-riche-bas">
            <span className="stat-note">
              {fiche.total === 1 ? t("fp.budgetNoteUn") : t("fp.budgetNote", { n: nombre(fiche.total) })}
            </span>
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("fp.listeTitre")}</div>
            <div className="card-sub">{t("fp.listeSousTitre", { n: nombre(fiche.total) })}</div>
          </div>
          {fiche.avancementMoyenPct !== null && (
            <span className="tag">{t("fp.avancementMoyen", { n: fiche.avancementMoyenPct })}</span>
          )}
        </div>

        {fiche.projets.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("fp.videTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("fp.videTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("fp.colProjet")}</th>
                  <th>{t("fp.colStatut")}</th>
                  <th>{t("fp.colAvancement")}</th>
                  <th>{t("fp.colEcheance")}</th>
                  <th>{t("fp.colBudget")}</th>
                </tr>
              </thead>
              <tbody>
                {fiche.projets.map((p) => {
                  const d = derive(p);
                  return (
                    <tr key={p.id} className={p.enRetard ? "ligne-alerte" : undefined}>
                      <td className="td-main">
                        <div className="cc-name">{p.nom}</div>
                        {p.produit && (
                          <div className="cc-sub">
                            {t("fp.issuDe", { produit: p.produit, vendeur: p.vendeurNom ?? "-" })}
                          </div>
                        )}
                      </td>
                      <td data-label={t("fp.colStatut")}>
                        <span className={`pill ${TEINTE_STATUT[p.statut]}`}>
                          {t(`statutProjet.${p.statut}` as CleTraduction)}
                        </span>
                      </td>
                      <td data-label={t("fp.colAvancement")}>
                        <div className="avancement">
                          <div className="avancement-rail">
                            <div
                              className={`avancement-jauge${p.enRetard ? " en-retard" : ""}`}
                              style={{ width: `${p.avancementPct}%` }}
                            />
                          </div>
                          <span className="avancement-valeur">{p.avancementPct}%</span>
                        </div>
                      </td>
                      <td data-label={t("fp.colEcheance")}>
                        <div>{date(p.dateFinPrevue)}</div>
                        {p.enRetard ? (
                          <div className="cc-sub num-negatif">{t("fp.echeanceDepassee")}</div>
                        ) : (
                          d && <div className={`cc-sub ${d.classe}`}>{d.texte}</div>
                        )}
                      </td>
                      <td className="num" data-label={t("fp.colBudget")} title={montant(p.budget)}>
                        {montantCompact(p.budget)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
