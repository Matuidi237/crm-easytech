import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  PERIODES,
  PeriodeObjectif,
  StatutCotation,
  SuiviCommercial as Suivi,
  enregistrerObjectif,
  fetchSuiviCommercial,
} from "../api";
import { useAuth } from "../AuthContext";
import { useLangue, type CleTraduction } from "../i18n";
import ListeDeroulante from "./ListeDeroulante";
import { IconAlert, IconCheck, IconClose, IconPlus, IconSend } from "./Icons";

/** Date du jour au format attendu par un champ date, dans le fuseau local. */
function aujourdhui() {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 540 devient « 09:00 ». */
function heure(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const FORMULAIRE_VIDE = {
  titre: "",
  periode: "MOIS" as PeriodeObjectif,
  date: aujourdhui(),
  cibleCaXAF: "",
  cibleVentes: "",
  cibleRendezVous: "",
};

/**
 * Ce qu'un encadrant suit chez l'un de ses commerciaux.
 *
 * Quatre questions dans l'ordre où elles se posent : ce qu'on lui a demandé,
 * ce qu'il fait de ses journées, ce qu'il attend des autres, et ce qu'il a en
 * main. Les chiffres de vente ne sont pas ici, ils occupent déjà le haut de
 * la fiche.
 *
 * Seul le premier bloc se modifie. Les trois autres se regardent : un
 * responsable n'a pas à remplir la feuille de temps de son commercial ni à
 * répondre à ses cotations à sa place.
 */
export default function SuiviCommercial({ id, nom }: { id: string; nom: string }) {
  const { t, nombre, montant, montantCompact, date } = useLangue();
  const { peut } = useAuth();
  const [suivi, setSuivi] = useState<Suivi | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [form, setForm] = useState(FORMULAIRE_VIDE);

  const peutFixer = peut("utilisateurs.gerer");

  const recharger = useCallback(() => {
    fetchSuiviCommercial(id)
      .then(setSuivi)
      .catch((e) => setErreur((e as Error).message));
  }, [id]);

  useEffect(() => {
    setSuivi(null);
    recharger();
  }, [recharger]);

  /* Les créneaux arrivent à plat ; l'agenda se lit par journée. */
  const journees = useMemo(() => {
    const parJour = new Map<string, Suivi["agenda"]["creneaux"]>();
    for (const c of suivi?.agenda.creneaux ?? []) {
      const cle = c.jour.slice(0, 10);
      if (!parJour.has(cle)) parJour.set(cle, []);
      parJour.get(cle)!.push(c);
    }
    return [...parJour.entries()];
  }, [suivi]);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const nombreOuNull = (v: string) => (v.trim() === "" ? null : Number(v));
    const ca = nombreOuNull(form.cibleCaXAF);
    const ventes = nombreOuNull(form.cibleVentes);
    const rdv = nombreOuNull(form.cibleRendezVous);
    /* Le serveur refuse aussi, mais buter sur une erreur après l'envoi est une
       façon désagréable d'apprendre une règle évidente. */
    if (ca === null && ventes === null && rdv === null) {
      setErreur(t("suivi.auMoinsUneCible"));
      return;
    }
    setErreur(null);
    setEnvoi(true);
    try {
      await enregistrerObjectif({
        titre: form.titre.trim(),
        description: "",
        periode: form.periode,
        date: form.date,
        cibleCaXAF: ca,
        cibleVentes: ventes,
        cibleRendezVous: rdv,
        note: "",
        pourUtilisateurId: id,
      });
      setSucces(t("suivi.objectifEnregistre", { nom }));
      setOuvert(false);
      setForm(FORMULAIRE_VIDE);
      recharger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  if (!suivi) {
    return erreur ? (
      <div className="alert alert-error">
        <IconAlert />
        {erreur}
      </div>
    ) : (
      <div className="panneau panneau-vide">{t("commun.chargementDonnees")}</div>
    );
  }

  const libellePeriode = (p: PeriodeObjectif) => t(`periode.${p}` as CleTraduction);
  const libelleStatut = (s: StatutCotation) => t(`cot.statut.${s}` as CleTraduction);

  return (
    <>
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

      {/* --- Objectifs, le seul bloc qu'on modifie ------------------------ */}
      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("suivi.objectifsTitre")}</div>
            <div className="card-sub">{t("suivi.objectifsSousTitre")}</div>
          </div>
          {peutFixer && !ouvert && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setOuvert(true)}>
              <IconPlus size={15} />
              {t("suivi.fixer")}
            </button>
          )}
        </div>

        {ouvert && (
          <form className="suivi-forme" onSubmit={soumettre}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="suivi-titre">{t("suivi.titreObjectif")}</label>
                <input
                  id="suivi-titre"
                  value={form.titre}
                  onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))}
                  placeholder={t("suivi.titrePlaceholder")}
                  maxLength={120}
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="suivi-periode">{t("suivi.periode")}</label>
                <ListeDeroulante
                  id="suivi-periode"
                  valeur={libellePeriode(form.periode)}
                  options={PERIODES.map(libellePeriode)}
                  onChange={(l) =>
                    setForm((f) => ({
                      ...f,
                      periode: PERIODES.find((p) => libellePeriode(p) === l) ?? "MOIS",
                    }))
                  }
                />
              </div>
            </div>

            <div className="form-grid form-grid-trois">
              <div className="field">
                <label htmlFor="suivi-date">{t("suivi.aPartirDu")}</label>
                <input
                  id="suivi-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="suivi-ca">{t("suivi.cibleCa")}</label>
                <div className="champ-montant">
                  <input
                    id="suivi-ca"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={form.cibleCaXAF}
                    onChange={(e) => setForm((f) => ({ ...f, cibleCaXAF: e.target.value }))}
                    placeholder="0"
                  />
                  <span className="champ-suffixe">XAF</span>
                </div>
              </div>
              <div className="field">
                <label htmlFor="suivi-ventes">{t("suivi.cibleVentes")}</label>
                <input
                  id="suivi-ventes"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.cibleVentes}
                  onChange={(e) => setForm((f) => ({ ...f, cibleVentes: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="suivi-rdv">{t("suivi.cibleRdv")}</label>
              <input
                id="suivi-rdv"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={form.cibleRendezVous}
                onChange={(e) => setForm((f) => ({ ...f, cibleRendezVous: e.target.value }))}
                placeholder="0"
              />
              <div className="field-hint">{t("suivi.ciblesAide")}</div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setOuvert(false);
                  setForm(FORMULAIRE_VIDE);
                }}
              >
                <IconClose size={15} />
                {t("commun.annuler")}
              </button>
              <button type="submit" className="btn btn-primary" disabled={envoi}>
                <IconSend size={15} />
                {envoi ? t("ag.ajoutEnCours") : t("suivi.enregistrer")}
              </button>
            </div>
          </form>
        )}

        {suivi.objectifs.length === 0 ? (
          <p className="suivi-vide">{t("suivi.objectifsVide")}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("suivi.periode")}</th>
                  <th>{t("suivi.titreObjectif")}</th>
                  <th className="num">{t("suivi.cibleCa")}</th>
                  <th className="num">{t("suivi.cibleVentes")}</th>
                  <th className="num">{t("suivi.cibleRdv")}</th>
                  <th>{t("suivi.origine")}</th>
                </tr>
              </thead>
              <tbody>
                {suivi.objectifs.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <span className="td-strong">{libellePeriode(o.periode)}</span>
                      <span className="suivi-sous">{date(o.debut)}</span>
                    </td>
                    <td>{o.titre ?? <span className="muted-3">—</span>}</td>
                    <td className="num" title={o.cibleCaXAF !== null ? montant(o.cibleCaXAF) : undefined}>
                      {o.cibleCaXAF === null ? "—" : montantCompact(o.cibleCaXAF)}
                    </td>
                    <td className="num">{o.cibleVentes ?? "—"}</td>
                    <td className="num">{o.cibleRendezVous ?? "—"}</td>
                    <td>
                      {/* Qui engage qui : un objectif qu'on s'est donné soi-même
                          et un objectif reçu ne se discutent pas pareil. */}
                      {o.fixeParEncadrement ? (
                        <span className="pill pill-brand">{t("suivi.parEncadrement")}</span>
                      ) : (
                        <span className="muted-3">{t("suivi.personnel")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Agenda ------------------------------------------------------ */}
      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("suivi.agendaTitre")}</div>
            <div className="card-sub">
              {t("suivi.agendaSousTitre", {
                debut: date(suivi.agenda.debut),
                fin: date(suivi.agenda.fin),
              })}
            </div>
          </div>
        </div>

        {journees.length === 0 ? (
          <p className="suivi-vide">{t("suivi.agendaVide")}</p>
        ) : (
          <ul className="suivi-agenda">
            {journees.map(([jour, creneaux]) => (
              <li key={jour}>
                <span className="suivi-jour">{date(jour)}</span>
                <ul className="suivi-creneaux">
                  {creneaux.map((c) => (
                    <li key={c.id}>
                      <span className="suivi-heure">
                        {heure(c.debutMinutes)} – {heure(c.finMinutes)}
                      </span>
                      <span className="suivi-activite">{c.activite}</span>
                      {c.clientNom && <span className="suivi-sous">{c.clientNom}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- Demandes de cotation ---------------------------------------- */}
      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("suivi.cotationsTitre")}</div>
            <div className="card-sub">{t("suivi.cotationsSousTitre")}</div>
          </div>
        </div>

        {suivi.cotations.length === 0 ? (
          <p className="suivi-vide">{t("suivi.cotationsVide")}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("cot.colReference")}</th>
                  <th>{t("cot.colObjet")}</th>
                  <th>{t("cot.colResponsable")}</th>
                  <th>{t("cot.colEcheance")}</th>
                  <th>{t("cot.colStatut")}</th>
                </tr>
              </thead>
              <tbody>
                {suivi.cotations.map((c) => (
                  <tr key={c.id}>
                    <td className="suivi-ref">{c.reference}</td>
                    <td>
                      <span className="td-strong">{c.objet}</span>
                      <span className="suivi-sous">{c.clientNom}</span>
                    </td>
                    <td>{c.responsableNom ?? <span className="muted-3">{t("cot.nonAffectee")}</span>}</td>
                    <td className={c.enRetard ? "suivi-retard" : undefined}>{date(c.echeanceLe)}</td>
                    <td>
                      <span className={`pill pill-cot-${c.statut.toLowerCase()}`}>
                        {libelleStatut(c.statut)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Portefeuille ------------------------------------------------ */}
      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("suivi.portefeuilleTitre")}</div>
            <div className="card-sub">
              {suivi.portefeuille.total === 1
                ? t("suivi.portefeuilleUn")
                : t("suivi.portefeuilleSousTitre", { n: nombre(suivi.portefeuille.total) })}
            </div>
          </div>
        </div>

        {suivi.portefeuille.clients.length === 0 ? (
          <p className="suivi-vide">{t("suivi.portefeuilleVide")}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("fc.colClient")}</th>
                  <th>{t("suivi.colPays")}</th>
                  <th>{t("suivi.colSecteur")}</th>
                  <th className="num">{t("suivi.colCa")}</th>
                </tr>
              </thead>
              <tbody>
                {suivi.portefeuille.clients.map((c) => (
                  <tr key={c.id}>
                    <td className="td-strong">{c.nom}</td>
                    <td>{c.pays ?? <span className="muted-3">—</span>}</td>
                    <td>{c.secteurActivite ?? <span className="muted-3">—</span>}</td>
                    <td className="num">
                      {c.chiffreAffaires === null ? "—" : montantCompact(c.chiffreAffaires)}
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
