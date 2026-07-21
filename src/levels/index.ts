import { compileLevel } from '../dsl/parse'
import fusible from './01-fusible.tla?raw'
import cambriolage from './02-cambriolage.tla?raw'
import mutex from './03-mutex.tla?raw'
import fusibleSur from './04-fusible-sur.tla?raw'
import mutexCorrige from './05-mutex-corrige.tla?raw'
import peterson from './06-peterson.tla?raw'

/** La campagne : chapitre « casser » (trace), puis chapitre « prouver ». */
export const levels = [fusible, cambriolage, mutex, fusibleSur, mutexCorrige, peterson].map(
  compileLevel,
)
