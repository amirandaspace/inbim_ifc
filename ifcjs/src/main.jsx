import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { SelectionProvider } from './contexts/SelectionContext.jsx' // 已更新为 .jsx

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SelectionProvider>
      <App />
    </SelectionProvider>
  </StrictMode>,
)