import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TableauChefProjet, fetchTableauChefProjet } from "../api";
import type { CleTraduction } from "../i18n";
import { useAuth } from "../AuthContext";
import { useLangue } from "../i18n";
import CarteIndicateur, { type Carte } from "../components/CarteIndicateur";
import { BarList, ChargeHebdomadaire, foldTail } from "../components/Charts";
import { IconAlert, IconCheck, IconClock, IconInbox, IconQuote } from "../components/Icons";

/**
 * Tableau de bord du chef de projet.
 *
 * Les autres rôles ouvrent l'outil sur de l'argent. Celui-ci ne vend rien : il
 * reçoit des demandes et doit les rendre à temps. Ses indicateurs mesurent donc
 * de la charge et du temps, et ils sont ordonnés par ce qu'il doit faire dans
 * l'heure, puis par ce qu'il doit tenir sur la semaine.
 *
 * La carte la plus à gauche est la seule qui appelle une action immédiate : des
 * dossiers portent son nom et personne ne les a ouverts. C'est précisément
 * l'attente que les commerciaux reprochaient au fonctionnement précédent, et
 * elle n'était mesurée nulle part.
 */
export default function ChefProjetPage() {
  const { t, nombre, date, locale } = useLangue();
  const { utilisateur } = useAuth();
  const [donnees, setDonnees] = useState<TableauChefProjet | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetchTableauChefProjet()
      .then(setDonnees)
      .catch((e) => setErreur(e.message));
  }, []);

  const entete = (
    <div className="page-head">
      <div>
        <h1>{t("cp.bienvenue", { nom: utilisateur?.nomComplet ?? "" })}</h1>
        <div className="page-sub">{t("cp.sousTitre")}</div>
      </div>
      <Link className="btn btn-primary" to="/cotations">
        {t("cp.ouvrirFile")}
      </Link>
    </div>
  );

  if (erreur) {
    return (
      <>
        {entete}
        <div className="alert alert-error">
          <IconAlert />
          {erreur}
        </div>
      </>
    );
  }

  if (!donnees) {
    return (
      <>
        {entete}
        <div className="card">
          <p className="muted-3" style={{ margin: 0 }}>
            {t("commun.chargementDonnees")}
          </p>
        </div>
      </>
    );
  }

  const { charge, delais, semaines, file, demandeurs } = donnees;
  const chargeTotale = demandeurs.reduce((s, d) => s + d.count, 0);

  /* Un délai s'écrit en heures jusqu'à deux jours, en jours ensuite. « 73,4 h »
     ne se compare à rien de ce qu'un chef de projet a en tête. */
  const delai = (heures: number | null) => {
    if (heures === null) return t("cp.sansMesure");
    if (heures < 48) return t("cp.enHeures", { n: nombre(heures) });
    return t("cp.enJours", { n: nombre(Math.round((heures / 24) * 10) / 10) });
  };

  const enAttenteDeLui = charge.aPrendreEnCharge + charge.enTraitement;

  const cartes: Carte[] = [
    {
      label: t("cp.aPrendreEnCharge"),
      valeur: nombre(charge.aPrendreEnCharge),
      note:
        charge.plusLongueAttenteH === null
          ? t("cp.aucuneAttente")
          : t("cp.attenteNote", { valeur: delai(charge.plusLongueAttenteH) }),
      icone: IconInbox,
      /* Ambre et non rouge : ces dossiers ne sont pas encore en faute, ils
         attendent. Le rouge est réservé au retard effectif, et deux cartes
         rouges côte à côte ne hiérarchisent plus rien. */
      fg: "#9e6b06",
      bg: "#fcf2e0",
      vers: "/cotations",
      libelleLien: t("cp.voirFile"),
    },
    {
      label: t("cp.enTraitement"),
      valeur: nombre(charge.enTraitement),
      note:
        enAttenteDeLui === 0
          ? t("cp.fileVide")
          : t("cp.enTraitementNote", { n: nombre(enAttenteDeLui) }),
      icone: IconQuote,
      fg: "#2a79ae",
      bg: "#e8f3fb",
      vers: "/cotations",
      libelleLien: t("cp.voirFile"),
    },
    {
      label: t("cp.enRetard"),
      valeur: nombre(charge.enRetard),
      note:
        charge.enRetard === 0
          ? t("cp.aucunRetard")
          : t("cp.retardNote", { n: nombre(enAttenteDeLui) }),
      icone: IconAlert,
      fg: charge.enRetard > 0 ? "#b3261e" : "#0c8074",
      bg: charge.enRetard > 0 ? "#fdecea" : "#e2f4f1",
      vers: "/cotations",
      libelleLien: t("cp.voirFile"),
    },
    {
      label: t("cp.tenueDelais"),
      /* Le taux et non le délai moyen : un délai moyen de dix heures ne dit pas
         s'il tenait les échéances annoncées, qui sont la seule promesse faite
         au commercial. Le délai moyen tient dans la note. */
      valeur: delais.tenuePct === null ? t("cp.sansMesure") : `${nombre(delais.tenuePct)} %`,
      valeurTexte: delais.tenuePct === null,
      note:
        delais.nbRendues === 0
          ? t("cp.aucuneRendue")
          : t("cp.tenueNote", {
              n: nombre(delais.nbRendues),
              valeur: delai(delais.chiffrageH),
            }),
      icone: IconCheck,
      fg: "#0c8074",
      bg: "#e2f4f1",
      /* Pas de jauge : la valeur de cette carte EST le pourcentage, et la
         dessiner à côté affichait le même « 75 % » deux fois. Les jauges des
         autres tableaux de bord doublent un montant, pas un taux. */
    },
  ];

  /* Deux délais distincts et pas une moyenne globale : ils accusent deux
     personnes différentes. Le premier est le temps pendant lequel le dossier a
     dormi avant d'être ouvert, le second le temps de chiffrage réel. */
  const qualite = [
    t("cp.ligneReactivite", { valeur: delai(delais.priseEnChargeH) }),
    t("cp.ligneChiffrage", { valeur: delai(delais.chiffrageH) }),
    delais.nbRevisions === 0
      ? t("cp.ligneSansRevision")
      : t("cp.ligneRevisions", { n: nombre(delais.nbRevisions) }),
  ].join(" · ");

  const semainesLisibles = semaines.map((s) => ({
    ...s,
    /* Le lundi de la semaine, en jour et mois court : « 10 nov. » se lit, un
       numéro de semaine ISO ne se situe pas dans l'année. */
    libelle: new Date(`${s.cle}T00:00:00`).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    }),
  }));
  const aDuVolume = semaines.some((s) => s.recues > 0 || s.rendues > 0);

  return (
    <>
      {entete}

      <div className="stat-grid">
        {cartes.map((c) => (
          <CarteIndicateur
            key={c.label}
            {...c}
            libelleVariation={t("dg.depuisMoisDernier")}
            libelleSansVariation={t("dg.pasDeComparaison")}
          />
        ))}
      </div>

      <p className="cot-qualite">{qualite}</p>

      {/* Ce qui attend, avant toute statistique : un tableau de bord qui ouvre
          sur des graphiques oblige à chercher le travail du jour ailleurs. */}
      <div className="table-card">
        <div className="card-head">
          <div>
            <div className="card-title">{t("cp.fileTitre")}</div>
            <div className="card-sub">{t("cp.fileSousTitre")}</div>
          </div>
          <Link className="btn btn-ghost" to="/cotations">
            {t("cp.ouvrirFile")}
          </Link>
        </div>

        {file.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconCheck />
            </div>
            <div className="empty-title">{t("cp.fileVideTitre")}</div>
            <p className="empty-text" style={{ margin: 0 }}>
              {t("cp.fileVideTexte")}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("cp.colReference")}</th>
                  <th>{t("cp.colObjet")}</th>
                  <th>{t("cp.colUrgence")}</th>
                  <th>{t("cp.colStatut")}</th>
                  <th>{t("cp.colEcheance")}</th>
                </tr>
              </thead>
              <tbody>
                {file.map((d) => (
                  <tr key={d.id}>
                    <td data-label={t("cp.colReference")}>
                      {/* Le lien mène à la file ouverte sur le dossier : ouvrir
                          une demande n'est pas la prendre en charge, et la
                          prise en charge reste un bouton explicite. */}
                      <Link className="cot-ref cp-lien" to={`/cotations?demande=${d.id}`}>
                        {d.reference}
                      </Link>
                    </td>
                    <td className="td-strong td-main" data-label={t("cp.colObjet")}>
                      {d.objet}
                      <span className="cot-sous-ligne">
                        {t("cp.pourClient", { client: d.clientNom, commercial: d.commercialNom })}
                      </span>
                    </td>
                    <td data-label={t("cp.colUrgence")}>
                      {d.urgence ? (
                        <span className={`pill pill-urg-${d.urgence.toLowerCase()}`}>
                          {t(`cot.urgence.${d.urgence}` as CleTraduction)}
                        </span>
                      ) : (
                        <span className="muted-3">-</span>
                      )}
                    </td>
                    <td data-label={t("cp.colStatut")}>
                      <span className={`pill pill-cot-${d.statut.toLowerCase()}`}>
                        {t(`cot.statut.${d.statut}` as CleTraduction)}
                      </span>
                    </td>
                    <td data-label={t("cp.colEcheance")}>
                      {date(d.echeanceLe)}
                      {d.enRetard && (
                        <span className="cot-sous-ligne cot-retard">
                          {t("cp.retardJours", { n: nombre(Math.abs(d.joursRestants)) })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aDuVolume && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("cp.chargeTitre")}</div>
              <div className="card-sub">{t("cp.chargeSousTitre")}</div>
            </div>
          </div>
          <ChargeHebdomadaire semaines={semainesLisibles} />
        </div>
      )}

      {demandeurs.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t("cp.demandeursTitre")}</div>
              <div className="card-sub">{t("cp.demandeursSousTitre")}</div>
            </div>
            {/* Le total de la liste, pas celui de l'historique : une étiquette
                qui compte autre chose que les lignes affichées se lit comme
                leur somme et la contredit. */}
            <span className="tag">{t("cp.surTotal", { n: nombre(chargeTotale) })}</span>
          </div>
          <BarList
            data={foldTail(demandeurs, 6, t("dg.autres"))}
            total={chargeTotale}
            unite={t("cp.uniteDemandes")}
          />
        </div>
      )}
    </>
  );
}
