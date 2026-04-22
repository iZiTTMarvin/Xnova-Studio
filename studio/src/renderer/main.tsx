import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const container = document.getElementById('app')

if (!container) {
  throw new Error('未找到 renderer 根节点 "#app"。')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
