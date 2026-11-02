# 9e Simulator: regles del joc i referència d'ajust

Versió 1.7.8. Font: `site/simulator/index.html` (un sol fitxer, HTML + Canvas). Aquest document està escrit a partir de la lectura del codi. Les dades numèriques marcades com «calculat» s'han derivat de les fórmules, i les xifres d'estat estable de la desviació s'han obtingut simulant només la regla d'actualització de la desviació.

## 1. Visió general i com ajustar-ho

Unitats: 1 casella del mapa = 1 metre; els temps són en segons; els angles són en radians tret que s'indiqui el contrari; els «pts» són punts de les barres de 0 a 100. El bucle del joc limita cada fotograma a `dt = 0.05 s`. Tota l'aleatorietat usa `Math.random()`.

**El bloc d'ajust.** Tots els paràmetres de regla que abans estaven dispersos són ara a l'objecte `TUNE` (cerca `TUNE: tots els paràmetres`). Canviar un valor allà canvia la regla a tot arreu. Els valors per defecte són els de la versió 1.7.7, de manera que el comportament no ha canviat. Una comparació amb llavor aleatòria entre la 1.7.7 i la 1.7.8 als nivells 7 i 10 (moviment, càrrega, salves, combat de la IA) va donar estats finals idèntics.

| Grup de `TUNE` | Què governa |
| --- | --- |
| `moviment` | longitud del pas, separació de files i rengles, cadències, temps de gir, retard de l'ordre, par file, velocitats d'alineació |
| `ordre`, `recordatori` | percentatge d'ordre, avisos, llindars de caos, temporitzadors de recordatori |
| `desordre` | soroll de desordre per pas, per gir i per tret; modificadors de columna i de cansament |
| `energia` | taxes de cansament, llindars, costos de postura |
| `mosquet` | recàrrega, precisió, abast, franja de foc, protecció, supressió, foc enemic estàtic |
| `tirailleurs` | separació, límits i distància mínima dels tiradors |
| `art` | bateria d'artilleria |
| `capita` | bonificació de recàrrega del capità Le Jay |
| `ia` | regiments IA (nivell 10) |
| `puntuacio` | constants de puntuació |
| `mort` | marges de col·lisió i retard del reinici per «unitat destrossada» |

Les constants derivades següents es construeixen a partir de `TUNE` i no s'han d'editar directament: `STEP`, `FRONT`, `RANK_GAP`, `ORD_CADENCE`, `PACES`, `TURN_T`, `PF_TURN_T`, `PF_MIN_LEG`, `ORDER_DELAY`.

**Taules de dades que queden fora de `TUNE`.** Per ordre: `ORDERS[i].des` (multiplicador de desordre), `.en` (multiplicador de cansament) i `ORDER_BY_ID['MA-04'].desOpt` (multiplicadors dels passos). Per nivell: `SCORE_REF` i les marques de nivell que es descriuen a continuació.

| Ordre | `des` | `en` |
| --- | --- | --- |
| MA-01 En avant | 0,8 | 1 |
| MA-02 En arrière | 1 | 0,8 |
| MA-07 Oblique | 1,2 | 1,2 |
| MA-04 Pas (`desOpt`) | ordinari 1, accelerat 1,5, carrega 2,2 | s'usen els mateixos factors per al cansament |
| FD-04 Par le flanc, FD-06 Front | 0,5 (tret) | 1 |
| FD-05 Demi-tour | 0,7 (tret) | 1 |
| WH-01 Par peloton | 2,2 | 1,5 |
| WH-02 Conversion | 2,0 | 1 |
| WH-03 Tournez | 2,4 | 1 |
| CD-01 Par file | 1,5 (tret) | 1 |
| CD-06 Contremarche | 1,0 (tret) | 1 |
| FI-04 Feu | 0,15 (tret) | 1 |
| SK-01, SK-02, SK-04, SK-05 | 0,3 | 1 |
| SK-11 | 0,2 | 1 |

Una ordre marcada com a «tret» aplica una sacsejada puntual de desordre quan s'executa (secció 4). Totes les altres ordres amb `des = 0` no desordenen la unitat.

**Marques de nivell** (comprovades carregant cada nivell). `driftScale` multiplica tot el soroll de desordre; `fatigueScale` multiplica totes les taxes de cansament; `exhaust` atura la unitat a 0 d'energia; `advanced` activa la penalització de desordre per cansament, les regles de recuperació en repòs i la barra d'energia; `warnDisorder` activa els avisos de Louis i el caos; `musket` i `skirm` desbloquegen les ordres d'arma i de tiradors; `minMen` és el llindar de pèrdua; `keepMin` protegeix el primer regiment enemic perquè el foc de tiradors no el redueixi per sota d'aquest nombre d'homes.

| Nivell | `driftScale` | `fatigueScale` | `exhaust` | `advanced` | `warnDisorder` | `musket` | `skirm` | `minMen` | `keepMin` | arbres (`cover`) | `walls` | enemics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0,8 | 1 | no | no | no | no | no | cap | cap | 0 | 0 | 0 |
| 2 | 0,8 | 1 | no | no | no | no | no | cap | cap | 0 | 0 | 0 |
| 3 | 1 | 1 | no | no | no | no | no | cap | cap | 0 | 0 | 0 |
| 4 | 0,8 | 1 | no | no | no | no | no | cap | cap | 0 | 0 | 0 |
| 5 | 1,1 | 2,2 | sí | sí | sí | no | no | cap | cap | 0 | 0 | 0 |
| 6 | 0,5 | 1 | no | no | no | sí | no | cap | cap | 0 | 0 | 1 |
| 7 | 0,5 | 1 | no | no | no | sí | no | 8 | cap | 89 | 0 | 2 |
| 8 | 0,5 | 1 | no | no | no | sí | sí | 6 | 24 | 0 | 0 | 1 |
| 9 | 0,5 | 1 | no | no | no | sí | no | 6 | cap | 0 | 0 | 0 |
| 10 | 0,5 | 0,8 | sí | sí | sí | sí | sí | 7 | cap | 241 | 6 | 2 IA + 1 IA aliada |

## 2. Moviment i ordres

**Geometria.** `STEP = moviment.pas = 0,65 m`. Els homes d'un rengle estan separats `moviment.front = 0,5 m`; els rengles, `moviment.rengle = 0,325 m`. La unitat té 10 files per 2 rengles (20 homes). La velocitat és `longitud del pas × cadència / 60`.

| Pas (ordre MA-04) | Cadència (passos/min) | Clau | Velocitat (m/s, calculat) |
| --- | --- | --- | --- |
| Pas ordinari | 76 | `moviment.cadOrdinari` | 0,823 |
| Pas accelerat | 100 | `moviment.cadAccelerat` | 1,083 |
| Pas de càrrega | 120 | `moviment.cadCarrega` | 1,300 |
| En arrière (MA-02) | 76, mitjos passos | usa `cadOrdinari` | 0,412 |

Les maniobres automàtiques (`startAuto`) avancen a `ORD_SPEED` = 0,823 m/s. «Serrez les files» s'executa a la velocitat del pas de càrrega. La marxa oblíqua (MA-07) alterna un pas recte i un pas a 45 graus.

**Gir.** La unitat sencera gira en `moviment.girUnitat = 0,7 s` independentment de l'angle (Demi-tour, Front, Par le flanc, que gira mentre camina). Cada fila gira 90 graus en `moviment.girFilera = 0,5 s` durant un par file. El cap gira a `moviment.girCap = 1,5 rad/s`.

**Ordres en dues veus.** Funció `fire()`: el text de l'ordre es divideix per « – ». Si no hi ha divisió (Fixe!, Contremarche!, Halte), l'ordre s'executa de seguida. Si no, es diu la veu preventiva i s'arma `pendingCmd` durant `moviment.retard = 0,78 s` (`ORDER_DELAY`). Mentre està armada no es pot donar cap altra ordre. Quan acaba el retard, `tickPending` torna a comprovar la disponibilitat: si l'ordre ja no està disponible es cancel·la («Ordre anul·lada»); en mode veu, la falta d'una veu executiva també la cancel·la. En executar-se (`runOrder`), el comptador `STAT.ord` augmenta, qualsevol «Serrez les rangs» en curs es cancel·la (tret de SR-01), s'executa l'ordre i, si és marcada com a «tret», s'aplica una sacsejada de desordre.

**Halte.** La veu executiva «Peloton, halte!» atura la unitat de seguida (`halte()` i després `stopCo`): l'estat passa a `parat`, el pas torna a ser l'ordinari i el mode a recte. Qualsevol fila que estigui a mig gir en un par file acaba el seu gir (`pfSnap`); les altres esperen la propera marxa. El camí `haltReq`, sincronitzat amb el pas, es manté però `halte()` no l'usa.

**Encadenament de par file.** Només en columna, quan es marxa recte (`parFile`). El primer par file fixa una línia de gir a l'home més avançat; cada fila gira, com un bloc de dos homes, quan el seu centre arriba a aquella línia. Un segon par file donat mentre el primer està en curs afegeix un gir la línia del qual és `moviment.parFileTram = 2 m` més enllà de la posició actual del cap, en la nova direcció (`PF_MIN_LEG`), i així es produeix un ziga-zaga. Mentre hi ha un par file o un gir de flanc actiu no s'aplica deriva de pas (es salta `driftStep`) i la unitat està «ocupada» per a les ordres.

**Límits.** Un home a menys de 0,5 m del límit del mapa atura la unitat («Límit del terreny»). Tocar un obstacle (marge `mort.obstacle = 0,15 m`) o un arbre (radi més `mort.arbre = 0,22 m`) mata l'exercici i activa el reintent des del punt de control (secció 8).

**Altres constants de moviment.** Velocitat de correcció de l'alineació `moviment.alineaVel = 0,6 m/s`; velocitat de tancar buits després de baixes `moviment.buitVel = 1,3 m/s`; durada de «Serrez les rangs» `moviment.serrezT = 10 s`.

## 3. Cansament i energia

**Variable.** `co.cansament`, de 0 a 100 punts, comença a 100. S'actualitza a cada fotograma amb `updateStamina(dt)`:

`cansament = clamp( cansament + taxa × dt × level.fatigueScale , 0 , max(cap, cansament) )`

on `cap` és 100, excepte mentre es recupera després d'un halt (cap `energia.halteFins`, de manera que la recuperació mai porta la barra per sobre d'aquest valor).

**Selecció de la taxa (punts per segon, abans de `fatigueScale`).**

| Situació | Taxa | Claus |
| --- | --- | --- |
| Aturada, no en atenció («En place, repos!») | +1,5 | `energia.repos` |
| Aturada en atenció, nivell no `advanced` | −0,05 | `energia.atencio` |
| Aturada en atenció, `advanced`, nivell d'arma (`armMode`) | −0,4 × cost de postura | `energia.quiet`, `energia.arma` |
| Igual, no arma, els primers 10 s | +1,2 mentre és per sota de 50 (límit 50), si no 0 | `halteDurant`, `halteRecupera`, `halteFins` |
| Igual, de 10 s a 30 s | 0 | `quietDesDe` |
| Igual, després de 30 s encara aturada | −0,4 | `quiet` |
| Marxant | −0,5 × `en`(ordre de marxa) × paceMul × (0,6 si és columna) | `energia.marxa`, `energia.columna` |
| Maniobra (`conv`) | −0,6 × `en`(ordre de maniobra) × paceMul (1 per a `stand`) | `energia.maniobra` |
| Qualsevol altra cosa (girs, maniobres automàtiques) | −0,1 | `energia.altres` |

Costos de postura (`energia.arma`, multiplicador de `quiet`): portez 1, repose 0,3, charge 1, apprete 1,5, joue 1,8, croise 1,5. El temporitzador d'inactivitat `co.idleT` es reinicia cada vegada que la unitat no està aturada. `paceMul` és 1, 1,5 i 2,2 per als tres passos (`desOpt`). Caminar enrere aplica igualment el multiplicador del pas actual per al cansament.

Exemples calculats amb `fatigueScale = 1`: marxa ordinària en línia −0,5 pts/s (200 s per buidar); pas de càrrega en línia −1,1 pts/s; marxa ordinària en columna −0,3 pts/s. El nivell 5 (`fatigueScale = 2,2`) buida la barra en 91 s de marxa ordinària en línia; el nivell 10 (0,8) en 250 s.

**Efectes.**
1. Recàrrega: cada durada de càrrega es multiplica per `1 + mosquet.cansats × (1 − cansament/100)`; amb 0 d'energia, la càrrega triga 1,6 vegades més (`mosquet.cansats = 0,6`).
2. Desordre: als nivells `advanced`, per sota de `desordre.cansatsSota = 25` pts, tot el soroll de desordre es multiplica per `desordre.cansats = 1,8` (`driftK`).
3. Esgotament: als nivells amb `exhaust`, a 0 pts mentre es marxa o es maniobra (excepte Contremarche) la unitat s'atura («Exhaustos») i Lefon es queixa. La marxa no es pot tornar a iniciar per sota de `energia.minMarxa = 15` pts.
4. Avisos: Lefon es queixa per sota de `energia.rondina = 25` i es torna a armar per sobre de `energia.rearma = 50`. Els colors de la barra canvien a `energia.verd = 50` i `energia.groc = 20`.

**On.** `updateStamina`, `driftK`, `loadDur`, `startLoad`, disponibilitat de MA-01; claus `TUNE.energia.*`.

## 4. Ordre i desordre

**Variables.** Cada home té `m.dx, m.dy`, la seva desviació en metres respecte al seu lloc ideal. `disorderRms()` és l'arrel quadràtica mitjana de `sqrt(dx²+dy²)` sobre la unitat. L'ordre mostrat és

`orderPct = round( 100 × max(0, 1 − rms / ordre.rmsZero) )`, amb `ordre.rmsZero = 0,2 m`.

**Què augmenta el desordre.**
1. Els passos de marxa (`driftStep`, un cop per pas, període de pas `60/cadència` s). Per a cada home i eix: `delta = (aleatori − 0,5) × n − desordre.retorn × desviació`, amb `n = desordre.pas × driftK × marchDes`. `marchDes = des(ordre de marxa) × paceMul (1 si és enrere) × (desordre.columna = 0,5 en columna)`; `driftK = level.driftScale × (desordre.cansats si advanced i energia < desordre.cansatsSota)`. L'home es desplaça `delta` i la desviació s'actualitza amb la mateixa quantitat. Valors per defecte: `pas = 0,06`, `retorn = 0,012`.
2. Girs i maniobres (`wheelDrift`, per pas): soroll `(aleatori − 0,5) × (distància al pivot / radi) × desordre.roda × driftK × F` menys el mateix terme de retorn, on `F = des(ordre de maniobra) × paceMul × (desordre.tiradors = 3 en ordre obert)`.
3. Sacsejades puntuals (`jolt`) després d'ordres marcades com a «tret»: cada home es desplaça uniformement dins de `±desordre.cop × des × driftK / 2`.

**Nivell a llarg termini en marxa en línia** (calculat simulant la regla d'actualització; constant de temps d'uns 83 passos, uns 66 s): pas ordinari 0,119 m rms (ordre d'uns 40 %); accelerat 0,19 m (uns 5 %); càrrega 0,27 m (0 %); ordinari en columna 0,064 m (uns 68 %); oblic 0,19 m (uns 4 %); enrere 0,16 m (uns 20 %); nivell 10 ordinari en línia (`driftScale` 0,5) 0,066 m (uns 67 %); ordinari en línia cansat 0,23 m (0 %).

**Què redueix el desordre.** El terme de retorn natural `retorn` atrau cada home 1,2 % de la seva desviació per pas. «Alignement» (CD-03, aturada, en línia, en atenció) porta cada home al seu lloc a `ORD_SPEED` i, quan acaba una maniobra automàtica, totes les desviacions es posen a zero (ordre 100 %) tret que la maniobra mantingui la deriva (les ordres d'espaiat de tiradors ho fan). «Serrez les rangs» (SR-01, marxant en línia) elimina les desviacions proporcionalment durant `moviment.serrezT = 10 s`; qualsevol altra ordre o un halt el cancel·la. Després d'un Alignement els caps es mantenen girats (`co.hdT`) fins a «Fixe!» (CD-03b); `recordatori.fixe = 6 s` després de la parada, i després cada `recordatori.repeteix = 14 s`, la unitat recorda al jugador.

**Llindars (nivells amb `warnDisorder`).**
- Ordre per sota de `ordre.avis = 25 %`: Louis avisa una vegada (missatge de `warnDisorder`); es torna a armar per sobre de `ordre.rearma = 50 %`. L'etiqueta d'ordre passa a «Desordre!».
- Ordre igual o inferior a `ordre.caos = 3 %`: **caos**. Les ordres pendents es cancel·len, una marxa o maniobra s'atura, i es rebutgen totes les ordres excepte Halte, Garde à vous, Alignement, Fixe! i Portez (`CHAOS_OK`). El caos acaba quan l'ordre arriba a `ordre.calma = 85 %` o més (`updateChaos`).
- Colors de la barra a `ordre.verd = 85 %` i `ordre.groc = 60 %`.

**Efecte sobre el foc.** El desordre no afecta directament la precisió del foc. Hi influeix indirectament: la franja de foc es construeix amb les posicions reals dels homes (secció 6), de manera que una línia irregular produeix una franja més ampla i menys regular, i el caos bloqueja les ordres necessàries per disparar. El percentatge d'ordre també compta per a la puntuació (secció 9).

**On.** `driftStep`, `wheelDrift`, `jolt`, `disorderRms`, `orderPct`, `processFix`, `alignement`, `serrezTick`, `updateChaos`, `updateFixeReminder`; claus `TUNE.ordre`, `TUNE.recordatori`, `TUNE.desordre`.

## 5. Visibilitat i línia de visió

**Què bloqueja la visió i les bales.** Només dues llistes del nivell són consultades per `losBlocked(x0, y0, x1, y1)`:
- `level.walls`: rectangles (cases). Un segment que toca el rectangle queda bloquejat (prova de Liang-Barsky).
- `level.cover`: arbres `{x, y, r}`. El segment queda bloquejat quan el seu punt més proper al centre de l'arbre està a menys de `sqrt(mosquet.arbreRadi2) × r` (0,8 del radi; la clau `arbreRadi2 = 0,64` és la fracció al quadrat).

Res més bloqueja: els altres homes no bloquegen la visió; el fum és només cosmètic. Les llistes separades `level.obstacles` i el global `trees` s'usen per a les col·lisions (mort de l'exercici) i per a l'evitació de camins de la IA, no per a la línia de visió.

**On es comprova la visió.**
- Salva del jugador: des de l'origen de la franja fins a cada home enemic (`hitMen`). Un home darrere d'un arbre o d'una paret no pot ser impactat.
- Tret de tirador: des del tirador fins a l'objectiu escollit (`manShot`).
- Regiment enemic estàtic: «veu» el jugador si el segment des del seu centre fins al centre de la unitat és lliure; només es gira cap al jugador si el veu. El seu foc requereix que almenys un dels nostres homes estigui dins la seva franja i amb línia lliure des de l'origen de la franja.
- Bateria: només dispara si el centre de la unitat és dins de `art.abast` i la línia des del canó fins al centre de la unitat és lliure; una bala en vol no és aturada per la cobertura.
- Regiments IA (nivell 10): només els grups amb una línia lliure centre a centre són objectius candidats.

**Memòria de visió de la IA (`aiUnitTick`).** A cada tic el regiment filtra els grups que pot veure. Si en veu alguns, n'escull un i guarda la seva posició a `u.last`. Si no en veu cap però té `u.last`, avança cap a aquell punt i l'oblida quan està a menys de `ia.cercaRadi = 6 m`. Si mai no ha vist res, avança `ia.cercaDist = 30 m` en la seva direcció i s'atura a `ia.holdSenseObj = 3 m` del punt de mira. A l'inici del nivell els austríacs recorden el punt d'inici del jugador i la companyia aliada recorda el costat austríac (es fixa a `onReset`).

**On.** `losBlocked`, `segRect`, `hitMen`, `manShot`, `updateEnemies`, `updateGuns`, `aiUnitTick`; claus `mosquet.arbreRadi2`, `ia.cercaDist`, `ia.cercaRadi`, `ia.holdSenseObj`.

## 6. Foc

### 6.1 Salva de línia («Feu!»)

Disponibilitat: postura `joue` i `co.loaded`. El tret és instantani (els flashos visibles es reparteixen a l'atzar dins de `mosquet.escalf = 0,45 s`, i un 12 % d'ells arriben tard en un factor 1,6: `tardaP`, `tardaK`; són cosmètics).

**Franja de foc** (`makeStrip`, `inStrip`): origen al centre del rengle davanter de la línia, mitja amplada igual a la mitja amplada de la línia més `mosquet.marge = 0,6 m`, semiangle d'obertura `mosquet.obertura = 0,0436 rad` (2,5 graus) a cada costat, longitud `mosquet.abast = 50 m`. Un home és dins si la seva distància al llarg del tret `u` és entre 0 i 50 i el seu desplaçament lateral és dins de `mitja amplada + u × tan(obertura)`.

**Probabilitat que cada home enemic dins la franja caigui** (`dieProb`, `hitMen`):

`p = min( mosquet.maxMort, precisió(u) × factorDeRengle × n ) × protecció`

- `precisió(u) = punteria[0] + (punteria[1] − punteria[0]) × min(1, u / abast)`, per defecte 0,55 a la boca i 0,15 a 50 m.
- `factorDeRengle`: `rengle1 = 1,4` per al rengle davanter de l'objectiu (rengle 0), `rengle2 = 0,4` per al segon rengle.
- `n = nombre de tiradors / 20` (una unitat de 14 homes té `n = 0,7`).
- `maxMort = 0,95`.

Exemples calculats amb `n = 1`, sense protecció: rengle davanter 0,77, 0,49, 0,21 a 0, 25 i 50 m; segon rengle 0,22, 0,14, 0,06.

**Protecció de columna** (`mosquet.escut`): per a cada home dins la franja, es compten els altres homes dins que estan més de `davant = 0,3 m` més a prop de la boca i dins de `ample = 0,6 m` lateralment a la mateixa línia de tret. Amb `b` d'aquests homes, el factor de protecció és 1 si `b <= lliures (1)`, i si no `factor^(b − lliures)` amb `factor = 0,12` (així, 0,12 per a `b = 2`, 0,0144 per a `b = 3`). Només els dos primers homes d'una línia de tret queden completament exposats. La mateixa regla s'aplica als trets enemics contra la nostra columna.

**Foc oblic** (`Joue à droite / à gauche`, `oblAim`): la direcció de la franja és el rumb de la unitat més el costat per `mosquet.oblic = π/4`. Si el centre d'un regiment enemic (dins de `abast + 8 m`) es troba entre el front i aquell límit de 45 graus pel costat escollit, la franja apunta cap al regiment més proper d'aquests. La direcció es neteja després del tret.

**Després de la salva.** Cada home enemic que cau s'elimina de seguida (efecte de cadàver). Un regiment que tingui almenys un home dins la franja guanya `supDescarrega = 0,5` de supressió i un recompte de `volleys`.

### 6.2 Tiradors (ordre obert)

Amb les files obertes (`co.open`) cada home dispara individualment (`manShot`): tria l'home enemic viu més proper davant seu (`u > 0`), dins de `abast`, dins de `tirConAmple = 0,9 rad` del seu rumb i amb visió lliure; si no n'hi ha, no dispara. Cada tret suma `supTret = 0,12` de supressió al regiment objectiu. Probabilitat d'impacte: `(punteria0 + (punteria1 − punteria0) × d/abast) × apuntat (1,3) × (tirRengle2 = 0,6 per a un objectiu del segon rengle)`, sense protecció, resolta després del retard del flaix més `tirImpacteMs = 60`. `level.keepMin` evita que el primer regiment enemic baixi d'aquest nombre. En mode «à volonté» cada home dispara cada 0,8 a 4,3 s quan està carregat. Nota: el con estret `tirCon = 0,17` no s'usa actualment, perquè totes les crides passen el con ampli. El foc de tiradors deixa la bateria en silenci durant 7 s (`g.mute`).

### 6.3 Recàrrega

Per home: `durada de càrrega = carrega × (1 − varia/2 + aleatori × varia) × (1 + cansats × (1 − energia/100))`, és a dir de 15,3 a 20,7 s amb energia plena (`carrega = 18`, `varia = 0,3`), fins a 1,6 vegades més quan està esgotat. El progrés per segon és `ldBoost / durada de càrrega`. «Chargez» (LS-01) inicia tots els homes; la unitat està carregada quan acaba l'home més lent. **Capità Le Jay** (nivell 10): `co.ldBoost = carrega / (carrega − capita.bonus)` = 1,385 mentre el capità és a menys de `capita.dist = 16 m` del centre de la unitat, si no 1 (uns 13 s de mitjana). Va darrere la unitat a 7 m.

### 6.4 Supressió i pressió

Cada regiment enemic té `supp` entre 0 i 1. Puja en `supDescarrega` (0,5) per cada salva que l'arriba, `supTret` (0,12) per cada tret de tirador i `supDescarrega × ia.supFrac (0,6)` per cada salva de la IA. Baixa `supDecau = 0,06` per segon. Mentre `supp > supMax (0,5)` el regiment no dispara. Per sota d'aquest valor, la seva força de salva es multiplica per `(1 − supp)` (IA: `1 − min(ia.supMax = 0,9, supp)`). La targeta del cursor mostra «sense pressió», «pressió lleu» a partir de 0,05, «sota pressió» a partir de 0,2 i «clavats a terra» a partir de `supMax`.

### 6.5 Regiment enemic estàtic (`updateEnemies`)

1. Comença amb `reload = mosquet.enInici = 4 s`; la recàrrega després compta enrere.
2. S'alerta quan se li ha disparat (`volleys > 0`) o quan veu la unitat dins de `enAlerta = 30 m`. Un cop alerta i veient la unitat, es gira cap a ella a un màxim de `enGir = 0,17 rad/s`.
3. La seva franja usa l'obertura `enOberta = 0,14 rad` (8 graus) i el mateix abast `abast`.
4. Si cap dels nostres homes és dins la franja amb línia lliure, el seu temporitzador d'apuntar es reinicia. Si està carregant o clavat (`supp > supMax`), el temporitzador es manté com a màxim a `enAvis / 2`. Si no, el temporitzador corre i, després de `enAvis = 5 s`, dispara.
5. La seva salva usa `n = homes/20 × enPunteria (0,45) × (1 − supp)` contra els nostres homes amb les mateixes regles de `hitMen`, i després `reload = enRecarrega = 32 s`.
6. Si la nostra força baixa de `level.minMen`, la unitat és destrossada (secció 9).

**Baioneta** (arma `croise`): si un home nostre és a menys de 1,0 m d'un home enemic i una salva ja hi havia impactat, cada home enemic viu mor amb probabilitat 0,5 i la resta fuig (aquestes dues xifres són encara literals a `updateBayonet`).

**Bateria** (`updateGuns`): dispara quan el centre de la unitat és a menys de `art.abast = 65 m` amb visió lliure, gira a `art.gir = 0,3 rad/s`, s'ha d'alinear dins de `art.tol = 0,06 rad`, apunta durant `art.apunta = 2 s` i després dispara amb un error de punteria uniforme de ±`errLong = 7 m` en llargada i ±`errLat = 2,5 m` en amplada. La bala es mou a `art.vel = 90 m/s`, toca terra `art.rasant = 8 m` abans del punt de mira, i després frena a `art.frena = 60 m/s²` fins a com a mínim `art.velMin = 25 m/s`, i rodola `art.rebot = 45 m` més. Després de tocar terra mata qualsevol dels nostres homes a menys de `art.ample = 0,35 m` de la seva trajectòria. Recàrrega `art.recarrega = 12 s` (o `g.rt`).

**On.** `fire/feu`, `feuTiradors`, `manShot`, `makeStrip`, `inStrip`, `dieProb`, `hitMen`, `oblAim`, `loadDur`, `startLoad`, `updateMusket`, `updateEnemies`, `enemyVolley`, `updateBayonet`, `updateGuns`; claus `TUNE.mosquet.*`, `TUNE.art.*`, `TUNE.capita.*`.

## 7. IA enemiga i aliada (nivell 10)

Funcions `aiTickAll`, `aiUnitTick`, `aiVolley`, `aiGroups`, `aiAvoid`. Actives quan el pas del tutorial és 2 o més i fins que els austríacs es retiren. Els austríacs lluiten contra el jugador i la companyia aliada; la companyia aliada lluita contra els austríacs.

**Elecció d'objectiu.** Entre els grups visibles guanya la puntuació més baixa: `distància − flanc (10 si el grup mostra el flanc, angle superior a 0,9 rad) − feble (4 si té menys de 12 homes) − jugador (8 si és el jugador)`. Claus `ia.flanc, flancBonus, feble, febleBonus, jugadorBonus`.

**Moviment.** Distància de tenir-lo a tret `u.hold` per regiment (33 m i 35 m per als austríacs, 30 m per als aliats; definit al nivell). El regiment es dirigeix cap a l'objectiu, desplaçat per l'angle `u.off` (±0,3 rad) mentre és més lluny de `hold + ia.holdMarge (8 m)`. Gira a `ia.girMarxa = 0,3 rad/s` mentre s'aproxima i a `enGir × ia.girParat = 0,27 rad/s` un cop és dins de la distància de tenir-lo a tret. Camina al pas ordinari (0,823 m/s) només si és més lluny que `hold` i dins de `ia.tolMarxa = 0,5 rad` del rumb desitjat. Obstacles: tres punts de sonda davant (5 m i 9 m, 3,2 m a cada costat, marge 1,2 m) disparen un gir a 0,55 rad/s a 0,6 de la velocitat ordinària; un regiment encallat més de 9 s ignora l'evitació durant 5 s (`ia.evita`).

**Foc.** Condicions: un objectiu, distància com a màxim `ia.abast = 42 m`, recàrrega acabada, `supp <= supMax` i almenys `max(ia.minHomes = 3, ia.minFraccio = 0,3 × homes de l'objectiu)` homes de l'objectiu dins la seva franja amb línia lliure. El temporitzador d'apuntar ha d'arribar a `ia.apunta = 2,5 s`. Força de la salva: `n = homes/20 × (0,7 austríac, 1,0 francès) × (1 − min(0,9, supp))`, mateixes regles de `hitMen` i obertura de franja `enOberta`. Recàrrega `carrega × (0,85 + aleatori × 0,5)` = de 15,3 a 24,3 s. Un impacte sobre el jugador mata homes amb un missatge de Louis; sobre un grup aliat o austríac mata homes i suma `supDescarrega × 0,6` de supressió.

**Retirada al 50 %.** En el tic del nivell: quan els homes vius austríacs baixen a `ia.retirada.mitja = 0,5` del total inicial, cada regiment austríac passa a `state = 'retreat'`, es gira per allunyar-se del jugador a 1,2 rad/s (`retirada.gir`) i, quan és a menys de 0,06 rad d'aquest rumb, s'allunya caminant al pas accelerat (1,083 m/s). Els regiments en retirada ja no disparen i no són objectius vàlids. El nivell es guanya 7 s després que comenci la retirada.

**Desbandada.** `routEnemy` (baioneta) fa fugir tots els supervivents a 3,2 a 5,2 m/s durant 4 s i marca el regiment com a desbandat.

## 8. Punts de control i mort

**Punt de control (`tutSnap`).** Quan comença un pas del tutorial (es tanca el seu diàleg, o es mostra la seva pista petita), si el pas no té una seqüència guiada i la unitat no és en una conversió, un gir, una maniobra automàtica, un par file, un gir de flanc, un alineament o una ordre pendent, el joc guarda una còpia profunda de la unitat (`co`), dels enemics, dels aliats, dels canons i dels cadàvers a `TUT.snap`, marcada amb el número de pas. `canRetry()` és cert quan hi ha un punt de control per al pas actual; el botó del menú «Repetir el pas» i la pista d'encallament (després de 35 s aturada) l'usen.

**Restauració (`snapRestore`).** Reemplaça la unitat, els enemics, els aliats, els canons i els cadàvers per la còpia; esborra l'ordre pendent, les bales de canó i els efectes, i reinicia `co.lost`. **No** reinicia els comptadors de puntuació `STAT`, de manera que el temps, les ordres i les baixes ja produïdes abans del reintent continuen comptant.

**Mort (`deathRetry(msg)`).** Es crida quan la unitat toca un obstacle o un arbre, o quan és destrossada (homes per sota de `level.minMen`, després de `mort.destrossadaMs = 2600 ms`). Si hi ha un punt de control per al pas actual es restaura, si no el nivell es reinicia al seu inici (`reset()`, que manté el progrés del tutorial però no l'estat de la unitat). Es mostra un missatge i la frase de Le Jay «Ho tornem a provar». `STAT` només es buida quan el nivell es (re)inicia des del menú.

## 9. Puntuació i rànquing

`STAT` s'acumula mentre la pantalla de joc és activa i el joc no és en pausa ni en un diàleg: `STAT.t` (segons), `STAT.oSum` (la suma de `orderPct × dt`), `STAT.ord` (ordres executades), `STAT.dead` (homes propis morts) i `STAT.men0` (homes a l'inici).

`scoreCalc(n)` dona quatre parts de `puntuacio.part = 250` punts cada una, 1000 en total:

| Part | Fórmula |
| --- | --- |
| Temps | `250 × lin(STAT.t, ref.t)` |
| Baixes | `250 × max(0, 1 − dead / men0)` |
| Ordres | `250 × lin(STAT.ord, ref.o)` |
| Ordre mitjà | `250 × clamp(mitjana / 100, 0, 1)`, mitjana = `oSum / t` |

`lin(v, ref) = clamp( 1 − (v − ref) / (puntuacio.marge × ref) , 0 , 1 )` amb `marge = 2`: punts complets a la referència o per sota, zero a tres vegades la referència. Cada part s'arrodoneix per separat.

`SCORE_REF` (segons, ordres) per nivell: 1 (90, 12); 2 (100, 14); 3 (110, 16); 4 (140, 20); 5 (200, 25); 6 (120, 14); 7 (150, 20); 8 (170, 30); 9 (150, 10); 10 (300, 35). Els nivells que no hi són usen (150, 20). La puntuació es mostra en completar el nivell (`scoreShow`).

## 10. Notes de verificació i límits

- Experiments fets: els dos bots de regressió (nivell 8 i nivell 9 sense veu) acaben sense errors; una comparació amb llavor i avançament de fotogrames entre les versions 1.7.7 i 1.7.8 als nivells 7 i 10 va donar estats idèntics (posicions, baixes, supressió, puntuació); les xifres d'estat estable de la deriva surten de simular només la regla d'actualització, no del joc.
- Constants que encara són literals al codi (cosmètiques o molt locals): la distància de contacte de la baioneta (1,0 m) i la probabilitat de mort (0,5), les velocitats de fuga dels homes que fugen, el desplaçament de seguiment del capità (7 m) i el seu suavitzat, el temps del flaix «OK», els llindars de pressió de la targeta (0,05, 0,2), la pista d'encallament de 35 s, la tolerància de 0,003 m que acaba un alineament, i els detalls de Liang-Barsky.
- No mesurat en joc real: l'efecte de `escalf` (cosmètic) i qualsevol interacció entre els gestors `onVolley` propis d'un nivell i les regles de dalt.
