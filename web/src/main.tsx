import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

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
