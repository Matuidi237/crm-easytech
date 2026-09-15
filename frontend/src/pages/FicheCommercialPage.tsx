import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FicheCommercial, fetchFicheCommercial } from "../api";
import { useLangue, useLibelles } from "../i18n";
import { useFilAriane } from "../ContexteEntete";
import { EvolutionMensuelle } from "../components/Charts";
import { IconAlert, IconCoins, IconInbox, IconTrend } from "../components/Icons";

function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

/**
 * Fiche d'un commercial.
 *
 * Trois chiffres qui tiennent en un regard, puis la matière qui les explique :
 * son évolution, puis chacune de ses ventes. Une commission se conteste, elle
 * doit donc être vérifiable ligne à ligne et pas seulement en total.
 */
export default function FicheCommercialPage() {
  const { id } = useParams<{ id: string }>();
  const { t, nombre, rang, montant, montantCompact, date, dateHeure, locale } = useLangue();
  const libelles = useLibelles();
  const [fiche, setFiche] = useState<FicheCommercial | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setFiche(null);
    setErreur(null);
    fetchFicheCommercial(id)
      .then(setFiche)
      .catch((e) => setErreur(e.message));
  }, [id]);

  /* Le retour et le nom remontent dans la barre du haut, dont la moitié gauche
     est libre sur cette page. Appelé avant tout retour anticipé : c'est un
     hook, et il doit s'exécuter même pendant le chargement pour que la sortie
     reste disponible si la fiche échoue. */
  useFilAriane("/equipes/commerciale", t("fc.retour"), fiche?.membre.nomComplet);

  if (erreur) {
    return (
      <>
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <IconAlert />
            </div>
            <div className="empty-title">{t("fc.introuvableTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("fc.introuvableTexte")}
            </p>
          </div>
        </div>
      </>
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
  const aUnTaux = fiche.commissions !== null && m.tauxCommissionPct !== null;

  return (
    <>
      {/* Entête d'identité : qui est cette personne, avant ce qu'elle produit. */}
      <div className="fiche-tete">
        <span className="avatar avatar-xl">{initiales(m.nomComplet)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="fiche-nom">{m.nomComplet}</h1>
          <div className="fiche-meta">
            <span>{m.fonction || libelles.role(m.role)}</span>
            {m.pays && <span className="pill pill-brand">{m.pays}</span>}
            {!m.actif && <span className="pill pill-danger">{t("equipes.inactif")}</span>}
          </div>
          <div className="fiche-sous-meta">
            {m.email && <span>{m.email}</span>}
            <span>
              {m.responsable ? t("fc.rattacheA", { nom: m.responsable.nomComplet }) : t("fc.sansResponsable")}
            </span>
          </div>
        </div>
        {fiche.nbVentes > 0 && (
          <div className="fiche-rang">
            <div className="fiche-rang-valeur">
              {t("fc.rang", { rang: rang(fiche.rang), total: fiche.effectifEquipe })}
            </div>
            <div className="fiche-rang-label">{t("fc.partEquipe", { part: fiche.partEquipePct })}</div>
          </div>
        )}
      </div>

      <div className="stat-grid stat-grid-trois">
        <div className="stat stat-riche">
          <div className="stat-riche-haut">
            <div style={{ minWidth: 0 }}>
              <div className="stat-label">{t("fc.ca")}</div>
              <div className="stat-riche-valeur" title={montant(fiche.chiffreAffaires)}>
                {montantCompact(fiche.chiffreAffaires)}
              </div>
            </div>
            <div className="stat-icone" style={{ background: "#e2f4f1", color: "#0c8074" }}>
              <IconTrend size={21} />
            </div>
          </div>
          <div className="stat-riche-bas">
            <span className="stat-note">
              {fiche.nbVentes === 1
                ? t("fc.caNoteUn")
                : t("fc.caNote", { n: nombre(fiche.nbVentes), clients: nombre(fiche.nbClients) })}
            </span>
          </div>
        </div>

        <div className="stat stat-riche">
          <div className="stat-riche-haut">
            <div style={{ minWidth: 0 }}>
              <div className="stat-label">{t("fc.benefice")}</div>
              <div
                className={`stat-riche-valeur ${fiche.benefice >= 0 ? "" : "valeur-negative"}`}
                title={montant(fiche.benefice)}
              >
                {montantCompact(fiche.benefice)}
              </div>
            </div>
            <div className="stat-icone" style={{ background: "#eeebfa", color: "#5b4bc4" }}>
              <IconCoins size={21} />
            </div>
          </div>
          <div className="stat-riche-bas">
            <span className="stat-note">{t("fc.beneficeNote", { marge: fiche.margePct })}</span>
          </div>
        </div>

        {/* Sans taux fixé, on affiche « taux non défini » et non zéro : les deux
            ne veulent pas dire la même chose, et un zéro se lirait comme un
            commercial qui n'aurait rien touché. */}
        <div className="stat stat-riche">
          <div className="stat-riche-haut">
            <div style={{ minWidth: 0 }}>
              <div className="stat-label">{t("fc.commissions")}</div>
              <div
                className={`stat-riche-valeur${aUnTaux ? "" : " texte muted-3"}`}
                title={aUnTaux ? montant(fiche.commissions as number) : undefined}
              >
                {aUnTaux ? montantCompact(fiche.commissions as number) : t("fc.commissionsAbsentes")}
              </div>
            </div>
            <div className="stat-icone" style={{ background: "#fcf2e0", color: "#9e6b06" }}>
              <IconCoins size={21} />
            </div>
          </div>
          <div className="stat-riche-bas">
            <span className="stat-note">
              {aUnTaux ? t("fc.commissionsNote", { taux: m.tauxCommissionPct as number }) : t("fc.commissionsAbsentesNote")}
            </span>
          </div>
        </div>
      </div>

      {fiche.nbVentes > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("fc.evolutionTitre")}</div>
              <div className="card-sub">{t("fc.evolutionSousTitre")}</div>
            </div>
          </div>
          <EvolutionMensuelle
            points={fiche.parMois.map((p) => ({
              ...p,
              libelle: new Date(`${p.mois}-01T00:00:00`).toLocaleDateString(locale, { month: "short" }),
            }))}
          />
        </div>
      )}

      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("fc.historiqueTitre")}</div>
            <div className="card-sub">{t("fc.historiqueSousTitre", { n: nombre(fiche.nbVentes) })}</div>
          </div>
          {fiche.derniereVente && <span className="tag">{date(fiche.derniereVente)}</span>}
        </div>

        {fiche.ventes.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("fc.historiqueVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("fc.historiqueVideTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("fc.colDate")}</th>
                  <th>{t("fc.colClient")}</th>
                  <th>{t("fc.colProduit")}</th>
                  <th>{t("fc.colQuantite")}</th>
                  <th>{t("fc.colMontant")}</th>
                  <th>{t("fc.colBenefice")}</th>
                  <th>{t("fc.colCommission")}</th>
                </tr>
              </thead>
              <tbody>
                {fiche.ventes.map((v) => (
                  <tr key={v.id}>
                    <td data-label={t("fc.colDate")}>{dateHeure(v.dateVente)}</td>
                    <td className="td-strong td-main" data-label={t("fc.colClient")}>
                      {v.clientNom}
                    </td>
                    <td data-label={t("fc.colProduit")}>{v.produit}</td>
                    <td className="num" data-label={t("fc.colQuantite")}>
                      {nombre(v.quantite)}
                    </td>
                    <td className="num" data-label={t("fc.colMontant")} title={montant(v.montant)}>
                      {montantCompact(v.montant)}
                    </td>
                    <td
                      className={`num ${v.benefice >= 0 ? "num-positif" : "num-negatif"}`}
                      data-label={t("fc.colBenefice")}
                      title={montant(v.benefice)}
                    >
                      {v.benefice >= 0 ? "+" : ""}
                      {montantCompact(v.benefice)}
                    </td>
                    <td className="num" data-label={t("fc.colCommission")}>
                      {v.commission === null ? (
                        <span className="muted-3">-</span>
                      ) : (
                        <span title={montant(v.commission)}>{montantCompact(v.commission)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
