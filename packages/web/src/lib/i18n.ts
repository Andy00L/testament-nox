/**
 * Every word the interface says, in both languages it speaks.
 *
 * French is the default because the event is French-community heavy; English exists because
 * the judges are not. `english` is typed as `typeof french`, so a string added to one and
 * forgotten in the other is a compile error rather than a hole a visitor finds.
 *
 * Entries that need a value interpolated are functions, so no component ever concatenates
 * a sentence out of fragments (which is how translations end up with the words in the wrong
 * order).
 */

export type Language = "fr" | "en";

export const LANGUAGES: readonly Language[] = ["fr", "en"];

const french = {
  languageName: "Français",
  otherLanguageName: "English",
  switchTo: "Passer en anglais",

  nav: {
    home: "Accueil",
  },

  wallet: {
    connect: "Connecter",
    disconnect: "Se déconnecter",
    none: "Aucun portefeuille détecté",
  },

  sound: {
    enable: "Écouter les carillons",
    disable: "Couper le son",
  },

  word: {
    pinyin: "chuánchéng",
    gloss: "ce qui se transmet",
  },

  scene: {
    headlineFirst: "Votre Safe vous survivra.",
    headlineSecond: "Vos clés, non.",
    lede: "Les héritiers et les parts restent chiffrés. Vous envoyez un signe de vie. Le jour où le silence dure trop longtemps, le Safe paie.",
    write: "Écrire le testament",
    heir: "Je suis un héritier",
  },

  status: {
    notDeployed: "Contrats non déployés sur ce réseau.",
    reading: "Lecture de la chaîne…",
    releasedLede: "Le vent est tombé. Le testament est ouvert et attend son exécution.",
    goToDoor: "Aller à la porte",
    windFell: "Le vent est tombé.",
    windFallsIn: (remaining: string) => `Le vent tombe dans ${remaining}.`,
    safeWillPay: (safe: string) => ({
      before: "Le Safe ",
      link: safe,
      after: " paiera vos héritiers si le silence dure.",
    }),
  },

  heartbeat: {
    idle: "Donner un signe de vie",
    holding: "Ne relâchez pas…",
    signing: "Signature en attente…",
    confirming: "Le vent se lève…",
    hint: "Maintenir jusqu'à ce que le vent se lève.",
  },

  write: {
    title: "Écrire le testament",
    lede: "Ce que vous inscrivez ici est chiffré dans votre navigateur avant de partir. La chaîne ne verra que des pointeurs. Personne ne peut lire ce testament, sauf vous, jusqu'au jour où le silence l'ouvre.",
    back: "Revenir à la porte",
    heirsTitle: "Les héritiers",
    heirsLede:
      "Huit lignes au maximum. Les lignes que vous ne remplissez pas sont chiffrées comme les autres, si bien que la chaîne ne révèle pas combien de personnes vous avez nommées.",
    heirLabel: (index: number) => `Héritier ${index}`,
    shareLabel: "Part",
    remove: "Retirer",
    addHeir: "Ajouter un héritier",
    allocated: (total: number) => `${total} % attribués sur 100`,
    vaultTitle: "Le coffre et le silence",
    safeLabel: "Adresse du Safe",
    safeHintDefault: "Le Safe qui paiera. Il reste intact : rien n'y est modifié.",
    safeHintEnabled: "Le module est déjà activé sur ce Safe.",
    safeHintDisabled: "Le module n'est pas encore activé. Deuxième étape, après le sceau.",
    intervalLabel: "Intervalle",
    intervalHint: (minimum: number) =>
      `Minimum ${minimum} s. Le temps entre deux signes de vie.`,
    graceLabel: "Délai de grâce",
    graceHint: "Le silence supplémentaire toléré avant l'ouverture.",
    invalidAddress: "Adresse invalide.",
    openPassageTitle: "Ouvrir le passage",
    openPassageLede:
      "Le registre ne détient aucun fonds. Pour qu'il puisse faire payer le Safe le moment venu, activez le module une seule fois.",
    enableModule: "Activer le module sur le Safe",
    enablingModule: "Activation…",
    moduleEnabled: "Module activé. Le passage est ouvert.",
    viewTransaction: "Voir la transaction sur Etherscan",
    connectFirst: "Connectez un portefeuille sur Sepolia.",
  },

  seal: {
    idle: "Presser le sceau",
    sealed: "Testament scellé",
    idleLede: "Chiffre le testament et l'inscrit dans le registre. Irréversible.",
    sealedLede: "Les héritiers et les parts sont chiffrés on-chain.",
    encrypting: "Chiffrement des huit lignes…",
    signing: "Signature en attente…",
    confirming: "Inscription dans le registre…",
  },

  door: {
    notConfigured: "Contrats non configurés.",
    reading: "Lecture de la chaîne…",
    none: "Aucun testament n'a encore été scellé ici.",
    revokedTitle: "La porte a été murée.",
    revokedLede: "Ce testament a été révoqué par son auteur. Rien ne s'ouvrira.",
    closedTitle: "La porte est fermée.",
    closedLede:
      "Quelqu'un envoie encore des signes de vie. Ce que contient ce testament, qui y est nommé et pour quelle part, personne ne peut le lire, et cette page ne le sait pas davantage que vous.",
    windFallsIn: (remaining: string) => `Le vent tombe dans ${remaining}.`,
    expiredTitle: "Le vent est tombé.",
    expiredLede:
      "Le silence a duré plus longtemps que prévu. N'importe qui peut maintenant ouvrir ce testament : l'ouverture ne donne aucun privilège à celui qui la déclenche.",
    openIt: "Ouvrir le testament",
    opening: "Ouverture…",
    openingTitle: "La porte s'ouvre.",
    openedTitle: "La porte est ouverte.",
    openedLede:
      "Le testament a été déchiffré. Chaque part est vérifiée on-chain avant le moindre paiement, si bien que la personne qui déclenche l'exécution ne peut rien changer à ce qui a été écrit.",
    decrypting: "Déchiffrement du testament ouvert…",
    you: " · vous",
    yourShare: (share: number) => `Vous héritez de ${share} % de ce coffre.`,
    execute: "Déclencher le paiement",
    executing: "Vérification des preuves…",
    paid: "Le coffre a payé. Chaque part est partie à son adresse.",
    connectToOpen: "Connectez un portefeuille pour ouvrir la porte.",
    connectToExecute: "Connectez un portefeuille pour déclencher le paiement.",
    back: "Revenir devant la porte",
    viewTransaction: "Voir la transaction sur Etherscan",
  },

  /** Units for the one remaining-time line. Kept short: this is prose, not a widget. */
  duration: {
    days: "j",
    hours: "h",
    minutes: "min",
    seconds: "s",
    fallen: "le vent est tombé",
  },

  errors: {
    notConnected: "Connectez un portefeuille pour continuer.",
    encryptionFailed: (detail: string) => `Le chiffrement a échoué : ${detail}`,
    slotDetail: (index: number, message: string) => `emplacement ${index} : ${message}`,
    transactionRejected: "La transaction a été rejetée.",
    releaseRejected: "L'ouverture a été rejetée.",
    payoutRejected: "Le paiement a été rejeté.",
    safeRejectedModule:
      "Le Safe a rejeté l'activation. Vérifiez que le portefeuille connecté est bien propriétaire du Safe et que le seuil est de 1.",
  },
};

const english: typeof french = {
  languageName: "English",
  otherLanguageName: "Français",
  switchTo: "Switch to French",

  nav: {
    home: "Home",
  },

  wallet: {
    connect: "Connect",
    disconnect: "Disconnect",
    none: "No wallet detected",
  },

  sound: {
    enable: "Play the chimes",
    disable: "Mute",
  },

  word: {
    pinyin: "chuánchéng",
    gloss: "what is passed on",
  },

  scene: {
    headlineFirst: "Your Safe will outlive you.",
    headlineSecond: "Your keys will not.",
    lede: "Heirs and shares stay encrypted. You send a sign of life. The day the silence lasts too long, the Safe pays.",
    write: "Write the testament",
    heir: "I am an heir",
  },

  status: {
    notDeployed: "Contracts are not deployed on this network.",
    reading: "Reading the chain…",
    releasedLede: "The wind has fallen. The testament is open and waiting to be executed.",
    goToDoor: "Go to the door",
    windFell: "The wind has fallen.",
    windFallsIn: (remaining: string) => `The wind falls in ${remaining}.`,
    safeWillPay: (safe: string) => ({
      before: "Safe ",
      link: safe,
      after: " will pay your heirs if the silence lasts.",
    }),
  },

  heartbeat: {
    idle: "Send a sign of life",
    holding: "Keep holding…",
    signing: "Waiting for your signature…",
    confirming: "The wind is rising…",
    hint: "Hold until the wind rises.",
  },

  write: {
    title: "Write the testament",
    lede: "What you write here is encrypted in your browser before it leaves. The chain will only ever see pointers. Nobody can read this testament but you, until the day the silence opens it.",
    back: "Back to the door",
    heirsTitle: "The heirs",
    heirsLede:
      "Eight lines at most. The lines you leave empty are encrypted exactly like the others, so the chain never reveals how many people you named.",
    heirLabel: (index: number) => `Heir ${index}`,
    shareLabel: "Share",
    remove: "Remove",
    addHeir: "Add an heir",
    allocated: (total: number) => `${total} % of 100 allocated`,
    vaultTitle: "The vault and the silence",
    safeLabel: "Safe address",
    safeHintDefault: "The Safe that will pay. It stays untouched: nothing in it is modified.",
    safeHintEnabled: "The module is already enabled on this Safe.",
    safeHintDisabled: "The module is not enabled yet. Second step, after the seal.",
    intervalLabel: "Interval",
    intervalHint: (minimum: number) =>
      `Minimum ${minimum} s. The time between two signs of life.`,
    graceLabel: "Grace period",
    graceHint: "The extra silence tolerated before the will opens.",
    invalidAddress: "Invalid address.",
    openPassageTitle: "Open the passage",
    openPassageLede:
      "The registry holds no funds. So that it can make the Safe pay when the time comes, enable the module once.",
    enableModule: "Enable the module on the Safe",
    enablingModule: "Enabling…",
    moduleEnabled: "Module enabled. The passage is open.",
    viewTransaction: "View the transaction on Etherscan",
    connectFirst: "Connect a wallet on Sepolia.",
  },

  seal: {
    idle: "Press the seal",
    sealed: "Testament sealed",
    idleLede: "Encrypts the testament and writes it into the registry. Irreversible.",
    sealedLede: "Heirs and shares are encrypted on-chain.",
    encrypting: "Encrypting the eight lines…",
    signing: "Waiting for your signature…",
    confirming: "Writing into the registry…",
  },

  door: {
    notConfigured: "Contracts are not configured.",
    reading: "Reading the chain…",
    none: "No testament has been sealed here yet.",
    revokedTitle: "The door has been walled up.",
    revokedLede: "This testament was revoked by its author. Nothing will open.",
    closedTitle: "The door is closed.",
    closedLede:
      "Someone is still sending signs of life. What this testament contains, who is named in it and for what share, nobody can read, and this page knows no more about it than you do.",
    windFallsIn: (remaining: string) => `The wind falls in ${remaining}.`,
    expiredTitle: "The wind has fallen.",
    expiredLede:
      "The silence lasted longer than it was allowed to. Anyone can open this testament now: opening it grants no privilege to whoever does.",
    openIt: "Open the testament",
    opening: "Opening…",
    openingTitle: "The door is opening.",
    openedTitle: "The door is open.",
    openedLede:
      "The testament has been decrypted. Every share is verified on-chain before a single payment, so whoever triggers the execution cannot change anything that was written.",
    decrypting: "Decrypting the opened testament…",
    you: " · you",
    yourShare: (share: number) => `You inherit ${share} % of this vault.`,
    execute: "Trigger the payout",
    executing: "Verifying the proofs…",
    paid: "The vault has paid. Every share went to its address.",
    connectToOpen: "Connect a wallet to open the door.",
    connectToExecute: "Connect a wallet to trigger the payout.",
    back: "Back to the door",
    viewTransaction: "View the transaction on Etherscan",
  },

  duration: {
    days: "d",
    hours: "h",
    minutes: "min",
    seconds: "s",
    fallen: "the wind has fallen",
  },

  errors: {
    notConnected: "Connect a wallet to continue.",
    encryptionFailed: (detail: string) => `Encryption failed: ${detail}`,
    slotDetail: (index: number, message: string) => `slot ${index}: ${message}`,
    transactionRejected: "The transaction was rejected.",
    releaseRejected: "Opening was rejected.",
    payoutRejected: "The payout was rejected.",
    safeRejectedModule:
      "The Safe rejected the activation. Check that the connected wallet owns the Safe and that its threshold is 1.",
  },
};

export type Copy = typeof french;

export const COPY: Record<Language, Copy> = { fr: french, en: english };

/**
 * "3 d 04 h", "12 min 30 s". Two units at most: this is a quiet line of prose, not a
 * countdown widget, and this product does not own a DAYS / HRS / MIN box.
 */
export function formatRemaining(totalSeconds: number, units: Copy["duration"]): string {
  if (totalSeconds <= 0) {
    return units.fallen;
  }

  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days} ${units.days} ${String(hours).padStart(2, "0")} ${units.hours}`;
  }
  if (hours > 0) {
    return `${hours} ${units.hours} ${String(minutes).padStart(2, "0")} ${units.minutes}`;
  }
  if (minutes > 0) {
    return `${minutes} ${units.minutes} ${String(seconds).padStart(2, "0")} ${units.seconds}`;
  }
  return `${seconds} ${units.seconds}`;
}
