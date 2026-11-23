import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Api } from '../../shared/types.ts'
import { App } from './App.tsx'
import { Crash } from './Crash.tsx'
import { dir, lang } from './i18n.ts'
import './styles.css'

declare global {
  interface Window {
    share97: Api
  }
}

document.documentElement.lang = lang
document.documentElement.dir = dir

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
)
