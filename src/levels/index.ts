import { compileLevel } from '../dsl/parse'
import mutexSrc from './mutex.tla?raw'

export const levels = [compileLevel(mutexSrc)]
