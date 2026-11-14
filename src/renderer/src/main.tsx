import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Api } from '../../shared/types.ts'
import { App } from './App.tsx'
import './styles.css'

declare global {
  interface Window {
    share97: Api
  }
}

document.documentElement.lang = navigator.language

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
