import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './cores-theme.css'
import App from './App'
import { initSuiteI18n, pairSuiteTranslations } from './lib/cores-design'
import de from './lib/cores-locales/de.json'
import en from './lib/cores-locales/en.json'

initSuiteI18n(pairSuiteTranslations(de, en))

document.addEventListener('wheel', (event) => {
  const target = event.target
  if (target instanceof HTMLInputElement && target.type === 'number' && document.activeElement === target) {
    target.blur()
  }
}, { capture: true, passive: true })

const standaloneQuery = window.matchMedia('(display-mode: standalone)')
const syncDisplayMode = () => {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  document.documentElement.classList.toggle(
    'is-standalone',
    standaloneQuery.matches || navigatorWithStandalone.standalone === true,
  )
}

syncDisplayMode()
standaloneQuery.addEventListener?.('change', syncDisplayMode)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
