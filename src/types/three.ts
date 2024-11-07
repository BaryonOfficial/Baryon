import { Audio } from 'three'

declare module 'three' {
  interface Audio {
    started: boolean
  }
} 