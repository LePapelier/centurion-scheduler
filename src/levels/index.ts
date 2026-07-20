import { compileLevel } from '../dsl/parse'
import fusible from './01-fusible.tla?raw'
import mutex from './02-mutex.tla?raw'
import fusibleSur from './03-fusible-sur.tla?raw'
import mutexCorrige from './04-mutex-corrige.tla?raw'
import peterson from './05-peterson.tla?raw'

/** La campagne : l'adversaire d'abord (casser), la preuve ensuite (blinder). */
export const levels = [fusible, mutex, fusibleSur, mutexCorrige, peterson].map(compileLevel)
