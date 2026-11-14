/* ══════════════════════════════════════════════════════════════
   DADER GEZOCHT — catalogue of comic portraits (made in Gemini)
   Each case is newly invented, so there is a fixed set of portraits by
   type. When writing the case, the AI picks the best-fitting portrait per
   person (only from the ones marked ready). No match: the game draws a silhouette.

   Adding a new portrait:
   1. make the image in Gemini with the `prompt` below (same chat as the others),
   2. save it as portraits/<id>.webp (320x320, cream frame cropped off),
   3. set `ready: true`.
   ══════════════════════════════════════════════════════════════ */

const PORTRAITS = [
  { id: 'barvrouw', ready: true, desc: 'vrouw, eind twintig, donkere paardenstaart, zwart schort, theedoek (barvrouw, serveerster)', prompt: 'een VROUW van eind twintig, barvrouw, donkere paardenstaart, zwart schort over een wit shirt, theedoek over de schouder, licht schuldige uitdagende blik.' },
  { id: 'kastelein', ready: true, desc: 'man, rond de 55, kalend, grote grijze snor, leren schort (kastelein, barman, kroegbaas)', prompt: 'een MAN van rond de 55, kastelein, stevig, blozende wangen, grote grijze snor, kalend, wit overhemd met opgerolde mouwen, bruin leren schort, kijkt nors.' },
  { id: 'kok-man', ready: true, desc: 'man, rond de 40, donkere huid, koksbuis en hoge koksmuts (kok, chef, bakker)', prompt: 'een MAN van rond de 40 met donkere huid, kok, witte koksbuis, hoge witte koksmuts, armen over elkaar, kijkt geërgerd.' },
  { id: 'kok-vrouw', ready: true, desc: 'vrouw, rond de 40, rood haar in een knot, sproeten, koksbuis (kok, chef, bakker, kantinedame)', prompt: 'een VROUW, kok van rond de 40 met rood haar in een knot en sproeten, witte koksbuis, kleine witte koksmuts, armen langs het lichaam, geen theedoek, kijkt verbaasd.' },
  { id: 'taxichauffeur', ready: true, desc: 'man, rond de 60, grijze stoppelbaard, platte pet, leren jack (chauffeur, schipper, veerman)', prompt: 'een MAN van rond de 60, taxichauffeur, grijze stoppelbaard, platte pet, versleten bruin leren jack, tandenstoker in de mond, geen theedoek, geen schort, kijkt achterdochtig.' },
  { id: 'bezorger', ready: true, desc: 'jonge man, rond de 22, pet achterstevoren, rood bezorgjack (bezorger, koerier, postbode)', prompt: 'een jonge MAN van rond de 22 met Marokkaans-Nederlands uiterlijk, bezorger, pet achterstevoren, felrood bezorgjack, schouderband van een bezorgtas, geen schort, geen theedoek, grijnst brutaal.' },
  { id: 'agent', ready: true, desc: 'vrouw, rond de 35, uniform met pet (agent, beveiliger, conducteur, handhaver)', prompt: 'een VROUW van rond de 35, wijkagent, donkerblauw uniform zonder echte emblemen of tekst, uniformpet, blonde haren in een strakke staart, geen schort, geen theedoek, kijkt streng.' },
  { id: 'beveiliger', ready: true, desc: 'man, rond de 30, kaalgeschoren, zwart jack, oortje (beveiliger, portier, uitsmijter)', prompt: 'een MAN van rond de 30, portier, kaalgeschoren hoofd, brede nek, zwart bomberjack, oortje met spiraalsnoer, geen schort, geen theedoek, kijkt onverstoorbaar.' },
  { id: 'voorzitter', ready: true, desc: 'man, rond de 55, grijzend, pak met stropdas (voorzitter, directeur, burgemeester, notaris)', prompt: 'een MAN van rond de 55, voorzitter van een vereniging, grijzend zijscheiding-kapsel, donker pak, wit overhemd, rode stropdas, verenigingsspeldje, geen schort, geen theedoek, zelfingenomen glimlach.' },
  { id: 'manager', ready: true, desc: 'vrouw, rond de 45, kort donker haar, blazer, bril (manager, penningmeester, advocaat, organisator)', prompt: 'een VROUW van rond de 45 met Surinaams-Nederlands uiterlijk, manager, kort donker haar, zwarte bril, marineblauwe blazer, oortjes, geen schort, geen theedoek, kijkt ongeduldig.' },
  { id: 'huisbaas', ready: true, desc: 'man, rond de 65, kaal, gouden ketting, colbert (huisbaas, eigenaar, rijke oom, makelaar)', prompt: 'een MAN van rond de 65, rijke huisbaas, kaal glimmend hoofd, dikke gouden ketting, opzichtig geruit colbert, sigaar in de mondhoek, geen schort, geen theedoek, kijkt neerbuigend.' },
  { id: 'oma', ready: true, desc: 'vrouw, rond de 75, grijze permanent, vest, parelketting (oma, overbuurvrouw, weduwe)', prompt: 'een VROUW van rond de 75, nieuwsgierige overbuurvrouw, grijze permanent, grote bril, gebreid vest, parelketting, geen schort, geen theedoek, kijkt alsof ze alles gezien heeft.' },
  { id: 'opa', ready: true, desc: 'man, rond de 75, bril, ribbelvest, pet (opa, buurman, gepensioneerde, veteraan)', prompt: 'een MAN van rond de 75, gepensioneerde buurman, ronde bril, wollen ribbelvest, flatcap, grijze wenkbrauwen, geen schort, geen theedoek, kijkt knorrig.' },
  { id: 'studente', ready: true, desc: 'jonge vrouw, rond de 20, krullen, hoodie (studente, stagiaire, babysitter)', prompt: 'een jonge VROUW van rond de 20, studente, grote zwarte krullen, oversized hoodie, piercing in de neus, geen schort, geen theedoek, kijkt verveeld.' },
  { id: 'student', ready: true, desc: 'jonge man, rond de 20, rommelig haar, koptelefoon om de nek (student, stagiair, gamer)', prompt: 'een jonge MAN van rond de 20, student, rommelig blond haar, koptelefoon om de nek, verwassen bandshirt, geen schort, geen theedoek, kijkt slaperig.' },
  { id: 'boer', ready: true, desc: 'man, rond de 50, strohoed, geruit hemd (boer, tuinier, visser, terreinknecht)', prompt: 'een MAN van rond de 50, boer, verweerd gezicht, strohoed, geruit flanellen hemd, bretels, strohalm in de mond, geen schort, geen theedoek, kijkt argwanend.' },
  { id: 'schoonmaakster', ready: true, desc: 'vrouw, rond de 50, bandana, schort (schoonmaakster, conciërge, huishoudster)', prompt: 'een VROUW van rond de 50, schoonmaakster, Pools uiterlijk, rode bandana, lichtblauw werkschort, rubberen handschoenen, geen theedoek, kijkt alsof ze meer weet.' },
  { id: 'trainer', ready: true, desc: 'vrouw, rond de 35, trainingsjack, fluitje (trainer, coach, badmeester, sportster)', prompt: 'een VROUW van rond de 35, sporttrainer, gespierd, hoge paardenstaart, trainingsjack met rits, fluitje aan een koord, geen schort, geen theedoek, kijkt fanatiek.' },
  { id: 'scheidsrechter', ready: true, desc: 'man, rond de 45, zwart shirt, fluitje (scheidsrechter, keeper, voetballer)', prompt: 'een MAN van rond de 45, scheidsrechter, zwart scheidsrechtersshirt met kraag, fluitje om de nek, keurig kort haar, geen schort, geen theedoek, kijkt streng.' },
  { id: 'dokter', ready: false, desc: 'vrouw, rond de 50, witte jas, stethoscoop (dokter, verpleegkundige, dierenarts, apotheker)', prompt: 'een VROUW van rond de 50 met Indiaas uiterlijk, dokter, witte jas, stethoscoop om de nek, leesbril op het hoofd, geen schort, geen theedoek, kijkt bezorgd.' },
  { id: 'leraar', ready: true, desc: 'man, rond de 45, bril, trui over overhemd (leraar, quizmaster, boekhouder, professor)', prompt: 'een MAN van rond de 45, leraar, hoekige bril, baardje, V-hals trui over een overhemd, pen achter het oor, geen schort, geen theedoek, kijkt betweterig.' },
  { id: 'dj', ready: false, desc: 'jonge vrouw, rond de 25, gekleurd haar, koptelefoon (dj, muzikant, zangeres, influencer)', prompt: 'een jonge VROUW van rond de 25, dj, felroze kort geverfd haar, grote koptelefoon om de nek, leren jack, oorbellen, geen schort, geen theedoek, kijkt uitdagend.' },
  { id: 'fotograaf', ready: false, desc: 'man, rond de 35, baard, camera om de nek (fotograaf, journalist, vlogger)', prompt: 'een MAN van rond de 35, fotograaf, volle baard, beanie, camera aan een riem om de nek, spijkerjasje, geen schort, geen theedoek, kijkt nieuwsgierig.' },
  { id: 'monteur', ready: false, desc: 'man, rond de 40, overall, olievlek (monteur, loodgieter, klusjesman, leverancier)', prompt: 'een MAN van rond de 40, monteur, blauwe werkoverall, olievlek op de wang, potlood achter het oor, gespierde armen, geen schort, geen theedoek, kijkt schuldbewust.' },
  { id: 'stamgast', ready: false, desc: 'vrouw, rond de 55, rode lippenstift, sjaal, opvallende oorbellen (stamgast, buurvrouw, roddelaar)', prompt: 'een VROUW van rond de 55, stamgast in de kroeg, felrode lippenstift, geblondeerd opgestoken haar, bontgekleurde sjaal, grote oorbellen, geen schort, geen theedoek, kijkt ondeugend.' },
  { id: 'buurman', ready: false, desc: 'man, rond de 40, stoppelbaard, T-shirt (buurman, vader, vriend, gewone gast)', prompt: 'een MAN van rond de 40, gewone buurman, stoppelbaard, kort donker haar, grijs T-shirt, wallen onder de ogen, geen schort, geen theedoek, kijkt moe en geïrriteerd.' },
];

const READY = PORTRAITS.filter(p => p.ready);
const READY_IDS = new Set(READY.map(p => p.id));

module.exports = { PORTRAITS, READY, READY_IDS };
