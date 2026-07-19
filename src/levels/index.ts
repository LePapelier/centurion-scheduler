import { compileLevel } from '../dsl/parse'
import fusible from './01-fusible.tla?raw'
import mutex from './02-mutex.tla?raw'
import compteur from './03-compteur.tla?raw'
import verrous from './04-verrous.tla?raw'
import enversMutex from './05-envers-mutex.tla?raw'
import tablee from './06-tablee.tla?raw'
import repareMutex from './07-repare-mutex.tla?raw'
import cercle from './08-cercle.tla?raw'

/** La campagne, dans l'ordre du tuto. */
export const levels = [
  fusible,
  mutex,
  compteur,
  verrous,
  enversMutex,
  tablee,
  repareMutex,
  cercle,
].map(compileLevel)
