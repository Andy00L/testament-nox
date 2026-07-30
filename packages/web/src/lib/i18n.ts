/**
 * Every word the interface says, in both languages it speaks.
 *
 * English is the default because the judges read it; French stays one press away for the
 * event's community. `english` is typed as `typeof french`, so a string added to one and
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
    connectedTitle: "Portefeuille connecté",
    viewOnEtherscan: "Voir sur Etherscan",
    choose: "Choisir un portefeuille",
    browser: "Portefeuille du navigateur",
    connecting: "Connexion…",
    failed: "La connexion a échoué. Réessayez.",
    none: "Aucun portefeuille détecté dans ce navigateur.",
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
    doorsTitle: "Les deux portes",
    about: "Comprendre",
  },

  status: {
    notDeployed: "Contrats non déployés sur ce réseau.",
    reading: "Lecture de la chaîne…",
    releasedLede: "Le vent est tombé. Le testament est ouvert et attend son exécution.",
    goToDoor: "Aller à la porte",
    shareDoor: "La porte de vos héritiers, à leur partager",
    doorLinkCopy: "Cliquer pour copier.",
    doorLinkCopied: "Lien copié.",
    doorLinkCopyFailed: "Copie impossible. Sélectionnez le lien à la main.",
    countdownLabel: "Le vent tombe dans",
    windFell: "Le vent est tombé.",
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
    vaultConnect: "Connectez un portefeuille : l'adresse de votre coffre apparaîtra ici.",
    vaultReading: "Calcul de l'adresse de votre coffre…",
    vaultDerived: "Votre coffre, calculé depuis ce portefeuille. Rien à chercher, rien à coller.",
    vaultAbsent: "Ce coffre n'existe pas encore. Cette adresse est celle qu'il aura.",
    vaultCreate: "Créer ce coffre",
    vaultCreating: "Création…",
    vaultEmpty: "Le coffre est vide. Il ne peut encore rien verser.",
    vaultEstate: (amount: string) => `Le coffre contient ${amount} ETH.`,
    vaultFundLabel: "Somme à envoyer",
    vaultFund: "Envoyer la succession",
    vaultFunding: "Envoi…",
    vaultUnreadable: "Impossible de lire l'état du coffre. Vérifiez à nouveau dans un instant.",
    vaultUseAnother: "Utiliser un autre Safe",
    vaultUseMine: "Revenir à mon coffre",
    checkAgain: "Vérifier à nouveau",
    safeHintDefault: "Le Safe qui paiera. Il reste intact : rien n'y est modifié.",
    safeHintModuleMissing: "Le Safe n'a pas encore ouvert le passage. Première étape.",
    safeHintWriterMissing:
      "Le passage est ouvert. Le Safe doit encore désigner ce portefeuille comme sa plume.",
    safeHintReady: "Le passage est ouvert et ce portefeuille est la plume désignée.",
    safeHintUnreadable:
      "Impossible de lire l'état de ce Safe. Vérifiez l'adresse et le réseau.",
    intervalLabel: "Intervalle",
    intervalHint: (minimum: number) => `Entre deux signes de vie. Minimum ${minimum} s.`,
    graceLabel: "Délai de grâce",
    graceHint: "Le silence toléré en plus.",
    invalidAddress: "Adresse invalide.",
    heirIsContract:
      "Cette adresse est un contrat. S'il refuse l'ETH le jour venu, le testament paiera les autres et laissera cette part dans le Safe, relançable par n'importe qui.",
    consentTitle: "Les deux consentements du Safe",
    stepPassage: "Ouvrir le passage",
    stepPassageBusy: "Ouverture…",
    stepPassageDone: "Passage ouvert",
    stepHand: "Nommer la plume",
    stepHandBusy: "Désignation…",
    stepHandDone: "Plume nommée",
    sealNeedsVault: "Créez d'abord le coffre.",
    sealChecking: "Lecture des consentements du Safe…",
    sealNeedsModule: "Activez d'abord le module sur le Safe.",
    sealNeedsWriter: "Le Safe doit d'abord désigner ce portefeuille.",
    doorTitle: "La porte est ouverte",
    doorLede:
      "Le testament est scellé. Vos héritiers n'ont besoin que de ce lien : la porte lit la chaîne et s'ouvre d'elle-même quand le vent est tombé.",
    viewTransaction: "Voir la transaction sur Etherscan",
    connectFirst: "Connectez un portefeuille sur Sepolia.",
    doorLinkLabel: "La porte de ce testament. Partagez ce lien à vos héritiers :",
  },

  /**
   * Every failure the interface can show. The chain helpers return reasons, never prose, so
   * an error state reads in the language the rest of the page is in.
   */
  errors: {
    notConnected: "Connectez un portefeuille sur Sepolia.",
    encryptionFailedSlot: (slot: number, detail: string) =>
      `Le chiffrement a échoué à l'emplacement ${slot} : ${detail}`,
    encryptionFailed: (detail: string) => `Le chiffrement a échoué : ${detail}`,
    declinedInWallet: "Vous avez refusé la transaction dans le portefeuille. Rien n'a été envoyé.",
    sealReverted:
      "La chaîne a refusé ce testament : rien n'a été inscrit. Ouvrez la transaction sur Etherscan pour en lire la raison.",
    safeRevertedEnable:
      "Le Safe a refusé l'activation. Vérifiez que le portefeuille connecté est propriétaire du Safe et que le seuil est de 1.",
    safeRevertedAuthorize:
      "Le Safe a refusé la désignation. Vérifiez que le module est activé, que le portefeuille connecté est propriétaire du Safe et que le seuil est de 1.",
    vaultCreateReverted:
      "La chaîne a refusé la création du coffre. Ouvrez la transaction sur Etherscan pour en lire la raison.",
    vaultFundReverted:
      "La chaîne a refusé l'envoi de la succession. Ouvrez la transaction sur Etherscan pour en lire la raison.",
    releaseReverted:
      "La chaîne a refusé l'ouverture. Ouvrez la transaction sur Etherscan pour en lire la raison.",
    executeReverted:
      "La chaîne a refusé le paiement. Ouvrez la transaction sur Etherscan pour en lire la raison.",
    retryReverted:
      "La chaîne a refusé la relance. Ouvrez la transaction sur Etherscan pour en lire la raison.",
    consentNotVisible:
      "La transaction est passée, mais la chaîne ne montre pas encore le consentement. Vérifiez-la sur Etherscan puis rechargez : ne signez pas une seconde fois.",
    safeUnreadable: (detail: string) =>
      `Impossible de lire l'état de ce Safe. Vérifiez l'adresse et le réseau. Détail : ${detail}`,
    safeNotAContract: (safeAddress: string) =>
      `Rien n'est déployé à ${safeAddress}. Créez d'abord le coffre : l'ETH envoyé maintenant dormirait à une adresse vide.`,
    sealOwnerActive:
      "Ce portefeuille adosse déjà un testament vivant. Révoquez-le avant d'en sceller un autre.",
    sealSafeActive: "Ce Safe adosse déjà un testament vivant.",
    sealAuthorizationUsed:
      "Le mandat de ce Safe a déjà servi. Nommez la plume à nouveau avant de sceller.",
    vaultWrongOwner: (safeAddress: string) =>
      `Le coffre ${safeAddress} n'est pas sorti comme un 1 sur 1 détenu par ce portefeuille. Rien n'y a été envoyé.`,
    vaultAmountInvalid: "Indiquez une somme en ETH supérieure à zéro.",
    safeAddressRequired: "Renseignez l'adresse du Safe.",
    intervalTooShort: (minimum: number) =>
      `L'intervalle doit valoir au moins ${minimum} secondes.`,
    graceInvalid: "Le délai de grâce doit être un nombre de secondes.",
    willNoBequests: "Un testament a besoin d'au moins un héritier.",
    willTooManyBequests: (maximum: number, count: number) =>
      `Un testament accueille au plus ${maximum} héritiers, vous en avez nommé ${count}.`,
    willInvalidAddress: (index: number, value: string) =>
      `L'héritier ${index} n'a pas une adresse valide : ${value}`,
    willZeroAddress: (index: number) => `L'héritier ${index} est l'adresse zéro.`,
    willDuplicate: (index: number, beneficiary: string) =>
      `L'héritier ${index} (${beneficiary}) apparaît deux fois.`,
    willInvalidShare: (index: number, maximum: number, shareBps: number) =>
      `La part ${index} doit être un entier entre 1 et ${maximum} bps, reçu ${shareBps}.`,
    willSharesDoNotSum: (total: number, expected: number) =>
      `Les parts totalisent ${total} bps au lieu de ${expected}.`,
  },

  seal: {
    idle: "Presser le sceau",
    sealed: "Testament scellé",
    idleLede: "Chiffre le testament et l'inscrit dans le registre. Irréversible.",
    readyHint: "Tout est en place. Le sceau attend votre geste.",
    sealedLede: "Les héritiers et les parts sont chiffrés on-chain.",
    encrypting: "Chiffrement des huit lignes…",
    signing: "Signature en attente…",
    confirming: "Inscription dans le registre…",
  },

  door: {
    notConfigured: "Contrats non configurés.",
    reading: "Lecture de la chaîne…",
    none: "Aucun testament n'a encore été scellé ici.",
    noLinkTitle: "Chaque testament a sa porte.",
    noLinkLede:
      "Cette page s'ouvre par le lien que l'auteur d'un testament partage à ses héritiers. Sans ce lien, il n'y a rien à montrer : avant l'ouverture, un testament ne révèle rien, pas même à cette page.",
    noLinkHint:
      "Vous avez écrit un testament ? Son lien apparaît après le sceau, et sur la page d'accueil quand votre portefeuille est connecté.",
    revokedTitle: "La porte a été murée.",
    revokedLede: "Ce testament a été révoqué par son auteur. Rien ne s'ouvrira.",
    countdownLabel: "Le vent tombe dans",
    stepOpenDone: "Testament ouvert",
    stepPayDone: "Le coffre a payé",
    closedTitle: "La porte est fermée.",
    closedLede:
      "Quelqu'un envoie encore des signes de vie. Ce que contient ce testament, qui y est nommé et pour quelle part, personne ne peut le lire, et cette page ne le sait pas davantage que vous.",
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
    heirPaid: "reçu",
    heirRetry: "Relancer le paiement",
    heirRetrying: "Envoi…",
    partiallyPaid: (paid: number, total: number) =>
      `Partiellement exécuté : ${paid} héritiers sur ${total} ont été payés. Les parts non versées sont restées dans le Safe et peuvent être relancées par n'importe qui.`,
    connectToOpen: "Connectez un portefeuille pour ouvrir la porte.",
    connectToExecute: "Connectez un portefeuille pour déclencher le paiement.",
    back: "Revenir devant la porte",
    viewTransaction: "Voir la transaction sur Etherscan",
  },

  about: {
    title: "Comprendre Testament",
    lede: "Un testament confidentiel pour votre Safe. Vous écrivez qui hérite et de combien ; personne ne peut le lire tant que vous donnez signe de vie. Le jour où le silence dure trop longtemps, il s'exécute tout seul.",
    conceptTitle: "Ce que cette maison garde",
    conceptBody:
      "Le chiffrement est porté par Nox, la couche de contrats confidentiels d'iExec. Les héritiers et les parts vivent chiffrés on-chain : la chaîne ne voit que des pointeurs, et le déchiffrement n'est possible qu'une fois la porte ouverte, preuve à l'appui, vérifiée par le contrat avant le moindre paiement. Le Safe, lui, reste intact ; un module lui est simplement ajouté, qu'il peut retirer à tout moment.",
    stepsTitle: "Comment s'en servir",
    steps: [
      {
        title: "Connecter un portefeuille",
        body: "Le bouton Connecter liste les portefeuilles détectés dans votre navigateur. Un portefeuille sur Ethereum Sepolia suffit : tout se passe sur le réseau de test.",
        alt: "Le choix du portefeuille, ouvert sous la plaque",
      },
      {
        title: "Laisser le coffre se construire",
        body: "L'adresse de votre coffre est calculée depuis votre portefeuille et affichée avant même d'exister. Créez-le d'une transaction, puis envoyez-lui la succession qu'il transmettra. C'est un Safe ordinaire : vous pouvez le vider à tout moment.",
        alt: "Le bloc du coffre, avec la clé de création",
      },
      {
        title: "Écrire le testament",
        body: "Nommez jusqu'à huit héritiers et leurs parts, choisissez le silence toléré, accordez les deux consentements du Safe, puis scellez d'un geste. Tout est chiffré dans votre navigateur avant de partir.",
        alt: "Le parchemin du testament, rempli",
      },
      {
        title: "Envoyer des signes de vie",
        body: "Après le sceau, un geste suffit : maintenez le bouton avant la fin de chaque intervalle et le vent reste levé. Le lien de la porte, lui, se partage aux héritiers dès maintenant.",
        alt: "La page d'accueil, connectée, avec le signe de vie",
      },
      {
        title: "La porte reste fermée",
        body: "Tant que vous donnez signe de vie, personne ne lit rien : ni les héritiers, ni cette page, ni la chaîne. Le compte à rebours est public ; le contenu, jamais.",
        alt: "La porte fermée et son compte à rebours",
      },
      {
        title: "Le jour venu, le Safe paie",
        body: "Si le silence dépasse l'intervalle et le délai de grâce, n'importe qui peut ouvrir la porte. Le testament est déchiffré, chaque part est vérifiée on-chain, et le Safe paie exactement ce qui a été écrit.",
        alt: "La porte ouverte, les parts déchiffrées et payées",
      },
    ],
    cta: "Écrire le vôtre",
    back: "Revenir à l'entrée",
  },

  /** Units for the one remaining-time line. Kept short: this is prose, not a widget. */
  duration: {
    days: "j",
    hours: "h",
    minutes: "min",
    seconds: "s",
    fallen: "le vent est tombé",
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
    connectedTitle: "Connected wallet",
    viewOnEtherscan: "View on Etherscan",
    choose: "Choose a wallet",
    browser: "Browser wallet",
    connecting: "Connecting…",
    failed: "Connection failed. Try again.",
    none: "No wallet detected in this browser.",
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
    doorsTitle: "The two doors",
    about: "How it works",
  },

  status: {
    notDeployed: "Contracts are not deployed on this network.",
    reading: "Reading the chain…",
    releasedLede: "The wind has fallen. The testament is open and waiting to be executed.",
    goToDoor: "Go to the door",
    shareDoor: "Your heirs' door, to share with them",
    doorLinkCopy: "Click to copy.",
    doorLinkCopied: "Link copied.",
    doorLinkCopyFailed: "Copying failed. Select the link by hand.",
    countdownLabel: "The wind falls in",
    windFell: "The wind has fallen.",
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
    vaultConnect: "Connect a wallet and your vault's address appears here.",
    vaultReading: "Working out your vault's address…",
    vaultDerived: "Your vault, derived from this wallet. Nothing to look up, nothing to paste.",
    vaultAbsent: "This vault does not exist yet. This is the address it will have.",
    vaultCreate: "Create this vault",
    vaultCreating: "Creating…",
    vaultEmpty: "The vault is empty. It has nothing to pay anyone with yet.",
    vaultEstate: (amount: string) => `The vault holds ${amount} ETH.`,
    vaultFundLabel: "Estate to send",
    vaultFund: "Send the estate",
    vaultFunding: "Sending…",
    vaultUnreadable: "The vault's state could not be read. Check again in a moment.",
    vaultUseAnother: "Use another Safe",
    vaultUseMine: "Back to my vault",
    checkAgain: "Check again",
    safeHintDefault: "The Safe that will pay. It stays untouched: nothing in it is modified.",
    safeHintModuleMissing: "The Safe has not opened the passage yet. First step.",
    safeHintWriterMissing:
      "The passage is open. The Safe still has to name this wallet as its hand.",
    safeHintReady: "The passage is open and this wallet is the named hand.",
    safeHintUnreadable: "This Safe's state could not be read. Check the address and the network.",
    intervalLabel: "Interval",
    intervalHint: (minimum: number) => `Between two signs of life. Minimum ${minimum} s.`,
    graceLabel: "Grace period",
    graceHint: "The extra silence allowed.",
    invalidAddress: "Invalid address.",
    heirIsContract:
      "This address is a contract. If it refuses ETH on the day, the testament pays everyone else and leaves this share in the Safe, where anyone can push it again.",
    consentTitle: "The Safe's two consents",
    stepPassage: "Open the passage",
    stepPassageBusy: "Opening…",
    stepPassageDone: "Passage open",
    stepHand: "Name the hand",
    stepHandBusy: "Naming…",
    stepHandDone: "Hand named",
    sealNeedsVault: "Create the vault first.",
    sealChecking: "Reading the Safe's consents…",
    sealNeedsModule: "Enable the module on the Safe first.",
    sealNeedsWriter: "The Safe has to name this wallet first.",
    doorTitle: "The door is open",
    doorLede:
      "The testament is sealed. Your heirs need nothing but this link: the door reads the chain and opens by itself once the wind has fallen.",
    viewTransaction: "View the transaction on Etherscan",
    connectFirst: "Connect a wallet on Sepolia.",
    doorLinkLabel: "This testament's door. Share this link with your heirs:",
  },

  errors: {
    notConnected: "Connect a wallet on Sepolia.",
    encryptionFailedSlot: (slot: number, detail: string) =>
      `Encryption failed at slot ${slot}: ${detail}`,
    encryptionFailed: (detail: string) => `Encryption failed: ${detail}`,
    declinedInWallet: "You declined the transaction in the wallet. Nothing was sent.",
    sealReverted:
      "The chain refused this testament: nothing was written. Open the transaction on Etherscan to read why.",
    safeRevertedEnable:
      "The Safe refused to enable the module. Check that the connected wallet owns the Safe and that its threshold is 1.",
    safeRevertedAuthorize:
      "The Safe refused to name this wallet. Check that the module is enabled, that the connected wallet owns the Safe, and that its threshold is 1.",
    vaultCreateReverted:
      "The chain refused to create the vault. Open the transaction on Etherscan to read why.",
    vaultFundReverted:
      "The chain refused the estate transfer. Open the transaction on Etherscan to read why.",
    releaseReverted:
      "The chain refused the opening. Open the transaction on Etherscan to read why.",
    executeReverted:
      "The chain refused the payout. Open the transaction on Etherscan to read why.",
    retryReverted:
      "The chain refused the retried payment. Open the transaction on Etherscan to read why.",
    consentNotVisible:
      "The transaction went through, but the chain does not show the consent yet. Check it on Etherscan and reload: do not sign a second time.",
    safeUnreadable: (detail: string) =>
      `This Safe's state could not be read. Check the address and the network. Detail: ${detail}`,
    safeNotAContract: (safeAddress: string) =>
      `Nothing is deployed at ${safeAddress}. Create the vault first: ETH sent now would sit at an empty address.`,
    sealOwnerActive:
      "This wallet already backs a live testament. Revoke it before sealing another.",
    sealSafeActive: "This Safe already backs a live testament.",
    sealAuthorizationUsed:
      "This Safe's mandate has already been spent. Name the hand again before sealing.",
    vaultWrongOwner: (safeAddress: string) =>
      `Vault ${safeAddress} did not come out as a 1-of-1 owned by this wallet. Nothing was sent to it.`,
    vaultAmountInvalid: "Enter an amount of ETH greater than zero.",
    safeAddressRequired: "Enter the Safe address.",
    intervalTooShort: (minimum: number) => `The interval must be at least ${minimum} seconds.`,
    graceInvalid: "The grace period must be a whole number of seconds.",
    willNoBequests: "A testament needs at least one heir.",
    willTooManyBequests: (maximum: number, count: number) =>
      `A testament holds at most ${maximum} heirs, and you named ${count}.`,
    willInvalidAddress: (index: number, value: string) =>
      `Heir ${index} is not a valid address: ${value}`,
    willZeroAddress: (index: number) => `Heir ${index} is the zero address.`,
    willDuplicate: (index: number, beneficiary: string) =>
      `Heir ${index} (${beneficiary}) appears twice.`,
    willInvalidShare: (index: number, maximum: number, shareBps: number) =>
      `Share ${index} must be a whole number between 1 and ${maximum} bps, got ${shareBps}.`,
    willSharesDoNotSum: (total: number, expected: number) =>
      `The shares total ${total} bps instead of ${expected}.`,
  },

  seal: {
    idle: "Press the seal",
    sealed: "Testament sealed",
    idleLede: "Encrypts the testament and writes it into the registry. Irreversible.",
    readyHint: "Everything is in place. The seal awaits your hand.",
    sealedLede: "Heirs and shares are encrypted on-chain.",
    encrypting: "Encrypting the eight lines…",
    signing: "Waiting for your signature…",
    confirming: "Writing into the registry…",
  },

  door: {
    notConfigured: "Contracts are not configured.",
    reading: "Reading the chain…",
    none: "No testament has been sealed here yet.",
    noLinkTitle: "Every testament has its own door.",
    noLinkLede:
      "This page opens through the link a testament's author shares with their heirs. Without that link there is nothing to show: before it opens, a testament reveals nothing, not even to this page.",
    noLinkHint:
      "Wrote a testament? Its link appears after the seal, and on the home page while your wallet is connected.",
    revokedTitle: "The door has been walled up.",
    revokedLede: "This testament was revoked by its author. Nothing will open.",
    countdownLabel: "The wind falls in",
    stepOpenDone: "Testament opened",
    stepPayDone: "The vault has paid",
    closedTitle: "The door is closed.",
    closedLede:
      "Someone is still sending signs of life. What this testament contains, who is named in it and for what share, nobody can read, and this page knows no more about it than you do.",
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
    heirPaid: "received",
    heirRetry: "Retry the payment",
    heirRetrying: "Sending…",
    partiallyPaid: (paid: number, total: number) =>
      `Partially executed: ${paid} of ${total} heirs paid. The unpaid funds remain in the Safe and may be retried by anyone.`,
    connectToOpen: "Connect a wallet to open the door.",
    connectToExecute: "Connect a wallet to trigger the payout.",
    back: "Back to the door",
    viewTransaction: "View the transaction on Etherscan",
  },

  about: {
    title: "Understanding Testament",
    lede: "A confidential will for your Safe. You write who inherits and how much; nobody can read it while you keep showing life. The day the silence lasts too long, it executes on its own.",
    conceptTitle: "What this house keeps",
    conceptBody:
      "The encryption is carried by Nox, iExec's confidential smart contract layer. Heirs and shares live encrypted on-chain: the chain only ever sees pointers, and decryption becomes possible only once the door is open, proof in hand, verified by the contract before a single payment. The Safe itself stays untouched; a module is simply added to it, and it can remove that module at any time.",
    stepsTitle: "How to use it",
    steps: [
      {
        title: "Connect a wallet",
        body: "The Connect button lists the wallets detected in your browser. A wallet on Ethereum Sepolia is enough: everything runs on the test network.",
        alt: "The wallet chooser, open under the plaque",
      },
      {
        title: "Let the vault build itself",
        body: "Your vault's address is computed from your wallet and shown before it even exists. Create it in one transaction, then send it the estate it will pass on. It is an ordinary Safe: you can empty it at any time.",
        alt: "The vault block, with the create key",
      },
      {
        title: "Write the testament",
        body: "Name up to eight heirs and their shares, choose the silence you allow, grant the Safe's two consents, then seal in one gesture. Everything is encrypted in your browser before it leaves.",
        alt: "The testament scroll, filled in",
      },
      {
        title: "Send signs of life",
        body: "After the seal, one gesture is enough: hold the button before each interval ends and the wind stays up. The door's link can be shared with your heirs right away.",
        alt: "The home page, connected, with the sign of life",
      },
      {
        title: "The door stays closed",
        body: "As long as you show life, nobody reads a thing: not the heirs, not this page, not the chain. The countdown is public; the content never is.",
        alt: "The closed door and its countdown",
      },
      {
        title: "When the day comes, the Safe pays",
        body: "If the silence outlasts the interval and the grace period, anyone can open the door. The testament is decrypted, every share is verified on-chain, and the Safe pays exactly what was written.",
        alt: "The open door, shares decrypted and paid",
      },
    ],
    cta: "Write your own",
    back: "Back to the entrance",
  },

  duration: {
    days: "d",
    hours: "h",
    minutes: "min",
    seconds: "s",
    fallen: "the wind has fallen",
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
