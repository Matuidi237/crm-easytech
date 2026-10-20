import { useEffect, useMemo, useState } from "react";
import { FileSansCout, LigneSansCout, fetchVentesSansCout, renseignerCout } from "../api";
import { useLangue, type CleTraduction } from "../i18n";
import { IconAlert, IconCheck, IconInbox } from "../components/Icons";

/**
 * Commandes en attente de leur prix d'achat.
 *
 * Le circuit d'EasyTech passe par Zoho : le commercial recopie le document
 * que le client a validé, et il ne connaît que le prix de vente. Tant que le
 * coût manque, la commande compte dans le chiffre d'affaires mais reste hors
 * marge, hors classement à la rentabilité et hors commission.
 *
 * Cette page est la contrepartie directe de ce choix. Sans elle, les commandes
 * non chiffrées s'accumuleraient sans que personne ne le sache, et les
 * commerciaux attendraient une commission que rien ne déclenche.
 *
 * La saisie se fait en place, ligne à ligne : ouvrir une fenêtre pour un seul
 * nombre, puis la refermer, pour trente lignes, serait trente fois trop.
 */
export default function ACoutPage() {
  const { t, nombre, montant, montantCompact, date } = useLangue();
  const [file, setFile] = useState<FileSansCout | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  /* Saisies en cours, par ligne : le coût est unitaire, comme le prix de
     vente affiché juste à côté. */
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);

  function recharger() {
    fetchVentesSansCout()
      .then(setFile)
      .catch((e) => setErreur(e.message));
  }

  useEffect(recharger, []);

  const parCommande = useMemo(() => {
    const par = new Map<string, { reference: string | null; lignes: LigneSansCout[] }>();
    for (const l of file?.lignes ?? []) {
      const cle = l.referenceCommande ?? `sans:${l.id}`;
      const groupe = par.get(cle) ?? { reference: l.referenceCommande, lignes: [] };
      groupe.lignes.push(l);
      par.set(cle, groupe);
    }
    return [...par.values()];
  }, [file]);

  /** Marge unitaire prévisible, affichée pendant la frappe. */
  function margeDe(l: LigneSansCout, saisie: string): number | null {
    if (saisie.trim() === "") return null;
    const cout = Number(saisie);
    if (!Number.isFinite(cout) || cout < 0) return null;
    return (l.prixVente - cout) * l.quantite;
  }

  async function valider(l: LigneSansCout) {
    const saisie = saisies[l.id] ?? "";
    const cout = Number(saisie);
    if (saisie.trim() === "" || !Number.isFinite(cout) || cout < 0) return;

    setErreur(null);
    setSucces(null);
    setEnCours(l.id);
    try {
      const r = await renseignerCout(l.id, Math.round(cout));
      setSucces(t("cout.enregistre", { marge: montant(r.benefice ?? 0) }));
      setSaisies((s) => {
        const copie = { ...s };
        delete copie[l.id];
        return copie;
      });
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnCours(null);
    }
  }

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("cout.titre")}</h1>
        <div className="page-sub">{t("cout.sousTitre")}</div>
      </div>
    </div>
  );

  if (!file) {
    return (
      <>
        {entete}
        {erreur ? (
          <div className="alert alert-error">
            <IconAlert />
            {erreur}
          </div>
        ) : (
          <div className="panneau panneau-vide">{t("commun.chargementDonnees")}</div>
        )}
      </>
    );
  }

  return (
    <>
      {entete}

      {erreur && (
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      )}
      {succes && (
        <div className="alert alert-success">
          <IconCheck />
          {succes}
        </div>
      )}

      {file.total === 0 ? (
        <section className="panneau">
          <div className="empty">
            <div className="empty-icon">
              <IconInbox />
            </div>
            <div className="empty-title">{t("cout.videTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("cout.videTexte")}
            </p>
          </div>
        </section>
      ) : (
        <>
          {/* Le poids de la file avant son détail : trente lignes à cent mille
              francs n'appellent pas la même attention qu'une seule à trente
              millions. */}
          <section className="panneau heros">
            <div className="heros-haut">
              <div className="heros-principal">
                <span className="heros-contexte">{t("cout.nEnAttente", { n: nombre(file.total) })}</span>
                <span className="heros-chiffre" title={montant(file.caEnAttente)}>
                  {montantCompact(file.caEnAttente)}
                </span>
                <span className="heros-appui">{t("cout.caEnAttente", { montant: montant(file.caEnAttente) })}</span>
              </div>
            </div>
          </section>

          {parCommande.map((c) => (
            <section className="panneau" key={c.reference ?? c.lignes[0].id}>
              <header className="panneau-tete">
                <h2>{c.reference ?? t("ve.aChiffrer")}</h2>
                <span className="panneau-note">
                  {c.lignes[0].clientNom}
                  {" · "}
                  {c.lignes[0].vendeurNom}
                  {" · "}
                  {date(c.lignes[0].dateVente)}
                </span>
              </header>

              <div className="table-scroll">
                <table className="table-nue">
                  <thead>
                    <tr>
                      <th>{t("fc.colProduit")}</th>
                      <th>{t("cm.colNature")}</th>
                      <th className="num">{t("ve.quantite")}</th>
                      <th className="num">{t("cout.colPrixVente")}</th>
                      <th className="num">{t("cout.colPrixAchat")}</th>
                      <th className="num">{t("cout.colMarge")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {c.lignes.map((l) => {
                      const saisie = saisies[l.id] ?? "";
                      const marge = margeDe(l, saisie);
                      return (
                        <tr key={l.id}>
                          <td className="td-strong td-main" data-label={t("fc.colProduit")}>
                            {l.produit}
                          </td>
                          <td data-label={t("cm.colNature")}>{t(`nature.${l.nature}` as CleTraduction)}</td>
                          <td className="num" data-label={t("ve.quantite")}>
                            {nombre(l.quantite)}
                          </td>
                          <td className="num" data-label={t("cout.colPrixVente")} title={montant(l.montant)}>
                            {montantCompact(l.prixVente)}
                          </td>
                          <td className="num" data-label={t("cout.colPrixAchat")}>
                            <div className="champ-montant champ-cout">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                value={saisie}
                                onChange={(e) => setSaisies((s) => ({ ...s, [l.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") valider(l);
                                }}
                                placeholder="0"
                                aria-label={`${t("cout.colPrixAchat")} ${l.produit}`}
                              />
                              <span className="champ-suffixe">XAF</span>
                            </div>
                          </td>
                          {/* La marge se calcule pendant la frappe : une marge
                              négative se voit ici, pas dans le bilan du mois. */}
                          <td
                            className={`num ${marge === null ? "" : marge >= 0 ? "num-positif" : "num-negatif"}`}
                            data-label={t("cout.colMarge")}
                          >
                            {marge === null ? <span className="muted-3">—</span> : montantCompact(marge)}
                          </td>
                          <td className="num">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => valider(l)}
                              disabled={enCours === l.id || marge === null}
                            >
                              <IconCheck size={14} />
                              {t("cout.enregistrer")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
